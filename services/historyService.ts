/**
 * 历史记录服务 - 调用本地 Python 服务保存历史
 */

// 支持从环境变量或全局变量配置 API 地址
const HISTORY_API_BASE = (typeof window !== 'undefined' && (window as any).__HISTORY_API_BASE__)
    || import.meta.env.VITE_HISTORY_API_BASE
    || "http://localhost:5001";

// 请求超时时间（毫秒）
const DEFAULT_TIMEOUT = 60000;

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

// 错误类型枚举
export enum HistoryServiceErrorType {
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    SERVICE_ERROR = 'SERVICE_ERROR',
    SERVER_ERROR = 'SERVER_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// 错误信息接口
export interface HistoryServiceError {
    type: HistoryServiceErrorType;
    message: string;
    originalError?: any;
}

/**
 * 带超时的 fetch 请求
 */
const fetchWithTimeout = async (
    url: string,
    options: RequestInit = {},
    timeout = DEFAULT_TIMEOUT
): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * 解析错误，分类处理
 */
const parseError = (error: any): HistoryServiceError => {
    // 超时错误
    if (error.name === 'AbortError' || error.message?.includes('abort')) {
        return {
            type: HistoryServiceErrorType.TIMEOUT_ERROR,
            message: '请求超时，请检查历史服务是否正常运行',
            originalError: error,
        };
    }

    // 网络错误
    if (error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('net::ERR_CONNECTION_REFUSED') ||
        error.message?.includes('fetch failed')) {
        return {
            type: HistoryServiceErrorType.NETWORK_ERROR,
            message: '历史服务未启动，请运行 history_server.py',
            originalError: error,
        };
    }

    // 服务返回的错误（HTTP 状态码非 2xx）
    if (error.type === HistoryServiceErrorType.SERVER_ERROR) {
        return error;
    }

    // 未知错误
    return {
        type: HistoryServiceErrorType.UNKNOWN_ERROR,
        message: error.message || '发生未知错误',
        originalError: error,
    };
};

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
    async saveRecord(params: SaveHistoryParams): Promise<{
        success: boolean;
        path?: string;
        error?: string;
        errorType?: HistoryServiceErrorType;
    }> {
        try {
            const response = await fetchWithTimeout(
                `${HISTORY_API_BASE}/api/history/save`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(params),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
                const error: HistoryServiceError = {
                    type: HistoryServiceErrorType.SERVER_ERROR,
                    message: errorData.error || `服务错误 (${response.status})`,
                };
                return {
                    success: false,
                    error: error.message,
                    errorType: error.type,
                };
            }

            const result = await response.json();
            return { success: true, path: result.path };
        } catch (error: any) {
            const parsedError = parseError(error);
            console.warn('[HistoryService] 保存记录失败:', parsedError);
            return {
                success: false,
                error: parsedError.message,
                errorType: parsedError.type,
            };
        }
    }

    /**
     * 获取历史记录列表
     */
    async getRecords(): Promise<HistoryRecord[]> {
        try {
            const response = await fetchWithTimeout(`${HISTORY_API_BASE}/api/history/list`);
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
            const response = await fetchWithTimeout(`${HISTORY_API_BASE}/api/templates/list`);
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
    async saveTemplate(name: string, content: string): Promise<{
        success: boolean;
        error?: string;
        errorType?: HistoryServiceErrorType;
    }> {
        try {
            const response = await fetchWithTimeout(
                `${HISTORY_API_BASE}/api/templates/save`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, content }),
                }
            );
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: "保存失败" }));
                return {
                    success: false,
                    error: error.error || "保存失败",
                    errorType: HistoryServiceErrorType.SERVER_ERROR,
                };
            }
            return { success: true };
        } catch (error: any) {
            const parsedError = parseError(error);
            return {
                success: false,
                error: parsedError.message,
                errorType: parsedError.type,
            };
        }
    }

    /**
     * 删除提示词模板
     */
    async deleteTemplate(name: string): Promise<{
        success: boolean;
        error?: string;
        errorType?: HistoryServiceErrorType;
    }> {
        try {
            const response = await fetchWithTimeout(
                `${HISTORY_API_BASE}/api/templates/delete`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                }
            );
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: "删除失败" }));
                return {
                    success: false,
                    error: error.error || "删除失败",
                    errorType: HistoryServiceErrorType.SERVER_ERROR,
                };
            }
            return { success: true };
        } catch (error: any) {
            const parsedError = parseError(error);
            return {
                success: false,
                error: parsedError.message,
                errorType: parsedError.type,
            };
        }
    }

    /**
     * 获取所有工作流
     */
    async getWorkflows(): Promise<any[]> {
        try {
            const response = await fetchWithTimeout(`${HISTORY_API_BASE}/api/workflows/list`);
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
    async saveWorkflows(workflows: any[]): Promise<{
        success: boolean;
        error?: string;
        errorType?: HistoryServiceErrorType;
    }> {
        try {
            const response = await fetchWithTimeout(
                `${HISTORY_API_BASE}/api/workflows/save`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workflows }),
                }
            );
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: "保存失败" }));
                return {
                    success: false,
                    error: error.error || "保存失败",
                    errorType: HistoryServiceErrorType.SERVER_ERROR,
                };
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
