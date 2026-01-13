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
            // Also save to localStorage as backup
            localStorage.setItem('gemini_workflows', JSON.stringify(workflows));
            return { success: true };
        } catch (error: any) {
            // Fallback to localStorage if server is not available
            localStorage.setItem('gemini_workflows', JSON.stringify(workflows));
            return { success: true };
        }
    }
}

export const historyService = HistoryService.getInstance();
