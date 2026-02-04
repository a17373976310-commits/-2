"""
历史记录本地保存服务
启动后监听 http://localhost:5001
用于保存图像生成的历史记录到本地文件夹
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import base64
import os
from datetime import datetime
from urllib.parse import parse_qs
import mimetypes
import socketserver
import urllib.request
import ssl

# 历史记录保存目录
HISTORY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history")
# 模板保存目录
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
# 工作流保存目录
WORKFLOWS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workflows")
WORKFLOWS_FILE = os.path.join(WORKFLOWS_DIR, "workflows.json")

class HistoryHandler(BaseHTTPRequestHandler):
    
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
    
    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()
    
    def do_POST(self):
        if self.path == "/api/history/save":
            self._handle_save()
        elif self.path == "/api/templates/save":
            self._handle_template_save()
        elif self.path == "/api/templates/delete":
            self._handle_template_delete()
        elif self.path == "/api/workflows/save":
            self._handle_workflow_save()
        else:
            self._send_error(404, "Not Found")
    
    def do_GET(self):
        if self.path == "/api/history/list":
            self._handle_list()
        elif self.path == "/api/templates/list":
            self._handle_template_list()
        elif self.path == "/api/workflows/list":
            self._handle_workflow_list()
        elif self.path.startswith("/api/prompts/get"):
            self._handle_prompt_get()
        elif self.path.startswith("/api/history/files/"):
            self._handle_serve_file()
        else:
            self._send_error(404, "Not Found")
    
    def _handle_save(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # 创建时间戳文件夹
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            record_dir = os.path.join(HISTORY_DIR, timestamp)
            os.makedirs(record_dir, exist_ok=True)
            
            # 保存原始图片
            if data.get("originalImage"):
                self._save_image(data["originalImage"], os.path.join(record_dir, "original_image.png"))
            
            # 保存生成图片
            if data.get("generatedImage"):
                self._save_image(data["generatedImage"], os.path.join(record_dir, "generated_image.png"))
            
            # 保存提示词
            prompts_content = f"""原始提示词:
{data.get("originalPrompt", "")}

========================================

优化后的提示词:
{data.get("optimizedPrompt", data.get("originalPrompt", ""))}

========================================

