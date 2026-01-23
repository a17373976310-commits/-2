
import React, { useState, useRef, useEffect } from 'react';
import { AppNode, ApiConfig, ApiProvider } from '../types';
import { apiService } from '../services/ApiService';
import { logger } from '../services/loggerService';
import { DETAIL_PAGE_AGENT_PROMPT, VISUAL_DNA_EXTRACTION_PROMPT } from '../prompts/detailPageAgent';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    files?: string[];
    generatedImage?: string;  // AI 生成的图片
    moduleInfo?: string;      // 模块信息标签
    imageParams?: {           // 待生成的图片参数
        prompt: string;
        ratio: string;
        module: string;
        copy: string;
        useUserImage: boolean;
    };
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

    // Detail page generation mode
    const [mode, setMode] = useState<'chat' | 'detail_page'>('chat');
    const [generatingImage, setGeneratingImage] = useState(false);
    const [visualDNA, setVisualDNA] = useState<string>('');

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

    const processMessage = async (userMsg: Message, currentMessages: Message[]) => {
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

            // Add visual DNA context if available
            if (visualDNA) {
                context += `\n[Visual Style DNA]: ${visualDNA}\n`;
            }

            // Choose system prompt based on mode
            const systemPrompt = mode === 'detail_page'
                ? DETAIL_PAGE_AGENT_PROMPT
                : node.data.promptEngineering;

            // Build conversation history for context (limit to last 10 messages for token efficiency)
            const historyForApi = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
                images: m.files
            }));

            // Add context to the current message
            const lastMsgContent = context + userMsg.content;

            const response = await apiService.chatPro(
                lastMsgContent,
                globalCategoryModel || 'gemini-3-flash-preview',
                provider,
                userMsg.files,
                systemPrompt,
                historyForApi  // Pass conversation history for context
            );

            // Check if response contains [GENERATE_IMAGE] directive
            const imageMatch = response.match(/\[GENERATE_IMAGE\]([\s\S]*?)\[\/GENERATE_IMAGE\]/);

            if (imageMatch) {
                // Parse the directive
                const directive = imageMatch[1];
                const moduleMatch = directive.match(/module:\s*(.+)/);
                const promptMatch = directive.match(/prompt:\s*(.+)/);
                const copyMatch = directive.match(/copy:\s*(.+)/);
                const ratioMatch = directive.match(/ratio:\s*(.+)/);
                const useUserImageMatch = directive.match(/userImage:\s*(true|false)/);

                const moduleName = moduleMatch?.[1]?.trim() || '未命名模块';
                const imagePrompt = promptMatch?.[1]?.trim() || '';
                const copyText = copyMatch?.[1]?.trim() || '';
                const ratio = ratioMatch?.[1]?.trim() || '3:4';
                const useUserImage = useUserImageMatch?.[1] === 'true';

                // Remove directive from displayed content
                const cleanContent = response.replace(/\[GENERATE_IMAGE\][\s\S]*?\[\/GENERATE_IMAGE\]/, '').trim();

                // Add assistant message with proposal (NO AUTO-GENERATION)
                const assistantMsg: Message = {
                    role: 'assistant',
                    content: cleanContent,
                    moduleInfo: moduleName,
                    imageParams: {
                        prompt: imagePrompt,
                        ratio,
                        module: moduleName,
                        copy: copyText,
                        useUserImage
                    }
                };
                onUpdate(node.id, { ...node.data, messages: [...currentMessages, assistantMsg] });
            } else {
                // Check for [STYLE_DNA] directive
                const dnaMatch = response.match(/\[STYLE_DNA\]([\s\S]*?)\[\/STYLE_DNA\]/);
                if (dnaMatch) {
                    setVisualDNA(dnaMatch[1].trim());
                    logger.success('视觉 DNA 已提取');
                }

                const assistantMsg: Message = { role: 'assistant', content: response };
                onUpdate(node.id, { ...node.data, messages: [...currentMessages, assistantMsg] });
            }
        } catch (err: any) {
            logger.error('对话失败: ' + err.message);
            const errorMsg: Message = {
                role: 'assistant',
                content: `❌ 对话失败: ${err.message}`
            };
            onUpdate(node.id, { ...node.data, messages: [...currentMessages, errorMsg] });
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmGenerate = async (msgIndex: number) => {
        const msg = messages[msgIndex];
        if (!msg || !msg.imageParams || loading || generatingImage) return;

        const { prompt, ratio, module, copy, useUserImage } = msg.imageParams;
        setGeneratingImage(true);

        try {
            const providerId = apiConfig.defaultImageProviderId || apiConfig.defaultProviderId;
            const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];

            let imagePrompt = prompt;
            if (copy) {
                imagePrompt = `${imagePrompt}. The image MUST clearly display the following text exactly: "${copy}". The text should be integrated into the design professionally.`;
            }

            // Find reference image
            let referenceImage = undefined;

            // 1. Try to find user uploaded image first (if useUserImage is true)
            if (useUserImage) {
                for (let i = msgIndex; i >= 0; i--) {
                    if (messages[i].role === 'user' && messages[i].files && messages[i].files!.length > 0) {
                        referenceImage = messages[i].files![0];
                        break;
                    }
                }
            }

            // 2. If no user image found, try to find the previous generated image for consistency
            if (!referenceImage) {
                for (let i = msgIndex - 1; i >= 0; i--) {
                    if (messages[i].generatedImage) {
                        referenceImage = messages[i].generatedImage;
                        break;
                    }
                }
            }

            const generatedImage = await apiService.generateImage(
                imagePrompt,
                { ratio, model: provider.imageModels?.[0] || 'nano-banana-2' },
                provider,
                referenceImage
            );

            // Update the specific message with the generated image
            const updatedMessages = [...messages];
            updatedMessages[msgIndex] = {
                ...msg,
                generatedImage,
                content: msg.content + `\n\n✅ "${module}" 生成完成！`
            };
            onUpdate(node.id, { ...node.data, messages: updatedMessages });
            logger.success(`模块 "${module}" 生成完成`);
        } catch (err: any) {
            logger.error('图像生成失败: ' + err.message);
            const updatedMessages = [...messages];
            updatedMessages[msgIndex] = {
                ...msg,
                content: msg.content + `\n\n❌ "${module}" 生成失败: ${err.message}`
            };
            onUpdate(node.id, { ...node.data, messages: updatedMessages });
        } finally {
            setGeneratingImage(false);
        }
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

        await processMessage(userMsg, newMessages);
    };

    const handleRegenerate = async () => {
        if (loading || generatingImage || isPaused) return;

        // Find the last user message
        const lastUserMsgIndex = [...messages].reverse().findIndex(m => m.role === 'user');
        if (lastUserMsgIndex === -1) return;

        const actualIndex = messages.length - 1 - lastUserMsgIndex;
        const lastUserMsg = messages[actualIndex];

        // Remove all messages after the last user message
        const newMessages = messages.slice(0, actualIndex + 1);
        onUpdate(node.id, { ...node.data, messages: newMessages });

        await processMessage(lastUserMsg, newMessages);
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
                <div className="flex items-center gap-3">
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                        <button
                            onClick={() => setMode('chat')}
                            className={`px-2 py-1 rounded-md text-[8px] font-bold transition-all ${mode === 'chat'
                                ? 'bg-blue-500 text-white'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            💬 对话
                        </button>
                        <button
                            onClick={() => setMode('detail_page')}
                            className={`px-2 py-1 rounded-md text-[8px] font-bold transition-all ${mode === 'detail_page'
                                ? 'bg-amber-500 text-black'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            📄 详情页
                        </button>
                    </div>
                    {visualDNA && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[8px] text-emerald-400 font-bold">
                            ✓ 风格DNA
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={node.data.sourceNodeId || ''}
                        onChange={(e) => onUpdate(node.id, { ...node.data, sourceNodeId: e.target.value })}
                        className="bg-transparent border-none text-[9px] text-blue-400 outline-none cursor-pointer"
                    >
                        <option value="">无上下文</option>
                        {allNodes.filter(n => n.id !== node.id && (n.data.result || n.data.results)).map(n => (
                            <option key={n.id} value={n.id}>{n.titleZh}</option>
                        ))}
                    </select>
                    <button onClick={clearHistory} className="text-[8px] text-slate-500 hover:text-red-400 uppercase font-black transition-colors">
                        清空
                    </button>
                </div>
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
                            {/* Module Info Badge */}
                            {m.moduleInfo && (
                                <div className="mb-2">
                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] font-bold rounded-full">
                                        📦 {m.moduleInfo}
                                    </span>
                                </div>
                            )}
                            {/* User uploaded files */}
                            {m.files && (
                                <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
                                    {m.files.map((f, idx) => (
                                        <img key={idx} src={f} className="w-20 h-20 object-cover rounded-lg border border-white/10" />
                                    ))}
                                </div>
                            )}
                            {/* Message content */}
                            <div className="whitespace-pre-wrap break-words">{m.content}</div>

                            {/* Design Proposal & Confirmation */}
                            {m.imageParams && !m.generatedImage && (
                                <div className="mt-3 p-3 bg-slate-800/50 rounded-xl border border-white/5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">🎨 设计提案</span>
                                        <span className="text-[9px] text-slate-500">{m.imageParams.ratio}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-300 italic">
                                        "{m.imageParams.prompt}"
                                    </div>
                                    {m.imageParams.copy && (
                                        <div className="text-[10px] text-blue-400 font-medium">
                                            📝 文案: {m.imageParams.copy}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleConfirmGenerate(i)}
                                        disabled={loading || generatingImage}
                                        className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 text-black text-[10px] font-bold rounded-lg transition-all shadow-lg active:scale-95"
                                    >
                                        {generatingImage ? '正在生成...' : '确认并生成图片'}
                                    </button>
                                </div>
                            )}

                            {/* AI Generated Image */}
                            {m.generatedImage && (
                                <div className="mt-3 relative group">
                                    <img
                                        src={m.generatedImage}
                                        className="max-w-full rounded-xl border border-white/10 shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        alt={m.moduleInfo || 'Generated'}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', m.generatedImage!);
                                        }}
                                    />
                                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <a
                                            href={m.generatedImage}
                                            download={`${m.moduleInfo || 'image'}.png`}
                                            className="p-1.5 bg-black/70 rounded-lg text-white hover:bg-black/90 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {(loading || generatingImage) && (
                    <div className="flex justify-start">
                        <div className={`rounded-2xl rounded-tl-none px-4 py-2 border border-white/5 flex items-center gap-2 ${generatingImage ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-900 text-slate-400'
                            }`}>
                            <div className="flex gap-1">
                                <div className={`w-1 h-1 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ animationDelay: '0ms' }} />
                                <div className={`w-1 h-1 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ animationDelay: '150ms' }} />
                                <div className={`w-1 h-1 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-tighter">
                                {generatingImage ? '🎨 图像生成中...' : 'AI 思考中'}
                            </span>
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
                    {messages.length > 0 && !loading && !generatingImage && (
                        <button
                            onClick={handleRegenerate}
                            title="重新生成"
                            className="p-2.5 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-amber-400 transition-colors shadow-lg"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    )}
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
