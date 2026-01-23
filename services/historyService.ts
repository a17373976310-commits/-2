/**
 * 历史记录服务 - 调用本地 Python 服务保存历史
 */

const HISTORY_API_BASE = "http://localhost:5001";

export interface HistoryRecord {
    timestamp: string;
    model: string;
    ratio: string;
    nodeType: string;
    hasOriginalImage: boolean;
    hasGeneratedImage: boolean;
    originalPrompt: string;
    optimizedPrompt: string;
    folderName?: string;
}

export interface SaveHistoryParams {
    originalImage?: string;        // base64
    generatedImage?: string;       // base64
    originalPrompt: string;
    optimizedPrompt?: string;
    model: string;
    ratio?: string;
    nodeType: string;
}

class HistoryService {
    private static instance: HistoryService;

    private constructor() { }

    static getInstance(): HistoryService {
        if (!HistoryService.instance) {
            HistoryService.instance = new HistoryService();
        }
        return HistoryService.instance;
    }

    /**
     * 保存历史记录到本地
     */
    async saveRecord(params: SaveHistoryParams): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/history/save`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || "保存失败" };
            }

            const result = await response.json();
            return { success: true, path: result.path };
        } catch (error: any) {
            // 如果服务未启动，返回友好提示
            if (error.message?.includes("Failed to fetch")) {
                return {
                    success: false,
                    error: "历史服务未启动，请运行 history_server.py"
                };
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取历史记录列表
     */
    async getRecords(): Promise<HistoryRecord[]> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/history/list`);
            if (!response.ok) {
                throw new Error("获取历史记录失败");
            }
            const data = await response.json();
            return data.records || [];
        } catch (error) {
            console.warn("无法获取历史记录:", error);
            return [];
        }
    }

    /**
     * 获取历史记录中的文件 URL
     */
    getFileUrl(folderName: string, filename: string): string {
        return `${HISTORY_API_BASE}/api/history/files/${folderName}/${filename}`;
    }

    /**
     * 获取所有提示词模板
     */
    async getTemplates(): Promise<{ name: string; content: string }[]> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/templates/list`);
            if (!response.ok) throw new Error("获取模板失败");
            const data = await response.json();
            return data.templates || [];
        } catch (error) {
            console.warn("无法获取模板:", error);
            return [];
        }
    }

    /**
     * 保存提示词模板
     */
    async saveTemplate(name: string, content: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/templates/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, content }),
            });
            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || "保存失败" };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 删除提示词模板
     */
    async deleteTemplate(name: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/templates/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || "删除失败" };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取所有工作流
     */
    async getWorkflows(): Promise<any[]> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/workflows/list`);
            if (!response.ok) throw new Error("获取工作流失败");
            const data = await response.json();
            return data.workflows || [];
        } catch (error) {
            console.warn("无法获取工作流:", error);
            // Fallback to localStorage
            const saved = localStorage.getItem('gemini_workflows');
            return saved ? JSON.parse(saved) : [];
        }
    }

    /**
     * 清理工作流数据中的大型 base64 图片，避免 localStorage 爆掉
     */
    private cleanWorkflowForStorage(workflow: any): any {
        if (!workflow || !workflow.nodes) return workflow;

        return {
            ...workflow,
            nodes: workflow.nodes.map((node: any) => ({
                ...node,
                data: {
                    ...node.data,
                    // 清除所有可能的 base64 图片字段
                    result: undefined,
                    referenceImage: undefined,
                    backgroundImage: undefined,
                    generatedImages: undefined,
                    sourceImages: undefined,
                    slicedImages: undefined,
                    svgPreview: undefined,
                    imageUrl: undefined,
                }
            }))
        };
    }

    /**
     * 保存工作流
     */
    async saveWorkflows(workflows: any[]): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(`${HISTORY_API_BASE}/api/workflows/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows }),
            });
            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || "保存失败" };
            }
            // 保存轻量版本到 localStorage 作为备份（只保留最近2个，去除图片数据）
            const lightWorkflows = workflows.slice(0, 2).map(w => this.cleanWorkflowForStorage(w));
            try {
                localStorage.setItem('gemini_workflows', JSON.stringify(lightWorkflows));
            } catch (e) {
                // 如果还是太大，清空 localStorage
                console.warn('localStorage 存储失败，清空缓存');
                localStorage.removeItem('gemini_workflows');
            }
            return { success: true };
        } catch (error: any) {
            // Fallback to localStorage if server is not available（同样使用轻量版本）
            const lightWorkflows = workflows.slice(0, 2).map(w => this.cleanWorkflowForStorage(w));
            try {
                localStorage.setItem('gemini_workflows', JSON.stringify(lightWorkflows));
            } catch (e) {
                console.warn('localStorage 存储失败，清空缓存');
                localStorage.removeItem('gemini_workflows');
            }
            return { success: true };
        }
    }
}

export const historyService = HistoryService.getInstance();
