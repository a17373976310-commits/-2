
import React, { useState, useRef, useEffect } from 'react';
import { AppNode, ApiConfig, ApiProvider } from '../types';
import { apiService } from '../services/ApiService';
import { logger } from '../services/loggerService';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    files?: string[];
}

interface AIChatUIProps {
    node: AppNode;
    allNodes: AppNode[];
    onUpdate: (id: string, data: any) => void;
    apiConfig: ApiConfig;
    isPaused?: boolean;
    globalCategoryModel?: string;
}

export const AIChatUI: React.FC<AIChatUIProps> = ({
    node, allNodes, onUpdate, apiConfig, isPaused, globalCategoryModel
}) => {
    const [loading, setLoading] = useState(false);
    const [input, setInput] = useState('');
    const [pendingFiles, setPendingFiles] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const messages: Message[] = node.data.messages || [];
    const sourceNode = allNodes.find(n => n.id === node.data.sourceNodeId);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (prev) => {
                const base64 = prev.target?.result as string;
                setPendingFiles(prev => [...prev, base64]);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleSend = async () => {
        if (isPaused) {
            logger.warn('任务已暂停');
            return;
        }
        if (!input.trim() && pendingFiles.length === 0) return;

        const userMsg: Message = {
            role: 'user',
            content: input.trim(),
            files: pendingFiles.length > 0 ? pendingFiles : undefined
        };

        const newMessages = [...messages, userMsg];
        onUpdate(node.id, { ...node.data, messages: newMessages });
        setInput('');
        setPendingFiles([]);
        setLoading(true);

        try {
            const providerId = apiConfig.defaultProviderId;
            const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];

            // Context inheritance logic
            let context = "";
            if (sourceNode) {
                const sourceResult = sourceNode.data.result || sourceNode.data.results;
                context = `\n[Context from ${sourceNode.titleZh}]: ${JSON.stringify(sourceResult)}\n`;
            }

            // Prepare history for API
            const history = newMessages.map(m => ({
                role: m.role,
                content: m.content
            }));

            // Add context to the last message for the API call
            const lastMsgContent = context + userMsg.content;

            const response = await apiService.chatPro(
                lastMsgContent,
                globalCategoryModel || 'gemini-3-flash-preview',
                provider,
                userMsg.files, // Pass files if any
                node.data.promptEngineering
            );

            const assistantMsg: Message = { role: 'assistant', content: response };
            onUpdate(node.id, { ...node.data, messages: [...newMessages, assistantMsg] });
        } catch (err: any) {
            logger.error('对话失败: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const clearHistory = () => {
        if (confirm('确定要清空对话历史吗？')) {
            onUpdate(node.id, { ...node.data, messages: [] });
        }
    };

    return (
        <div className="flex flex-col h-[500px] bg-slate-950/20 rounded-2xl border border-white/5 overflow-hidden">
            {/* 顶部栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest">当前模型</label>
                        <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[9px] text-blue-400 font-bold">
                            {globalCategoryModel || '默认'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest">接入数据源</label>
                        <select
                            value={node.data.sourceNodeId || ''}
                            onChange={(e) => onUpdate(node.id, { ...node.data, sourceNodeId: e.target.value })}
                            className="bg-transparent border-none text-[10px] text-blue-400 outline-none cursor-pointer"
                        >
                            <option value="">无上下文</option>
                            {allNodes.filter(n => n.id !== node.id && (n.data.result || n.data.results)).map(n => (
                                <option key={n.id} value={n.id}>{n.titleZh}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <button onClick={clearHistory} className="text-[8px] text-slate-500 hover:text-red-400 uppercase font-black transition-colors">
                    清空历史
                </button>
            </div>

            {/* 消息列表 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar select-text">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-50">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                        <span className="text-[10px] font-bold uppercase tracking-widest">开始对话吧...</span>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-[11px] leading-relaxed shadow-sm
              ${m.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-none'
                                : 'bg-slate-900 text-slate-200 border border-white/5 rounded-tl-none'}
            `}>
                            {m.files && (
                                <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
                                    {m.files.map((f, idx) => (
                                        <img key={idx} src={f} className="w-20 h-20 object-cover rounded-lg border border-white/10" />
                                    ))}
                                </div>
                            )}
                            <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-900 text-slate-400 rounded-2xl rounded-tl-none px-4 py-2 border border-white/5 flex items-center gap-2">
                            <div className="flex gap-1">
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-tighter">AI 思考中</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 输入区 */}
            <div className="p-4 bg-white/5 border-t border-white/5 space-y-3">
                {pendingFiles.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {pendingFiles.map((f, i) => (
                            <div key={i} className="relative shrink-0 group">
                                <img src={f} className="w-12 h-12 object-cover rounded-lg border border-blue-500/50" />
                                <button
                                    onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-blue-400 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    </button>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="输入消息..."
                        className="flex-1 bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-[11px] text-slate-200 outline-none focus:border-blue-500/30 transition-all resize-none max-h-32"
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || (!input.trim() && pendingFiles.length === 0)}
                        className={`p-2.5 rounded-xl transition-all shadow-lg
              ${loading || (!input.trim() && pendingFiles.length === 0)
                                ? 'bg-slate-800 text-slate-600'
                                : 'bg-blue-600 text-white hover:scale-105 active:scale-95'}
            `}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </button>
                </div>
                <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,text/plain,application/pdf" onChange={handleFileChange} />
            </div>
        </div>
    );
};
