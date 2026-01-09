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

# 历史记录保存目录
HISTORY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history")
# 模板保存目录
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

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
        else:
            self._send_error(404, "Not Found")
    
    def do_GET(self):
        if self.path == "/api/history/list":
            self._handle_list()
        elif self.path == "/api/templates/list":
            self._handle_template_list()
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
                self._save_base64_image(data["originalImage"], os.path.join(record_dir, "original_image.png"))
            
            # 保存生成图片
            if data.get("generatedImage"):
                self._save_base64_image(data["generatedImage"], os.path.join(record_dir, "generated_image.png"))
            
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
    
    def _save_base64_image(self, base64_data: str, file_path: str):
        # 移除 data:image/xxx;base64, 前缀
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        image_data = base64.b64decode(base64_data)
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
