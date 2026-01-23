import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    X, Plus, History, ChevronLeft, User, Bot,
    FileText, Paperclip, Send, PlusCircle, ChevronDown
} from 'lucide-react';
import { marked } from 'marked';
import { SUGGESTED_MODELS, PLUGINS } from '../constants';
import { PluginCategory, LogEntry, ApiConfig, ApiProvider } from '../types';
import { apiService } from '../services/ApiService';
import {
    DETAIL_PAGE_AGENT_PROMPT,
    VISUAL_DNA_EXTRACTION_PROMPT,
    DNA_GENERATOR_PROMPT,
    IMAGE_COMPILER_PROMPT
} from '../prompts/detailPageAgent';

const DEFAULT_BASE_URL = 'https://api.openai.com';

// AI Chat models - categories mapping to PluginCategory
const CATEGORY_MAP: Record<string, PluginCategory> = {
    '推理模型': PluginCategory.LOGIC,
    '图像模型': PluginCategory.VISUAL,
    '视频模型': PluginCategory.VIDEO,
};

interface ApiConfigItem {
    id: string;
    type: string;
    provider: string;
    modelName: string;
    key?: string;
    url?: string;
}

interface ChatFile {
    id: string;
    name: string;
    type: string;
    content: string;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
    isPDF: boolean;
    isDoc: boolean;
    isExcel: boolean;
    isCode: boolean;
    fileExt: string;
    label?: string;
    selected?: boolean;
}

interface PendingAction {
    type: 'ADD_NODE' | 'UPDATE_NODE';
    params: any;
    description: string;
    executed?: boolean;
    cancelled?: boolean;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    files?: ChatFile[];
    timestamp: number;
    modelId?: string;
    isError?: boolean;
    pendingActions?: PendingAction[];
    generatedImage?: string;  // AI 生成的图片
    moduleInfo?: string;      // 模块信息标签
    imageParams?: {           // 待生成的图片参数
        prompt: string;
        ratio: string;
        module: string;
        copy: string;
        useUserImage: boolean;
        needLabels?: string[];
    };
}

interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
}

interface CanvasNode {
    id: string;
    type: string;
    title: string;
    titleZh: string;
    data: any;
}