模型: {data.get("model", "未知")}
比例: {data.get("ratio", "1:1")}
时间: {timestamp}
"""
            with open(os.path.join(record_dir, "prompts.txt"), "w", encoding="utf-8") as f:
                f.write(prompts_content)
            
            # 保存元数据 JSON
            metadata = {
                "timestamp": timestamp,
                "model": data.get("model", ""),
                "ratio": data.get("ratio", "1:1"),
                "nodeType": data.get("nodeType", ""),
                "hasOriginalImage": bool(data.get("originalImage")),
                "hasGeneratedImage": bool(data.get("generatedImage")),
                "originalPrompt": data.get("originalPrompt", ""),
                "optimizedPrompt": data.get("optimizedPrompt", "")
            }
            with open(os.path.join(record_dir, "metadata.json"), "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            self._send_json({"success": True, "path": record_dir})
            print(f"✓ 历史记录已保存: {record_dir}")
            
        except Exception as e:
            self._send_error(500, str(e))
    
    def _handle_list(self):
        try:
            records = []
            if os.path.exists(HISTORY_DIR):
                for folder in sorted(os.listdir(HISTORY_DIR), reverse=True):
                    folder_path = os.path.join(HISTORY_DIR, folder)
                    metadata_path = os.path.join(folder_path, "metadata.json")
                    if os.path.isdir(folder_path) and os.path.exists(metadata_path):
                        with open(metadata_path, "r", encoding="utf-8") as f:
                            metadata = json.load(f)
                            metadata["folderName"] = folder
                            records.append(metadata)
            self._send_json({"records": records})
        except Exception as e:
            self._send_error(500, str(e))
    
    def _handle_template_list(self):
        try:
            templates = []
            if os.path.exists(TEMPLATES_DIR):
                for filename in sorted(os.listdir(TEMPLATES_DIR)):
                    if filename.endswith((".txt", ".md")):
                        file_path = os.path.join(TEMPLATES_DIR, filename)
                        with open(file_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        templates.append({
                            "name": filename,
                            "content": content
                        })
            self._send_json({"templates": templates})
        except Exception as e:
            self._send_error(500, str(e))

    def _handle_template_save(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            name = data.get("name")
            content = data.get("content")
            
            if not name or not content:
                return self._send_error(400, "Name and content are required")
            
            if not name.endswith((".txt", ".md")):
                name += ".txt"
            
            os.makedirs(TEMPLATES_DIR, exist_ok=True)
            file_path = os.path.join(TEMPLATES_DIR, name)
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            
            self._send_json({"success": True, "name": name})
            print(f"✓ 模板已保存: {name}")
        except Exception as e:
            self._send_error(500, str(e))

    def _handle_template_delete(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            name = data.get("name")
            if not name:
                return self._send_error(400, "Name is required")
            
            file_path = os.path.join(TEMPLATES_DIR, name)
            if os.path.exists(file_path):
                os.remove(file_path)
                self._send_json({"success": True})
                print(f"✗ 模板已删除: {name}")
            else:
                self._send_error(404, "Template not found")
        except Exception as e:
            self._send_error(500, str(e))

    def _handle_workflow_list(self):
        """获取所有保存的工作流"""
        try:
            if os.path.exists(WORKFLOWS_FILE):
                with open(WORKFLOWS_FILE, "r", encoding="utf-8") as f:
                    workflows = json.load(f)
            else:
                workflows = []
            self._send_json({"workflows": workflows})
        except Exception as e:
            self._send_error(500, str(e))
    
    def _handle_workflow_save(self):
        """保存工作流列表"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            workflows = data.get("workflows", [])
            
            os.makedirs(WORKFLOWS_DIR, exist_ok=True)
            with open(WORKFLOWS_FILE, "w", encoding="utf-8") as f:
                json.dump(workflows, f, ensure_ascii=False, indent=2)
            
            self._send_json({"success": True, "count": len(workflows)})
            print(f"✓ 工作流已保存: 共 {len(workflows)} 个")
        except Exception as e:
            self._send_error(500, str(e))

    def _handle_prompt_get(self):
        """获取提示词模板"""
        try:
            from prompts import PROMPTS
            query = parse_qs(self.path.split('?')[1]) if '?' in self.path else {}
            name = query.get('name', [None])[0]
            
            if not name:
                self._send_json({"prompts": PROMPTS})
            elif name in PROMPTS:
                self._send_json({"prompt": PROMPTS[name]})
            else:
                self._send_error(404, f"Prompt template '{name}' not found")
        except ImportError:
            self._send_error(500, "prompts.py not found on server")
        except Exception as e:
            self._send_error(500, str(e))

    def _handle_serve_file(self):
        try:
            # 路径格式: /api/history/files/{folder}/{filename}
            parts = self.path.split("/api/history/files/")[1].split("/")
            if len(parts) >= 2:
                folder = parts[0]
                filename = parts[1]
                file_path = os.path.join(HISTORY_DIR, folder, filename)
                
                if os.path.exists(file_path):
                    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
                    with open(file_path, "rb") as f:
                        content = f.read()
                    self.send_response(200)
                    self._send_cors_headers()
                    self.send_header("Content-Type", mime_type)
                    self.send_header("Content-Length", len(content))
                    # 增加缓存头，缓存 1 天
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.end_headers()
                    self.wfile.write(content)
                    return
            
            self._send_error(404, "File not found")
        except Exception as e:
            self._send_error(500, str(e))
    
    def _save_image(self, data_or_url: str, file_path: str):
        if data_or_url.startswith(("http://", "https://")):
            # 下载 URL 图片
            print(f"  ⬇️ 正在下载图片: {data_or_url}")
            try:
                # 忽略 SSL 证书错误 (针对某些代理)
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                
                # 添加浏览器请求头，避免 403 Forbidden
                req = urllib.request.Request(data_or_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://webstatic.aiproxy.vip/'
                })
                
                with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
                    image_data = response.read()
                    with open(file_path, "wb") as f:
                        f.write(image_data)
                print(f"  ✓ 下载完成: {file_path}")
            except Exception as e:
                print(f"  ✗ 下载失败: {str(e)}")
                # 如果下载失败，保存 URL 文本作为备忘（不抛出异常，让流程继续）
                try:
                    with open(file_path + ".url.txt", "w") as f:
                        f.write(data_or_url)
                except:
                    pass  # 静默忽略文件写入错误
        else:
            # 处理 base64
            if "," in data_or_url:
                data_or_url = data_or_url.split(",")[1]
            image_data = base64.b64decode(data_or_url)
            with open(file_path, "wb") as f:
                f.write(image_data)
    
    def _send_json(self, data):
        response = json.dumps(data, ensure_ascii=False)
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))
    
    def _send_error(self, code, message):
        self.send_response(code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode("utf-8"))
    
    def log_message(self, format, *args):
        # 简化日志输出
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


class ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True

def main():
    os.makedirs(HISTORY_DIR, exist_ok=True)
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    os.makedirs(WORKFLOWS_DIR, exist_ok=True)
    
    server = ThreadingHTTPServer(("localhost", 5001), HistoryHandler)
    print("=" * 50)
    print("📁 历史记录服务已启动 (多线程模式)")
    print(f"📍 监听地址: http://localhost:5001")
    print(f"💾 保存目录: {HISTORY_DIR}")
    print("=" * 50)
    print("按 Ctrl+C 停止服务")
    print()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