interface AIChatSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: 'dark' | 'light';
    apiConfig: ApiConfig;
    globalApiKey?: string;
    // Canvas integration
    nodes?: CanvasNode[];
    selectedNodeId?: string | null;
    onAddNode?: (type: string) => void;
    onUpdateNode?: (id: string, data: any) => void;
    // Terminal logs
    logs?: LogEntry[];
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
    isOpen,
    onClose,
    theme = 'dark',
    apiConfig,
    globalApiKey = '',
    nodes = [],
    selectedNodeId = null,
    onAddNode,
    onUpdateNode,
    logs = []
}) => {
    // Load chat sessions from localStorage
    const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
        try {
            const saved = localStorage.getItem('ai_chat_sessions');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { console.error('Failed to load chat sessions', e); }
        return [{ id: 'default', title: 'New Chat', messages: [] }];
    });
    const [currentChatId, setCurrentChatId] = useState(() => {
        try {
            return localStorage.getItem('ai_chat_current_id') || 'default';
        } catch { return 'default'; }
    });
    const [chatInput, setChatInput] = useState('');
    const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
    const [isChatSending, setIsChatSending] = useState(false);
    const [chatSessionDropdownOpen, setChatSessionDropdownOpen] = useState(false);
    const [chatWidth, setChatWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const [selectedModels, setSelectedModels] = useState<Record<string, string>>({
        '推理模型': SUGGESTED_MODELS[PluginCategory.LOGIC][0]?.id || 'gpt-5.2',
        '图像模型': SUGGESTED_MODELS[PluginCategory.VISUAL][0]?.id || 'nano-banana-2',
        '视频模型': SUGGESTED_MODELS[PluginCategory.VIDEO][0]?.id || 'luma-dream-machine',
    });
    const [openDropdownCategory, setOpenDropdownCategory] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Detail page generation mode
    const [mode, setMode] = useState<'chat' | 'detail_page'>('chat');
    const [generatingImage, setGeneratingImage] = useState(false);
    const [isAnalyzingDNA, setIsAnalyzingDNA] = useState(false);
    const [visualDNA, setVisualDNA] = useState<string>(() => {
        try {
            return localStorage.getItem('ai_chat_visual_dna') || '';
        } catch { return ''; }
    });
    const [productIdentity, setProductIdentity] = useState<string>(() => {
        try {
            return localStorage.getItem('ai_chat_product_identity') || '';
        } catch { return ''; }
    });
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
    const [hiddenReferenceIds, setHiddenReferenceIds] = useState<Set<string>>(new Set());
    const [hoveredRefImage, setHoveredRefImage] = useState<any>(null);

    // Save chat sessions to localStorage with quota management
    useEffect(() => {
        try {
            // Create a lightweight version of sessions for storage
            const sessionsToSave = chatSessions.map(session => ({
                ...session,
                messages: session.messages.slice(-20).map(msg => ({ // Keep last 20 messages
                    ...msg,
                    files: msg.files?.map(f => ({
                        ...f,
                        // If content is base64 image and very large, truncate it for storage
                        content: (f.isImage && f.content.length > 500000) ? '' : f.content
                    }))
                }))
            }));
            localStorage.setItem('ai_chat_sessions', JSON.stringify(sessionsToSave));
        } catch (e) { console.error('Failed to save chat sessions', e); }
    }, [chatSessions]);

    // Save current chat ID and Visual DNA
    useEffect(() => {
        try {
            localStorage.setItem('ai_chat_current_id', currentChatId);
            localStorage.setItem('ai_chat_visual_dna', visualDNA);
            localStorage.setItem('ai_chat_product_identity', productIdentity);
        } catch (e) { console.error('Failed to save current chat ID or DNA', e); }
    }, [currentChatId, visualDNA, productIdentity]);

    // Resize handlers
    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing) {
                const newWidth = Math.min(Math.max(e.clientX, 320), 700);
                setChatWidth(newWidth);
            }
        };
        const handleMouseUp = () => setIsResizing(false);

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const currentSession = useMemo(() =>
        chatSessions.find(s => s.id === currentChatId) || chatSessions[0],
        [chatSessions, currentChatId]
    );

    const allUserImages = useMemo(() => {
        if (!currentSession) return [];
        const images: { content: string, messageId: string, fileIndex: number, selected?: boolean, label?: string }[] = [];
        currentSession.messages.forEach(m => {
            if (m.role === 'user' && m.files) {
                m.files.forEach((f, i) => {
                    const id = `${m.id}-${i}`;
                    if (f.isImage && !hiddenReferenceIds.has(id)) {
                        images.push({
                            content: f.content,
                            messageId: m.id,
                            fileIndex: i,
                            selected: f.selected,
                            label: f.label
                        });
                    }
                });
            }
        });
        return images;
    }, [currentSession, hiddenReferenceIds]);

    // Sync models when default providers change or on mount
    const lastDefaultProviderId = useRef<string | null>(null);
    const lastDefaultImageProviderId = useRef<string | null>(null);

    useEffect(() => {
        if (apiConfig.providers.length > 0) {
            const defaultChatProvider = apiConfig.providers.find(p => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0];
            const defaultImgProvider = apiConfig.providers.find(p => p.id === apiConfig.defaultImageProviderId) || defaultChatProvider;

            setSelectedModels(prev => {
                const next = { ...prev };
                let changed = false;

                // Helper to check if a model is supported by a provider
                const isSupported = (modelId: string, providerModels: string[]) => {
                    if (!modelId) return false;
                    if (providerModels.includes('所有') || providerModels.includes('*')) return true;
                    return providerModels.includes(modelId);
                };

                // Logic/Chat Model Sync
                const isFirstRun = lastDefaultProviderId.current === null;
                const providerChanged = apiConfig.defaultProviderId !== lastDefaultProviderId.current;
                const currentModelUnsupported = !isSupported(prev['推理模型'], defaultChatProvider.models);

                if (isFirstRun || providerChanged || currentModelUnsupported) {
                    if (defaultChatProvider && defaultChatProvider.models.length > 0) {
                        const firstRealModel = defaultChatProvider.models.find(m => m !== '所有' && m !== '*') || defaultChatProvider.models[0];
                        if (next['推理模型'] !== firstRealModel) {
                            next['推理模型'] = firstRealModel;
                            changed = true;
                        }
                    }
                }

                // Visual/Image Model Sync
                const imgProviderChanged = apiConfig.defaultImageProviderId !== lastDefaultImageProviderId.current;
                const imgModels = defaultImgProvider?.imageModels || defaultImgProvider?.models || [];
                const currentImgModelUnsupported = !isSupported(prev['图像模型'], imgModels);

                if (isFirstRun || imgProviderChanged || currentImgModelUnsupported) {
                    if (imgModels.length > 0) {
                        const firstRealImgModel = imgModels.find(m => m !== '所有' && m !== '*') || imgModels[0];
                        if (next['图像模型'] !== firstRealImgModel) {
                            next['图像模型'] = firstRealImgModel;
                            changed = true;
                        }
                    }
                }

                return changed ? next : prev;
            });

            lastDefaultProviderId.current = apiConfig.defaultProviderId;
            lastDefaultImageProviderId.current = apiConfig.defaultImageProviderId;
        }
    }, [apiConfig.defaultProviderId, apiConfig.defaultImageProviderId, apiConfig.providers]);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [currentSession?.messages, isOpen]);

    const createNewChat = () => {
        const newId = `chat-${Date.now()}`;
        const newSession: ChatSession = { id: newId, title: 'New Chat', messages: [] };
        setChatSessions(prev => [newSession, ...prev]);
        setCurrentChatId(newId);
    };

    const deleteChatSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSessions = chatSessions.filter(s => s.id !== id);
        if (newSessions.length === 0) {
            const defaultSession: ChatSession = { id: 'default', title: 'New Chat', messages: [] };
            setChatSessions([defaultSession]);
            setCurrentChatId('default');
            setVisualDNA('');
        } else {
            setChatSessions(newSessions);
            if (currentChatId === id) setCurrentChatId(newSessions[0].id);
        }
    };

    const resetCurrentSession = () => {
        if (window.confirm('确定要重置当前会话吗？这将清空消息和风格 DNA。')) {
            setChatSessions(prev => prev.map(s => s.id === currentChatId ? { ...s, messages: [], title: 'New Chat' } : s));
            setVisualDNA('');
            setProductIdentity('');
            setMode('chat');
        }
    };

    const handleChatFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList) return;

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const reader = new FileReader();
            reader.onload = (ev) => {
                const content = ev.target?.result as string;
                const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

                setChatFiles(prev => [...prev, {
                    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: file.name,
                    type: file.type,
                    content: content,
                    isImage: file.type.startsWith('image/'),
                    isVideo: file.type.startsWith('video/'),
                    isAudio: file.type.startsWith('audio/'),
                    isPDF: file.type === 'application/pdf' || fileExt === 'pdf',
                    isDoc: ['doc', 'docx'].includes(fileExt),
                    isExcel: ['xls', 'xlsx'].includes(fileExt),
                    isCode: ['js', 'ts', 'py', 'json', 'md', 'txt'].includes(fileExt),
                    fileExt
                }]);
            };

            if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type === 'application/pdf') {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        }
        e.target.value = '';
    };

    const removeChatFile = (index: number) => {
        const fileToRemove = chatFiles[index];
        if (fileToRemove) {
            setSelectedFileIds(prev => {
                const next = new Set(prev);
                next.delete(fileToRemove.id);
                return next;
            });
        }
        setChatFiles(prev => prev.filter((_, i) => i !== index));
    };

    const updateChatFileLabel = (index: number, label: string) => {
        setChatFiles(prev => prev.map((f, i) => i === index ? { ...f, label } : f));
    };

    const toggleFileSelection = (fileId: string) => {
        setSelectedFileIds(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) {
                next.delete(fileId);
            } else {
                next.add(fileId);
            }
            return next;
        });
    };

    const clearFileSelection = () => {
        setSelectedFileIds(new Set());
    };

    const toggleHistoryFileSelection = (messageId: string, fileIndex: number) => {
        setChatSessions(prev => prev.map(s => {
            if (s.id === currentChatId) {
                return {
                    ...s,
                    messages: s.messages.map(m => {
                        if (m.id === messageId && m.files) {
                            return {
                                ...m,
                                files: m.files.map((f, i) =>
                                    i === fileIndex ? { ...f, selected: !f.selected } : f
                                )
                            };
                        }
                        return m;
                    })
                };
            }
            return s;
        }));
    };

    const hideReferenceImage = (messageId: string, fileIndex: number) => {
        setHiddenReferenceIds(prev => {
            const next = new Set(prev);
            next.add(`${messageId}-${fileIndex}`);
            return next;
        });
    };

    const updateMessageRatio = (messageId: string, ratio: string) => {
        setChatSessions(prev => prev.map(s => {
            if (s.id === currentChatId) {
                return {
                    ...s,
                    messages: s.messages.map(m => {
                        if (m.id === messageId && m.imageParams) {
                            return { ...m, imageParams: { ...m.imageParams, ratio } };
                        }
                        return m;
                    })
                };
            }
            return s;
        }));
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const content = ev.target?.result as string;
                    setChatFiles(prev => [...prev, {
                        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        name: `pasted-image-${Date.now()}.png`,
                        type: file.type,
                        content,
                        isImage: true,
                        isVideo: false,
                        isAudio: false,
                        isPDF: false,
                        isDoc: false,
                        isExcel: false,
                        isCode: false,
                        fileExt: 'png'
                    }]);
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    };

    const sendChatMessage = async () => {
        if ((!chatInput.trim() && chatFiles.length === 0) || isChatSending) return;

        const logicModelId = selectedModels['推理模型'];
        let logicProvider = apiConfig.providers.find(p => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0];

        const isMarker = (id: string) => id === '所有' || id === '*';
        const effectiveModel = isMarker(logicModelId)
            ? (logicProvider.models.find(m => !isMarker(m)) || logicProvider.models[0])
            : logicModelId;

        if (!logicProvider?.apiKey) {
            alert('Please configure API Key in settings first');
            return;
        }

        setIsChatSending(true);

        const newUserMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: chatInput,
            files: chatFiles.map(f => ({
                ...f,
                selected: selectedFileIds.has(f.id)
            })),
            timestamp: Date.now(),
            modelId: logicModelId
        };

        setChatSessions(prev => prev.map(s => {
            if (s.id === currentChatId) {
                return { ...s, messages: [...s.messages, newUserMsg], title: s.messages.length === 0 ? chatInput.slice(0, 20) : s.title };
            }
            return s;
        }));

        setChatInput('');
        setChatFiles([]);
        clearFileSelection();

        const allMessages = [...(currentSession?.messages || []), newUserMsg];
        const recentMessages = allMessages.slice(-20);

        const nodesContext = nodes.length > 0
            ? nodes.map(n => `- [${n.id}] ${n.titleZh} (${n.type})`).join('\n')
            : '暂无节点';
        const selectedInfo = selectedNodeId
            ? `用户当前选中的节点: ${selectedNodeId}`
            : '';

        const logsContext = logs.slice(-20).map(log =>
            `[${log.level.toUpperCase()}] ${log.message}`
        ).join('\n') || '暂无日志';

        let systemPrompt = "";
        if (mode === 'detail_page') {
            // Add manual selection info to system prompt if any
            // 1. From current upload
            const currentSelected = chatFiles.filter(f => selectedFileIds.has(f.id));

            // 2. From session history
            const historySelected: { label: string }[] = [];
            currentSession?.messages.forEach(m => {
                if (m.role === 'user' && m.files) {
                    m.files.forEach(f => {
                        if (f.isImage && f.selected) {
                            historySelected.push({ label: f.label || '未命名' });
                        }
                    });
                }
            });

            const allSelected = [...currentSelected, ...historySelected];

            const selectionContext = allSelected.length > 0
                ? `\n\n【用户已手动锁定参考图】：\n${allSelected.map(img => `- [${img.label || '未命名'}]`).join('\n')}\n请务必【仅】基于以上锁定的图片进行设计。如果 DNA 或历史记录中包含其他产品，请【完全忽略】它们，确保输出的 Prompt 和文案只针对当前锁定的产品。`
                : "";

            if (!visualDNA) {
                // Step 1: DNA Generation mode
                setIsAnalyzingDNA(true);
                systemPrompt = DNA_GENERATOR_PROMPT + selectionContext;
            } else {
                // Step 2: Image Compiler mode
                systemPrompt = IMAGE_COMPILER_PROMPT.replace('{visualDNA}', visualDNA) + selectionContext;
            }
        } else {
            const template = await apiService.getPromptTemplate('AI_CHAT_SYSTEM');
            systemPrompt = template
                ? template
                    .replace('{nodesContext}', nodesContext)
                    .replace('{selectedInfo}', selectedInfo)
                    .replace('{logsContext}', logsContext)
                : `你是一个智能画布助手。你可以帮助用户管理画布上的节点。
                当前画布节点: ${nodesContext}
                ${selectedInfo}`;
        }

        try {
            // Global Selection Priority: If ANY image in the session is selected, only send selected images
            const hasAnySelectionInSession = allUserImages.some(img => img.selected) || newUserMsg.files?.some(f => f.selected);

            const base64Images = newUserMsg.files?.filter(f => f.isImage && (!hasAnySelectionInSession || f.selected)).map(f => f.content) || [];
            const imageLabels = newUserMsg.files?.filter(f => f.isImage && (!hasAnySelectionInSession || f.selected)).map(f => f.label || '') || [];

            let aiContent = await apiService.chatPro(
                newUserMsg.content,
                effectiveModel,
                logicProvider,
                base64Images,
                systemPrompt,
                recentMessages.map(m => {
                    return {
                        role: m.role,
                        content: m.content,
                        images: m.files?.filter(f => f.isImage && f.content && (!hasAnySelectionInSession || f.selected)).map(f => f.content),
                        imageLabels: m.files?.filter(f => f.isImage && (!hasAnySelectionInSession || f.selected)).map(f => f.label || '')
                    };
                }),
                imageLabels
            );

            const imageMatch = aiContent.match(/\[GENERATE_IMAGE\]([\s\S]*?)\[\/GENERATE_IMAGE\]/);

            if (imageMatch) {
                const directive = imageMatch[1];
                const moduleMatch = directive.match(/module:\s*(.+)/);
                const promptMatch = directive.match(/prompt:\s*(.+)/);
                const copyMatch = directive.match(/copy:\s*(.+)/);
                const ratioMatch = directive.match(/ratio:\s*(.+)/);
                const useUserImageMatch = directive.match(/userImage:\s*(true|false)/);
                const needLabelsMatch = directive.match(/needLabels:\s*(.+)/);

                const moduleName = moduleMatch?.[1]?.trim() || '未命名模块';
                const imagePrompt = promptMatch?.[1]?.trim() || '';
                const copyText = copyMatch?.[1]?.trim() || '';
                const ratio = ratioMatch?.[1]?.trim() || '3:4';
                const useUserImage = useUserImageMatch?.[1] === 'true';
                const needLabels = needLabelsMatch?.[1]
                    ? needLabelsMatch[1].split(',').map(s => s.trim()).filter(s => s)
                    : undefined;

                const cleanContent = aiContent.replace(/\[GENERATE_IMAGE\][\s\S]*?\[\/GENERATE_IMAGE\]/, '').trim();

                const assistantMsgId = `msg-${Date.now()}`;
                const assistantMsg: ChatMessage = {
                    id: assistantMsgId,
                    role: 'assistant',
                    content: cleanContent,
                    timestamp: Date.now(),
                    moduleInfo: moduleName,
                    imageParams: {
                        prompt: imagePrompt,
                        ratio,
                        module: moduleName,
                        copy: copyText,
                        useUserImage,
                        needLabels
                    }
                };

                setChatSessions(prev => prev.map(s => {
                    if (s.id === currentChatId) {
                        return { ...s, messages: [...s.messages, assistantMsg] };
                    }
                    return s;
                }));
            } else {
                // Parse DNA (Support both V2 and legacy STYLE_DNA)
                const dnaV2Match = aiContent.match(/\[VISUAL_DNA_V2\]([\s\S]*?)\[\/VISUAL_DNA_V2\]/);
                const dnaLegacyMatch = aiContent.match(/\[STYLE_DNA\]([\s\S]*?)\[\/STYLE_DNA\]/);
                const dnaMatch = dnaV2Match || dnaLegacyMatch;

                if (dnaMatch) {
                    const extractedDNA = dnaMatch[1].trim();
                    const isV2 = !!dnaV2Match;
                    setVisualDNA(extractedDNA);

                    // Extract product_identity if present
                    const identityMatch = extractedDNA.match(/product_identity:\s*(.+)/);
                    if (identityMatch) {
                        setProductIdentity(identityMatch[1].trim());
                    }

                    const dnaMsg: ChatMessage = {
                        id: `dna-${Date.now()}`,
                        role: 'assistant',
                        content: isV2
                            ? `🧬 **全局视觉基因锁已开启 (V2)**\n\n${extractedDNA}\n\n后续作图将严格遵循此基因。`
                            : `🧬 **风格 DNA 已提取**\n\n${extractedDNA}\n\n后续生成的图片将严格遵循此风格。`,
                        timestamp: Date.now(),
                    };
                    setChatSessions(prev => prev.map(s => {
                        if (s.id === currentChatId) {
                            return { ...s, messages: [...s.messages, dnaMsg] };
                        }
                        return s;
                    }));
                }

                const pendingActions: PendingAction[] = [];
                const addNodeMatches = aiContent.matchAll(/\[ADD_NODE:([\w_]+)\]/g);
                for (const match of addNodeMatches) {
                    pendingActions.push({
                        type: 'ADD_NODE',
                        params: { type: match[1] },
                        description: `添加节点: ${match[1]}`
                    });
                }

                const updateNodeMatches = aiContent.matchAll(/\[UPDATE_NODE:([\w]+):prompt="([^"]+)"\]/g);
                for (const match of updateNodeMatches) {
                    pendingActions.push({
                        type: 'UPDATE_NODE',
                        params: { id: match[1], prompt: match[2] },
                        description: `更新节点 ${match[1]} 的提示词`
                    });
                }

                aiContent = aiContent
                    .replace(/\[ADD_NODE:[\w_]+\]/g, '')
                    .replace(/\[UPDATE_NODE:[^\]]+\]/g, '')
                    .replace(/\[VISUAL_DNA_V2\][\s\S]*?\[\/VISUAL_DNA_V2\]/, '')
                    .replace(/\[STYLE_DNA\][\s\S]*?\[\/STYLE_DNA\]/, '')
                    .trim();

                const newAssistantMsg: ChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: aiContent || (pendingActions.length > 0 ? "我建议执行以下操作：" : ""),
                    timestamp: Date.now(),
                    modelId: logicModelId,
                    pendingActions: pendingActions.length > 0 ? pendingActions : undefined
                };

                setChatSessions(prev => prev.map(s => {
                    if (s.id === currentChatId) {
                        return { ...s, messages: [...s.messages, newAssistantMsg] };
                    }
                    return s;
                }));
            }
        } catch (error: any) {
            console.error("Chat Error", error);
            const errorMsg: ChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: `Error: ${error.message}`,
                isError: true,
                timestamp: Date.now()
            };

            setChatSessions(prev => prev.map(s => {
                if (s.id === currentChatId) {
                    return { ...s, messages: [...s.messages, errorMsg] };
                }
                return s;
            }));
        } finally {
            setIsChatSending(false);
            setIsAnalyzingDNA(false);
        }
    };

    const handleConfirmGenerate = async (messageId: string) => {
        const msg = currentSession.messages.find(m => m.id === messageId);
        if (!msg || !msg.imageParams || isChatSending || generatingImage) return;

        const { prompt, ratio, module, copy, useUserImage } = msg.imageParams;
        setGeneratingImage(true);

        try {
            const imageModelId = selectedModels['图像模型'];
            let imageProvider = apiConfig.providers.find(p => p.id === apiConfig.defaultImageProviderId) || apiConfig.providers[0];

            const isMarker = (id: string) => id === '所有' || id === '*';
            const imgModels = imageProvider.imageModels || imageProvider.models || [];
            const effectiveImageModel = isMarker(imageModelId)
                ? (imgModels.find(m => !isMarker(m)) || imgModels[0])
                : imageModelId;

            let imagePrompt = prompt;
            if (copy) {
                imagePrompt = `${imagePrompt}. The image MUST clearly display the following text exactly: "${copy}". The text should be integrated into the design professionally.`;
            }

            // Find reference images for consistency
            let referenceImages: string[] = [];
            let imageLabels: string[] = [];

            const msgIndex = currentSession.messages.findIndex(m => m.id === messageId);
            const currentMsg = currentSession.messages[msgIndex];
            const needLabels = currentMsg?.imageParams?.needLabels;

            // 1. Collect ALL potential images from ALL user messages in the session
            let allUserImagesInSession: { content: string, label: string, selected?: boolean }[] = [];
            currentSession.messages.forEach(m => {
                if (m.role === 'user' && m.files) {
                    m.files.forEach(f => {
                        if (f.isImage) {
                            allUserImagesInSession.push({
                                content: f.content,
                                label: f.label || '',
                                selected: f.selected
                            });
                        }
                    });
                }
            });

            let filteredImages: { content: string, label: string }[] = [];

            // Priority 1: Manual Selection (Global across all messages)
            const manuallySelected = allUserImagesInSession.filter(img => img.selected);
            if (manuallySelected.length > 0) {
                filteredImages = manuallySelected;
            }
            // Priority 2: AI Label Priority (If no manual selection)
            else if (needLabels && needLabels.length > 0) {
                filteredImages = allUserImagesInSession.filter(img =>
                    needLabels.some(nl => img.label.toLowerCase().includes(nl.toLowerCase()))
                );
            }

            // Priority 3: Fallback (If still no match, prioritize "白底", then "主图"/"产品")
            if (filteredImages.length === 0 && allUserImagesInSession.length > 0) {
                filteredImages = allUserImagesInSession.filter(img => img.label.includes('白底'));
                if (filteredImages.length === 0) {
                    filteredImages = allUserImagesInSession.filter(img =>
                        img.label.includes('主图') || img.label.includes('产品')
                    );
                }
                // Priority 4: Ultimate Fallback (First image ever uploaded)
                if (filteredImages.length === 0) {
                    filteredImages = [allUserImagesInSession[0]];
                }
            }

            if (filteredImages.length > 0) {
                referenceImages.push(...filteredImages.map(img => img.content));
                imageLabels.push(...filteredImages.map(img => img.label || 'original product subject'));
            }

            // 2. Secondary: Find the most recent generated image (Style/Context reference)
            let lastGeneratedImage = "";
            for (let i = msgIndex - 1; i >= 0; i--) {
                const m = currentSession.messages[i];
                if (m.generatedImage) {
                    lastGeneratedImage = m.generatedImage;
                    break;
                }
            }

            if (lastGeneratedImage) {
                referenceImages.push(lastGeneratedImage);
                imageLabels.push('previous generation style');
            }

            const generatedImage = await apiService.generateImage(
                imagePrompt,
                { ratio, model: effectiveImageModel },
                imageProvider,
                referenceImages.length > 0 ? referenceImages : undefined,
                imageLabels.length > 0 ? imageLabels : undefined
            );

            setChatSessions(prev => prev.map(s => {
                if (s.id === currentChatId) {
                    return {
                        ...s,
                        messages: s.messages.map(m => {
                            if (m.id === messageId) {
                                return {
                                    ...m,
                                    content: m.content + `\n\n✅ "${module}" 生成完成！`,
                                    generatedImage
                                };
                            }
                            return m;
                        })
                    };
                }
                return s;
            }));
        } catch (err: any) {
            console.error('Image generation failed', err);
            setChatSessions(prev => prev.map(s => {
                if (s.id === currentChatId) {
                    return {
                        ...s,
                        messages: s.messages.map(m => {
                            if (m.id === messageId) {
                                return {
                                    ...m,
                                    content: m.content + `\n\n❌ "${module}" 生成失败: ${err.message}`,
                                    isError: true
                                };
                            }
                            return m;
                        })
                    };
                }
                return s;
            }));
        } finally {
            setGeneratingImage(false);
        }
    };

    const handleConfirmAction = (messageId: string, actionIndex: number) => {
        const message = currentSession.messages.find(m => m.id === messageId);
        if (!message || !message.pendingActions) return;

        const action = message.pendingActions[actionIndex];
        if (action.executed || action.cancelled) return;

        try {
            if (action.type === 'ADD_NODE' && onAddNode) {
                onAddNode(action.params.type);
            } else if (action.type === 'UPDATE_NODE' && onUpdateNode) {
                const targetNode = nodes.find(n => n.id === action.params.id);
                onUpdateNode(action.params.id, { ...targetNode?.data, prompt: action.params.prompt });
            }

            setChatSessions(prev => prev.map(s => {
                if (s.id === currentChatId) {
                    return {
                        ...s,
                        messages: s.messages.map(m => {
                            if (m.id === messageId && m.pendingActions) {
                                const newActions = [...m.pendingActions];
                                newActions[actionIndex] = { ...newActions[actionIndex], executed: true };
                                return { ...m, pendingActions: newActions };
                            }
                            return m;
                        })
                    };
                }
                return s;
            }));
        } catch (err) {
            console.error("Failed to execute action", err);
        }
    };

    const handleCancelAction = (messageId: string, actionIndex: number) => {
        setChatSessions(prev => prev.map(s => {
            if (s.id === currentChatId) {
                return {
                    ...s,
                    messages: s.messages.map(m => {
                        if (m.id === messageId && m.pendingActions) {
                            const newActions = [...m.pendingActions];
                            newActions[actionIndex] = { ...newActions[actionIndex], cancelled: true };
                            return { ...m, pendingActions: newActions };
                        }
                        return m;
                    })
                };
            }
            return s;
        }));
    };

    const isDark = theme === 'dark';

    return (
        <div
            className={`fixed left-0 top-0 bottom-0 border-r shadow-2xl flex flex-col z-50 select-text backdrop-blur-2xl ${isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-zinc-200'
                } ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${isResizing ? '' : 'transition-transform duration-300 ease-in-out'}`}
            style={{ width: chatWidth, pointerEvents: isOpen ? 'auto' : 'none' }}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Resize Handle */}
            <div
                className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-10 ${isResizing ? 'bg-blue-500/50' : ''}`}
                onMouseDown={handleResizeStart}
            />
            {/* Header */}
            <div className={`h-14 flex items-center justify-between px-4 shrink-0 border-b ${isDark ? 'border-white/10 bg-white/5' : 'border-zinc-200'}`}>
                <div className="flex items-center gap-3 relative">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>

                    {/* Multi-Category Model Selectors */}
                    <div className="flex items-center gap-2">
                        {Object.entries(CATEGORY_MAP).map(([category, pluginCategory]) => {
                            const provider = category === '图像模型'
                                ? (apiConfig.providers.find(p => p.id === apiConfig.defaultImageProviderId) || apiConfig.providers[0])
                                : (apiConfig.providers.find(p => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0]);

                            const providerModels = category === '图像模型'
                                ? (provider?.imageModels || provider?.models || [])
                                : (provider?.models || []);

                            const suggested = SUGGESTED_MODELS[pluginCategory] || [];
                            const allAvailableModels = [...suggested];

                            providerModels.forEach(mId => {
                                if (!allAvailableModels.some(m => m.id === mId)) {
                                    allAvailableModels.push({ id: mId, label: mId });
                                }
                            });

                            const currentModel = allAvailableModels.find(m => m.id === selectedModels[category]);

                            return (
                                <div key={category} className="relative">
                                    <button
                                        onClick={() => setOpenDropdownCategory(openDropdownCategory === category ? null : category)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${isDark
                                            ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                                            : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300'
                                            }`}
                                        title={category}
                                    >
                                        <span className="opacity-50 mr-1">{category.slice(0, 2)}</span>
                                        {currentModel?.label || selectedModels[category] || '选择模型'}
                                        <ChevronDown size={10} className={openDropdownCategory === category ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                    </button>

                                    {openDropdownCategory === category && (
                                        <div
                                            className={`absolute left-0 top-full mt-1 w-48 rounded-xl shadow-xl py-2 z-[100] border backdrop-blur-xl ${isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-zinc-200'}`}
                                            onMouseLeave={() => setOpenDropdownCategory(null)}
                                        >
                                            <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border-b mb-1 ${isDark ? 'text-slate-500 border-white/5' : 'text-zinc-400 border-zinc-100'}`}>
                                                {category}
                                            </div>
                                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                {allAvailableModels.map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => {
                                                            setSelectedModels(prev => ({ ...prev, [category]: model.id }));
                                                            setOpenDropdownCategory(null);
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-[11px] ${selectedModels[category] === model.id
                                                            ? (isDark ? 'bg-blue-600/20 text-blue-400 font-bold' : 'bg-blue-50 text-blue-600 font-bold')
                                                            : (isDark ? 'text-slate-300 hover:bg-white/5' : 'text-zinc-600 hover:bg-zinc-50')
                                                            }`}
                                                    >
                                                        {model.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Mode Toggle */}
                    <div className={`flex items-center p-1 rounded-xl border ${isDark ? 'bg-black/20 border-white/5' : 'bg-zinc-100 border-zinc-200'}`}>
                        <button
                            onClick={() => setMode('chat')}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === 'chat'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-zinc-500 hover:text-zinc-700')
                                }`}
                        >
                            💬 对话
                        </button>
                        <button
                            onClick={() => setMode('detail_page')}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === 'detail_page'
                                ? 'bg-amber-600 text-white shadow-lg'
                                : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-zinc-500 hover:text-zinc-700')
                                }`}
                        >
                            📄 详情页
                        </button>
                    </div>

                    {/* Visual DNA Badge & Reset */}
                    <div className="flex items-center gap-2">
                        {visualDNA && (
                            <div
                                className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold flex items-center gap-1 animate-in fade-in zoom-in duration-300 cursor-help group relative"
                                title="已锁定视觉风格"
                            >
                                <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                风格DNA
                                {/* DNA Tooltip */}
                                <div className={`absolute top-full left-0 mt-2 w-48 p-3 rounded-xl shadow-2xl border backdrop-blur-xl z-[100] hidden group-hover:block ${isDark ? 'bg-slate-900/95 border-white/10 text-slate-300' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                                    <div className="text-[10px] font-black uppercase mb-2 border-b border-white/5 pb-1 flex items-center justify-between">
                                        <span>当前视觉 DNA</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setVisualDNA(''); setProductIdentity(''); }}
                                            className="text-red-400 hover:text-red-300 transition-colors"
                                        >
                                            清除
                                        </button>
                                    </div>
                                    <div className="text-[9px] leading-relaxed whitespace-pre-wrap">{visualDNA}</div>
                                </div>
                            </div>
                        )}
                        {currentSession.messages.length > 0 && (
                            <button
                                onClick={resetCurrentSession}
                                className={`p-1.5 rounded-lg transition-all ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-400/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}
                                title="重置会话"
                            >
                                <History size={14} className="rotate-180" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={createNewChat} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`} title="New Chat">
                        <Plus size={16} />
                    </button>
                    {chatSessions.length > 1 && (
                        <div className="relative">
                            <button onClick={() => setChatSessionDropdownOpen(!chatSessionDropdownOpen)} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
                                <History size={16} />
                            </button>
                            {chatSessionDropdownOpen && (
                                <div className={`absolute right-0 top-full mt-1 w-48 rounded-xl shadow-xl py-1 z-50 border backdrop-blur-xl ${isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-zinc-200'}`} onMouseLeave={() => setChatSessionDropdownOpen(false)}>
                                    {chatSessions.map(s => (
                                        <div key={s.id} className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer ${currentChatId === s.id ? (isDark ? 'bg-white/10 text-white' : 'bg-zinc-100 text-zinc-900') : (isDark ? 'text-slate-400 hover:bg-white/5' : 'text-zinc-500 hover:bg-zinc-100')}`} onClick={() => { setCurrentChatId(s.id); setChatSessionDropdownOpen(false); }}>
                                            <span className="truncate flex-1">{s.title}</span>
                                            <button onClick={(e) => deleteChatSession(e, s.id)} className={`p-1 ${isDark ? 'text-slate-600 hover:text-red-500' : 'text-zinc-400 hover:text-red-500'}`}>
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`} title="Close Sidebar">
                        <ChevronLeft size={18} />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 select-text relative ${mode === 'detail_page' ? 'border-l-2 border-amber-500/30' : ''}`}>
                {/* Style DNA Panel (Detail Page Mode) */}
                {mode === 'detail_page' && visualDNA && (
                    <div className={`mb-4 p-3 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top duration-500 ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    已激活视觉风格 DNA
                                </span>
                            </div>
                            <button
                                onClick={() => { setVisualDNA(''); setProductIdentity(''); }}
                                className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-500 hover:text-red-400' : 'text-zinc-400 hover:text-red-500'}`}
                            >
                                清除风格
                            </button>
                        </div>
                        {productIdentity && (
                            <div className={`mb-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                📦 产品锚点: {productIdentity}
                            </div>
                        )}
                        <div className={`text-[10px] leading-relaxed whitespace-pre-wrap ${isDark ? 'text-slate-400' : 'text-zinc-600'}`}>
                            {visualDNA}
                        </div>
                    </div>
                )}

                {currentSession?.messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 select-text ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 select-none ${msg.role === 'user' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                            {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                        </div>
                        <div className={`flex flex-col gap-1 max-w-[85%] min-w-0 select-text ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            {msg.files && msg.files.length > 0 && (
                                <div className={`flex flex-wrap gap-2 mb-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.files.map((f, i) => (
                                        <div
                                            key={i}
                                            className={`relative group rounded p-1 border flex items-center gap-1 transition-all ${f.isImage ? 'cursor-pointer' : ''} ${f.selected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent border-blue-500' : (isDark ? 'bg-slate-800 border-white/10' : 'bg-zinc-100 border-zinc-300')}`}
                                            onClick={() => f.isImage && toggleHistoryFileSelection(msg.id, i)}
                                            title={f.isImage ? "点击锁定为参考图" : f.name}
                                        >
                                            {f.isImage ? (
                                                <div className="relative">
                                                    <img src={f.content} className="w-16 h-16 object-cover rounded" alt={f.name} />
                                                    {/* Selection Indicator */}
                                                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${f.selected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/20 border-white/40 opacity-0 group-hover:opacity-100'}`}>
                                                        {f.selected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                    </div>
                                                    {/* Reference Badge */}
                                                    {f.selected && (
                                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded bg-blue-500 text-white text-[7px] font-black uppercase tracking-tighter shadow-sm">
                                                            REF
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`w-12 h-12 rounded flex flex-col items-center justify-center ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-zinc-100 text-zinc-500'}`}>
                                                    <FileText size={16} />
                                                    <span className="text-[8px] mt-1">{f.fileExt}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {msg.content && (
                                <div className={`relative rounded-2xl px-4 py-2 text-sm select-text break-words whitespace-pre-wrap overflow-hidden max-w-full ${msg.role === 'user'
                                    ? (isDark ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-blue-500 text-white rounded-tr-none')
                                    : (isDark ? 'bg-slate-800/50 text-slate-200 rounded-tl-none border border-white/10' : 'bg-zinc-100 text-zinc-800 rounded-tl-none border border-zinc-200')
                                    }`}>
                                    {msg.moduleInfo && (
                                        <div className="mb-2 flex items-center gap-1.5">
                                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[9px] font-black uppercase tracking-tighter border border-amber-500/30">
                                                📦 {msg.moduleInfo}
                                            </span>
                                        </div>
                                    )}
                                    {msg.isError ? (
                                        <span className="text-red-400">{msg.content}</span>
                                    ) : (
                                        <div className="markdown-body max-w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }}></div>
                                    )}

                                    {/* Design Proposal & Confirmation */}
                                    {msg.imageParams && !msg.generatedImage && (
                                        <div className={`mt-3 p-3 rounded-xl border space-y-2 ${isDark ? 'bg-slate-900/50 border-white/5' : 'bg-white border-zinc-200 shadow-sm'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">🎨 设计提案</span>
                                                <select
                                                    value={msg.imageParams.ratio}
                                                    onChange={(e) => updateMessageRatio(msg.id, e.target.value)}
                                                    className={`text-[9px] bg-transparent border-none outline-none cursor-pointer font-bold ${isDark ? 'text-slate-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
                                                >
                                                    {['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '21:9'].map(r => (
                                                        <option key={r} value={r} className={isDark ? 'bg-slate-900' : 'bg-white'}>{r}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className={`text-[10px] italic ${isDark ? 'text-slate-300' : 'text-zinc-600'}`}>
                                                "{msg.imageParams.prompt}"
                                            </div>
                                            {msg.imageParams.copy && (
                                                <div className="text-[10px] text-blue-500 font-medium">
                                                    📝 文案: {msg.imageParams.copy}
                                                </div>
                                            )}
                                            {msg.imageParams.needLabels && msg.imageParams.needLabels.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {msg.imageParams.needLabels.map(l => (
                                                        <span key={l} className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[8px] border border-blue-500/20">
                                                            🔍 {l}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Manual Selection Indicator in Proposal */}
                                            {currentSession.messages.some(m => m.files?.some(f => f.selected)) && (
                                                <div className="mt-2 pt-2 border-t border-white/5">
                                                    <div className="text-[8px] font-bold text-blue-500 uppercase mb-1 flex items-center gap-1">
                                                        <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                                        已手动锁定参考图:
                                                    </div>
                                                    <div className="flex gap-1 overflow-x-auto pb-1 custom-scrollbar">
                                                        {currentSession.messages.flatMap(m =>
                                                            (m.files || []).filter(f => f.selected && f.isImage).map((f, idx) => (
                                                                <div key={`${m.id}-${idx}`} className="relative shrink-0">
                                                                    <img src={f.content} className="w-8 h-8 object-cover rounded border border-blue-500/50" alt="selected ref" />
                                                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-0.5 rounded bg-blue-500 text-white text-[5px] font-black uppercase">LOCKED</div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            <button
                                                onClick={() => handleConfirmGenerate(msg.id)}
                                                disabled={isChatSending || generatingImage}
                                                className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 text-black text-[10px] font-bold rounded-lg transition-all shadow-lg active:scale-95"
                                            >
                                                {generatingImage ? '正在生成...' : '确认并生成图片'}
                                            </button>
                                        </div>
                                    )}

                                    {/* AI Generated Image */}
                                    {msg.generatedImage && (
                                        <div className="mt-3 relative group">
                                            <img
                                                src={msg.generatedImage}
                                                className="max-w-full rounded-xl border border-white/10 shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                alt={msg.moduleInfo || 'Generated'}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', msg.generatedImage!);
                                                }}
                                            />
                                            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a
                                                    href={msg.generatedImage}
                                                    download={`${msg.moduleInfo || 'image'}.png`}
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
                            )}
                            {/* Pending Actions */}
                            {msg.pendingActions && msg.pendingActions.length > 0 && (
                                <div className="mt-2 space-y-2 w-full">
                                    {msg.pendingActions.map((action, idx) => (
                                        <div key={idx} className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-zinc-200 shadow-sm'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-zinc-500'}`}>
                                                    建议操作
                                                </span>
                                                {action.executed && <span className="text-[10px] text-green-500 font-bold">已执行 ✅</span>}
                                                {action.cancelled && <span className="text-[10px] text-slate-500 font-bold">已取消 ✕</span>}
                                            </div>
                                            <div className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-zinc-800'}`}>
                                                {action.description}
                                            </div>
                                            {!action.executed && !action.cancelled && (
                                                <div className="flex gap-2 mt-1">
                                                    <button
                                                        onClick={() => handleConfirmAction(msg.id, idx)}
                                                        className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-colors"
                                                    >
                                                        确认执行
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelAction(msg.id, idx)}
                                                        className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${isDark ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add to Canvas button for AI messages */}
                            {msg.role === 'assistant' && !msg.isError && msg.content && onAddNode && (
                                <button
                                    onClick={() => {
                                        onAddNode('TEXT_FAST');
                                        // Note: The node is created, user can then edit the prompt in the node
                                    }}
                                    className={`mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}
                                    title="将此回复添加为画布节点"
                                >
                                    <PlusCircle size={12} />
                                    添加为节点
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {(isChatSending || generatingImage || isAnalyzingDNA) && (
                    <div className="flex gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${generatingImage ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                            <Bot size={16} className="text-white" />
                        </div>
                        <div className={`rounded-2xl rounded-tl-none px-4 py-2 border flex items-center gap-2 ${generatingImage
                            ? (isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700')
                            : (isDark ? 'bg-slate-800/50 border-white/10' : 'bg-zinc-100 border-zinc-200')
                            }`}>
                            <div className="flex gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-slate-400'}`} style={{ animationDelay: '0s' }}></div>
                                <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-slate-400'}`} style={{ animationDelay: '0.2s' }}></div>
                                <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-slate-400'}`} style={{ animationDelay: '0.4s' }}></div>
                            </div>
                            {generatingImage && <span className="text-[10px] font-bold uppercase tracking-tighter">🎨 图像生成中...</span>}
                            {isAnalyzingDNA && <span className="text-[10px] font-bold uppercase tracking-tighter text-emerald-500">🧬 正在分析视觉基因...</span>}
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className={`relative z-20 p-3 border-t ${isDark ? 'border-white/10 bg-white/5' : 'border-zinc-200 bg-zinc-50'}`}>
                {/* Sticky Reference Bar (Session Images) */}
                {mode === 'detail_page' && allUserImages.length > 0 && (
                    <div className="relative mb-3 pb-2 border-b border-white/5">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-zinc-400'}`}>
                                🖼️ 产品参考库 <span className="text-[8px] font-normal lowercase">(点击锁定 / 悬停放大)</span>
                            </span>
                            {hiddenReferenceIds.size > 0 && (
                                <button
                                    onClick={() => setHiddenReferenceIds(new Set())}
                                    className="text-[8px] font-bold text-blue-500 hover:text-blue-400 uppercase"
                                >
                                    重置库
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {allUserImages.map((img, idx) => (
                                <div
                                    key={`${img.messageId}-${img.fileIndex}`}
                                    className={`relative shrink-0 cursor-pointer transition-all group ${img.selected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent rounded-lg' : ''}`}
                                    onClick={() => toggleHistoryFileSelection(img.messageId, img.fileIndex)}
                                    onMouseEnter={() => setHoveredRefImage(img)}
                                    onMouseLeave={() => setHoveredRefImage(null)}
                                >
                                    <img src={img.content} className="w-10 h-10 object-cover rounded border border-white/10" alt="ref" />

                                    {/* Hide Button */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); hideReferenceImage(img.messageId, img.fileIndex); }}
                                        className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10`}
                                        title="从库中移除"
                                    >
                                        <X size={8} />
                                    </button>

                                    {img.selected && (
                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded bg-blue-500 text-white text-[6px] font-black uppercase tracking-tighter shadow-sm">
                                            REF
                                        </div>
                                    )}
                                    {/* Selection Dot */}
                                    <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full border flex items-center justify-center transition-all ${img.selected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/20 border-white/40 opacity-0 group-hover:opacity-100'}`}>
                                        {img.selected && <div className="w-1 h-1 bg-white rounded-full" />}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Hover Zoom Preview - Moved outside overflow container to prevent clipping */}
                        {hoveredRefImage && (
                            <div className={`absolute bottom-full left-0 mb-2 w-48 h-48 rounded-xl shadow-2xl border backdrop-blur-xl z-[100] pointer-events-none animate-in fade-in zoom-in duration-200 ${isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-zinc-200'}`}>
                                <img src={hoveredRefImage.content} className="w-full h-full object-contain rounded-lg p-1" alt="zoom" />
                            </div>
                        )}
                    </div>
                )}

                {chatFiles.length > 0 && (
                    <div className="flex flex-col gap-2 mb-2">
                        <div className="flex items-center justify-between px-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-zinc-400'}`}>
                                已上传文件 {selectedFileIds.size > 0 && <span className="text-blue-500 ml-1">(已锁定 {selectedFileIds.size} 个参考源)</span>}
                            </span>
                            {selectedFileIds.size > 0 && (
                                <button
                                    onClick={clearFileSelection}
                                    className={`text-[9px] font-bold uppercase text-blue-500 hover:text-blue-400 transition-colors`}
                                >
                                    清除选择
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            {chatFiles.map((f, i) => {
                                const isSelected = selectedFileIds.has(f.id);
                                return (
                                    <div key={f.id} className="relative group shrink-0 flex flex-col items-center">
                                        <div
                                            className={`relative cursor-pointer transition-all ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent rounded-lg' : ''}`}
                                            onClick={() => f.isImage && toggleFileSelection(f.id)}
                                        >
                                            {f.isImage ? (
                                                <img src={f.content} className={`w-12 h-12 object-cover rounded border ${isDark ? 'border-white/10' : 'border-zinc-300'}`} alt={f.name} />
                                            ) : (
                                                <div className={`w-12 h-12 rounded flex flex-col items-center justify-center ${isDark ? 'bg-slate-800 border-white/10 text-slate-400' : 'bg-zinc-100 border-zinc-300 text-zinc-500'}`}>
                                                    <FileText size={16} />
                                                    <span className="text-[8px] mt-1">{f.fileExt}</span>
                                                </div>
                                            )}

                                            {/* Selection Indicator */}
                                            {f.isImage && (
                                                <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/20 border-white/40 opacity-0 group-hover:opacity-100'}`}>
                                                    {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                </div>
                                            )}

                                            {/* Reference Badge */}
                                            {isSelected && (
                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded bg-blue-500 text-white text-[7px] font-black uppercase tracking-tighter shadow-sm">
                                                    REF
                                                </div>
                                            )}

                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeChatFile(i); }}
                                                className={`absolute -top-1 -right-1 rounded-full p-0.5 border opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'bg-slate-900 text-slate-400 hover:text-white border-white/10' : 'bg-white text-zinc-500 hover:text-zinc-900 border-zinc-300'}`}
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="标签..."
                                            value={f.label || ''}
                                            onChange={(e) => updateChatFileLabel(i, e.target.value)}
                                            className={`w-12 mt-2 text-[8px] px-1 py-0.5 rounded border outline-none transition-all ${isDark ? 'bg-slate-900 border-white/10 text-slate-300 focus:border-blue-500' : 'bg-white border-zinc-300 text-zinc-600 focus:border-blue-500'}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className={`relative rounded-xl flex items-end p-2 focus-within:border-blue-500/50 transition-colors border ${isDark ? 'bg-slate-800/50 border-white/10' : 'bg-white border-zinc-300'}`}>
                    <label className={`p-2 cursor-pointer transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`} title="Upload File">
                        <Paperclip size={18} />
                        <input type="file" multiple className="hidden" onChange={handleChatFileUpload} />
                    </label>
                    <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                        onPaste={handlePaste}
                        placeholder="输入消息，可粘贴图片..."
                        className={`w-full bg-transparent text-sm resize-none outline-none max-h-32 py-2 px-1 custom-scrollbar ${isDark ? 'text-white placeholder-slate-500' : 'text-zinc-800 placeholder-zinc-400'}`}
                        rows={1}
                        style={{ minHeight: '36px' }}
                    />
                    <button
                        onClick={sendChatMessage}
                        disabled={(!chatInput.trim() && chatFiles.length === 0) || isChatSending}
                        className={`p-2 rounded-lg transition-all mb-0.5 ${(!chatInput.trim() && chatFiles.length === 0) || isChatSending ? 'opacity-50 bg-transparent text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div className={`text-[10px] text-center mt-2 ${isDark ? 'text-slate-500' : 'text-zinc-500'}`}>
                    支持粘贴图片 / MP4/MP3/PDF/文档/代码 • Enter 发送
                </div>
            </div>
        </div>
    );
};

export default AIChatSidebar;
