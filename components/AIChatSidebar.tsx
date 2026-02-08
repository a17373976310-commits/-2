import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    X, Plus, History, ChevronLeft, User, Bot,
    FileText, Paperclip, Send, PlusCircle, ChevronDown,
    Box, Play
} from 'lucide-react';
import { marked } from 'marked';
import { SUGGESTED_MODELS, PLUGINS } from '../constants';
import { PluginCategory, LogEntry, ApiConfig, ApiProvider } from '../types';
import { apiService } from '../services/ApiService';
import {
    IMAGE_COMPILER_PROMPT,
    INTENT_ROUTER_PROMPT,
    VISUAL_CRITIC_PROMPT,
    DETAIL_PAGE_AGENT_PROMPT,
    DNA_GENERATOR_PROMPT
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
        useUserImage?: boolean;
        needLabels?: string[];
        ratioReasoning?: string;
        subjectRef?: string;
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
    // Global model sync
    categoryModels?: Record<PluginCategory, string>;
    setCategoryModels?: React.Dispatch<React.SetStateAction<Record<PluginCategory, string>>>;
    fetchedModelsMap?: Record<string, string[]>;
    setFetchedModelsMap?: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
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
    logs = [],
    categoryModels,
    setCategoryModels,
    fetchedModelsMap,
    setFetchedModelsMap
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

    const [isRefreshingModels, setIsRefreshingModels] = useState<string | null>(null);
    const [isCustomModelInput, setIsCustomModelInput] = useState<Record<string, boolean>>({});

    // Use local fallback if props not provided
    const [localSelectedModels, setLocalSelectedModels] = useState<Record<string, string>>({
        '推理模型': SUGGESTED_MODELS[PluginCategory.LOGIC][0]?.id || 'gpt-5.2',
        '图像模型': SUGGESTED_MODELS[PluginCategory.VISUAL][0]?.id || 'nano-banana-2',
        '视频模型': SUGGESTED_MODELS[PluginCategory.VIDEO][0]?.id || 'luma-dream-machine',
    });
    const [localFetchedModelsMap, setLocalFetchedModelsMap] = useState<Record<string, string[]>>({});

    const currentFetchedModelsMap = fetchedModelsMap || localFetchedModelsMap;

    const updateSelectedModel = (categoryName: string, modelId: string) => {
        const pluginCat = CATEGORY_MAP[categoryName];
        if (setCategoryModels && pluginCat) {
            setCategoryModels(prev => ({ ...prev, [pluginCat]: modelId }));
        } else {
            setLocalSelectedModels(prev => ({ ...prev, [categoryName]: modelId }));
        }
    };

    const getSelectedModelId = (categoryName: string) => {
        const pluginCat = CATEGORY_MAP[categoryName];
        if (pluginCat && categoryModels) return categoryModels[pluginCat];
        return localSelectedModels[categoryName];
    };

    const [openDropdownCategory, setOpenDropdownCategory] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Detail page generation mode
    const [mode, setMode] = useState<'chat' | 'detail_page'>('chat');
    const [generatingImage, setGeneratingImage] = useState(false);
    const [isAnalyzingDNA, setIsAnalyzingDNA] = useState(false);
    const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
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

    // Save chat sessions to localStorage with quota management (debounced)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingSessionsRef = useRef<ChatSession[]>(chatSessions);

    useEffect(() => {
        pendingSessionsRef.current = chatSessions;

        // 防抖：延迟 1 秒后写入 localStorage，避免频繁写入
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            try {
                const sessions = pendingSessionsRef.current;
                // Create a lightweight version of sessions for storage
                let sessionsToSave = sessions.map(session => ({
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

                // 保存前估算体积
                const estimateSize = (data: any): number => {
                    return new Blob([JSON.stringify(data)]).size;
                };

                // 如果体积过大(超过4MB)，清空图片数据
                if (estimateSize(sessionsToSave) > 4 * 1024 * 1024) {
                    sessionsToSave = sessionsToSave.map(session => ({
                        ...session,
                        messages: session.messages.map(msg => ({
                            ...msg,
                            files: msg.files?.map(f => f.isImage ? { ...f, content: '' } : f)
                        }))
                    }));

                    // 如果仍然过大，只保留最近10条消息
                    if (estimateSize(sessionsToSave) > 4 * 1024 * 1024) {
                        sessionsToSave = sessionsToSave.map(session => ({
                            ...session,
                            messages: session.messages.slice(-10)
                        }));
                    }
                }

                localStorage.setItem('ai_chat_sessions', JSON.stringify(sessionsToSave));
            } catch (e) { console.error('Failed to save chat sessions', e); }
        }, 1000); // 1 秒防抖

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
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
                const newWidth = Math.min(Math.max(e.clientX, 320), window.innerWidth * 0.8);
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

    // 优化：将 hiddenReferenceIds 转换为字符串用于依赖比较，避免 Set 引用变化导致重计算
    const hiddenRefKey = useMemo(() => Array.from(hiddenReferenceIds).join(','), [hiddenReferenceIds]);

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
        // 使用 hiddenRefKey 代替 hiddenReferenceIds，避免 Set 引用变化导致重计算
    }, [currentSession, hiddenRefKey]);

    // Sync models when default providers change or on mount
    const lastDefaultProviderId = useRef<string | null>(null);
    const lastDefaultImageProviderId = useRef<string | null>(null);

    useEffect(() => {
        if (apiConfig.providers.length > 0) {
            const defaultChatProvider = apiConfig.providers.find(p => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0];
            const defaultImgProvider = apiConfig.providers.find(p => p.id === apiConfig.defaultImageProviderId) || defaultChatProvider;

            // Helper to check if a model is supported by a provider
            const isSupported = (modelId: string, providerModels: string[]) => {
                if (!modelId) return false;
                if (providerModels.includes('所有') || providerModels.includes('*')) return true;
                return providerModels.includes(modelId);
            };

            const isFirstRun = lastDefaultProviderId.current === null;

            // Logic/Chat Model Sync
            const logicModelId = getSelectedModelId('推理模型');
            const providerChanged = apiConfig.defaultProviderId !== lastDefaultProviderId.current;
            const currentModelUnsupported = !isSupported(logicModelId, defaultChatProvider.models);

            if (isFirstRun || providerChanged || currentModelUnsupported) {
                if (defaultChatProvider && defaultChatProvider.models.length > 0) {
                    const firstRealModel = defaultChatProvider.models.find(m => m !== '所有' && m !== '*') || defaultChatProvider.models[0];
                    if (logicModelId !== firstRealModel) {
                        updateSelectedModel('推理模型', firstRealModel);
                    }
                }
            }

            // Visual/Image Model Sync
            const imgModelId = getSelectedModelId('图像模型');
            const imgProviderChanged = apiConfig.defaultImageProviderId !== lastDefaultImageProviderId.current;
            const imgModels = defaultImgProvider?.imageModels || defaultImgProvider?.models || [];
            const currentImgModelUnsupported = !isSupported(imgModelId, imgModels);

            if (isFirstRun || imgProviderChanged || currentImgModelUnsupported) {
                if (imgModels.length > 0) {
                    const firstRealImgModel = imgModels.find(m => m !== '所有' && m !== '*') || imgModels[0];
                    if (imgModelId !== firstRealImgModel) {
                        updateSelectedModel('图像模型', firstRealImgModel);
                    }
                }
            }

            lastDefaultProviderId.current = apiConfig.defaultProviderId;
            lastDefaultImageProviderId.current = apiConfig.defaultImageProviderId;
        }
    }, [apiConfig.defaultProviderId, apiConfig.defaultImageProviderId, apiConfig.providers, categoryModels, localSelectedModels]);

    const refreshProviderModels = async (category: string) => {
        if (apiConfig.providers.length > 0) {
            const provider = category === '图像模型'
                ? (apiConfig.providers.find(p => p.id === apiConfig.defaultImageProviderId) || apiConfig.providers[0])
                : (apiConfig.providers.find(p => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0]);

            if (!provider) return;

            setIsRefreshingModels(category);
            try {
                const models = await apiService.fetchModels(provider);
                if (models.length > 0) {
                    if (setFetchedModelsMap) {
                        setFetchedModelsMap(prev => ({ ...prev, [provider.id]: models }));
                    } else {
                        setLocalFetchedModelsMap(prev => ({ ...prev, [provider.id]: models }));
                    }
                    console.log(`[AIChatSidebar] Successfully fetched ${models.length} models for ${provider.name}`);
                } else {
                    alert('该接口未返回任何可用模型列表。');
                }
            } catch (err: any) {
                console.error("Refresh Models Error:", err);
                alert(`刷新失败: ${err.message}`);
            } finally {
                setIsRefreshingModels(null);
            }
        }
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // 跟踪是否应该自动滚动（用户发送新消息时应该滚动，AI回复时也应该滚动）
    const shouldScrollRef = useRef(false);
    const prevMessagesLengthRef = useRef(0);

    useEffect(() => {
        const currentLength = currentSession?.messages?.length || 0;
        const prevLength = prevMessagesLengthRef.current;

        // 只在消息数量增加时滚动（新消息到来）
        if (currentLength > prevLength) {
            shouldScrollRef.current = true;
        }

        prevMessagesLengthRef.current = currentLength;

        if (shouldScrollRef.current && isOpen) {
            scrollToBottom();
            shouldScrollRef.current = false;
        }
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

            // 文件大小检查（最大 20MB）
            if (file.size > 20 * 1024 * 1024) {
                console.error(`文件 ${file.name} 过大，最大支持 20MB`);
                continue;
            }

            const reader = new FileReader();

            reader.onload = (ev) => {
                try {
                    const content = ev.target?.result as string;
                    if (!content) {
                        console.error(`文件 ${file.name} 读取结果为空`);
                        return;
                    }
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
                } catch (err) {
                    console.error(`处理文件 ${file.name} 失败:`, err);
                }
            };

            reader.onerror = () => {
                console.error(`读取文件 ${file.name} 失败:`, reader.error);
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

        const logicModelId = getSelectedModelId('推理模型');
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
        const recentMessages = allMessages.slice(-10); // Reduce window to 10 for speed

        const nodesContext = nodes.length > 0
            ? nodes.slice(-15).map(n => `- [${n.id}] ${n.titleZh} (${n.type})`).join('\n')
            : '暂无节点';
        const selectedInfo = selectedNodeId
            ? `用户当前选中的节点: ${selectedNodeId}`
            : '';

        const logsContext = logs.slice(-20).map(log =>
            `[${log.level.toUpperCase()}] ${log.message}`
        ).join('\n') || '暂无日志';

        // L2 Intent Routing
        let intent = "GENERAL_CHAT";
        setThinkingStatus("🚦 正在分析您的意图...");

        // Define image labels early for use in prompts
        const hasAnySelectionInSession = allUserImages.some(img => img.selected) || newUserMsg.files?.some(f => f.selected);
        const imageLabels = newUserMsg.files?.filter(f => f.isImage && (!hasAnySelectionInSession || f.selected)).map(f => f.label || '') || [];

        try {
            const rawIntent = await apiService.request(logicProvider, '/chat/completions', {
                model: effectiveModel,
                messages: [{ role: "system", content: INTENT_ROUTER_PROMPT }, { role: "user", content: newUserMsg.content }],
                max_tokens: 10
            });
            intent = rawIntent.choices[0].message.content.trim().toUpperCase();
            console.log("[AIChatSidebar] Routed Intent:", intent);
        } catch (e) {
            console.warn("[AIChatSidebar] Intent Routing failed, defaulting to GENERAL_CHAT");
        }

        setThinkingStatus("🧠 正在回顾视觉 DNA 与上下文...");
        let systemPrompt = "";

        // Identify manually selected subjects
        const currentSelected = chatFiles.filter(f => selectedFileIds.has(f.id));
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

        // Comprehensive Environment Snapshot
        const envSnapshot = `
【Environment Snapshot】
- Locked DNA: ${visualDNA ? "Active" : "None"}
- Canvas Nodes: ${nodes.slice(-15).length}
- Session Images: ${allUserImages.length}
- Image Inventory: ${allUserImages.map(img => `[${img.label || '未标注'}]`).join(', ')}
- Manual Subject Lock: ${allSelected.length > 0 ? allSelected.map(img => `[${img.label || '未命名'}]`).join(', ') : "None (AI must choose)"}
${allSelected.length > 0
                ? "⚠️ User has manually locked specific subjects. You MUST design strictly around these."
                : "💡 No manual lock. YOU MUST autonomously pick the most appropriate subject (Product vs Reference) from the inventory based on labels and task goal."}`;

        if (mode === 'detail_page' || intent === 'STYLE_ANALYSIS' || intent === 'IMAGE_GEN') {
            if (!visualDNA || intent === 'STYLE_ANALYSIS') {
                systemPrompt = DNA_GENERATOR_PROMPT + envSnapshot;
            } else {
                systemPrompt = IMAGE_COMPILER_PROMPT.replace('{visualDNA}', visualDNA) + envSnapshot;
            }
        } else if (intent === 'CANVAS_MGT') {
            systemPrompt = `你是一个画布管理助手。你可以通过 [ADD_NODE:TYPE] 或 [UPDATE_NODE:ID:prompt="..."] 指令来操作画布。\n当前画布节点: ${nodesContext}`;
        } else {
            const template = await apiService.getPromptTemplate('AI_CHAT_SYSTEM');
            systemPrompt = (template || `你是一个智能画布助手。当前画布节点: ${nodesContext}`)
                .replace('{nodesContext}', nodesContext)
                .replace('{selectedInfo}', selectedInfo)
                .replace('{logsContext}', logsContext);
        }

        // Apply Detail Page Agent wrapper as master coordinator
        let finalSystemPrompt = DETAIL_PAGE_AGENT_PROMPT.replace('{nodesContext}', nodesContext);
        if (systemPrompt) {
            finalSystemPrompt += `\n\n## CURRENT TASK: SPECIALIST INSTRUCTIONS ##\n${systemPrompt}`;
        }

        try {
            // Global Selection Priority
            const currentBase64Images = newUserMsg.files?.filter(f => f.isImage && (!hasAnySelectionInSession || f.selected)).map(f => f.content) || [];

            // Intelligent History Image Pruning:
            // 1. Only send images from the most RECENT 4 messages in history
            // 2. Always include manually SELECTED (locked) images
            // 3. De-duplicate images
            const seenImages = new Set<string>();
            currentBase64Images.forEach(img => seenImages.add(img.substring(0, 1000)));

            const prunedHistory = recentMessages.map((m, idx) => {
                const isVeryRecent = idx >= recentMessages.length - 4; // Last 2 rounds
                return {
                    role: m.role,
                    content: m.content,
                    images: m.files?.filter(f => {
                        if (!f.isImage || !f.content) return false;
                        if (f.selected) return true; // Always keep locked
                        return isVeryRecent && !hasAnySelectionInSession;
                    }).map(f => f.content).filter(img => {
                        const hash = img.substring(0, 1000);
                        if (seenImages.has(hash)) return false;
                        seenImages.add(hash);
                        return true;
                    }),
                    imageLabels: m.files?.filter(f => f.isImage && (!hasAnySelectionInSession || f.selected)).map(f => f.label || '')
                };
            });

            setThinkingStatus("🖋️ 正在为您策划设计方案...");
            let aiContent = await apiService.chatPro(
                newUserMsg.content,
                effectiveModel,
                logicProvider,
                currentBase64Images,
                finalSystemPrompt,
                prunedHistory,
                imageLabels,
                setThinkingStatus
            );

            setThinkingStatus(null);

            // Comprehensive Parsing: DNA, Actions, and Image Generation
            const imageMatch = aiContent.match(/\[GENERATE_IMAGE\]([\s\S]*?)\[\/GENERATE_IMAGE\]/);
            const dnaV2Match = aiContent.match(/\[VISUAL_DNA_V2\]([\s\S]*?)\[\/VISUAL_DNA_V2\]/);
            const dnaLegacyMatch = aiContent.match(/\[STYLE_DNA\]([\s\S]*?)\[\/STYLE_DNA\]/);
            const dnaMatch = dnaV2Match || dnaLegacyMatch;

            const pendingActions: PendingAction[] = [];
            const addNodeMatches = Array.from(aiContent.matchAll(/\[ADD_NODE:([\w_]+)\]/g));
            for (const match of addNodeMatches) {
                pendingActions.push({
                    type: 'ADD_NODE',
                    params: { type: match[1] },
                    description: `添加节点: ${match[1]}`
                });
            }

            const updateNodeMatches = Array.from(aiContent.matchAll(/\[UPDATE_NODE:([\w]+):prompt="([^"]+)"\]/g));
            for (const match of updateNodeMatches) {
                pendingActions.push({
                    type: 'UPDATE_NODE',
                    params: { id: match[1], prompt: match[2] },
                    description: `更新节点 ${match[1]} 的提示词`
                });
            }

            // Handle DNA update
            if (dnaMatch) {
                const extractedDNA = dnaMatch[1].trim();
                setVisualDNA(extractedDNA);
                const identityMatch = extractedDNA.match(/product_identity:\s*(.+)/);
                if (identityMatch) {
                    setProductIdentity(identityMatch[1].trim());
                }
            }

            // Prepare Clean Content
            const cleanContent = aiContent
                .replace(/\[ADD_NODE:[\w_]+\]/g, '')
                .replace(/\[UPDATE_NODE:[^\]]+\]/g, '')
                .replace(/\[VISUAL_DNA_V2\][\s\S]*?\[\/VISUAL_DNA_V2\]/, '')
                .replace(/\[STYLE_DNA\][\s\S]*?\[\/STYLE_DNA\]/, '')
                .replace(/\[GENERATE_IMAGE\][\s\S]*?\[\/GENERATE_IMAGE\]/, '')
                .trim();

            const assistantMsgId = `msg-${Date.now()}`;
            const assistantMsg: ChatMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: cleanContent || (imageMatch ? "我为您策划了如下设计方案：" : (pendingActions.length > 0 ? "我已为您生成了设计提案及对应的画布节点：" : "方案已生成，请查看下方操作区块。")),
                timestamp: Date.now(),
                modelId: logicModelId,
            };

            // Populate Image Params if present
            if (imageMatch) {
                const directive = imageMatch[1];
                const moduleMatch = directive.match(/module:\s*(.+)/);
                const promptMatch = directive.match(/prompt:\s*(.+)/);
                const copyMatch = directive.match(/copy:\s*(.+)/);
                const ratioMatch = directive.match(/ratio:\s*(.+)/);
                const ratioReasoningMatch = directive.match(/ratio_reasoning:\s*(.+)/);
                const subjectRefMatch = directive.match(/subject_ref:\s*(.+)/);
                const needLabelsMatch = directive.match(/needLabels:\s*(.+)/);

                assistantMsg.moduleInfo = moduleMatch?.[1]?.trim() || '未命名模块';
                assistantMsg.imageParams = {
                    prompt: promptMatch?.[1]?.trim() || '',
                    ratio: ratioMatch?.[1]?.trim() || '3:4',
                    module: assistantMsg.moduleInfo,
                    copy: copyMatch?.[1]?.trim() || '',
                    needLabels: needLabelsMatch?.[1] ? needLabelsMatch[1].split(',').map(s => s.trim()).filter(s => s) : undefined,
                    ratioReasoning: ratioReasoningMatch?.[1]?.trim(),
                    subjectRef: subjectRefMatch?.[1]?.trim()
                };
            }

            // Populate Pending Actions
            if (pendingActions.length > 0) {
                assistantMsg.pendingActions = pendingActions;
            }

            setChatSessions(prev => prev.map(s => {
                if (s.id === currentChatId) {
                    return { ...s, messages: [...s.messages, assistantMsg] };
                }
                return s;
            }));

        } catch (error: any) {
            console.error("Chat Error", error);
            let errorMessage = error.message || 'openai_error';

            // Add user-friendly guidance for common technical errors
            if (errorMessage.includes('504') || errorMessage.includes('timeout') || errorMessage.includes('openai_error')) {
                errorMessage = `由于对话中的高清图过多，导致请求响应超时 (Error 504 / openai_error)。\n\n💡 **紧急恢复办法**：\n1. **锁定关键图**：点击你认定为“产品主体”和“视觉参考”的图片右上角的 **锁 🔒 按钮**。锁定后，其余几十张历史图片将不会再被重复发送，响应速度会提升 10 倍。\n2. **刷新会话**：如果方案已经锁定，建议点击左侧“+”开启新会话，新会话会自动继承之前的视觉 DNA，且不再受历史图干扰。`;
            }

            const errorMsg: ChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: `Error: ${errorMessage}`,
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
            const imageModelId = getSelectedModelId('图像模型');
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
            // Priority 2: AI Specific Subject Reference (Directive Board)
            else if (msg.imageParams.subjectRef && msg.imageParams.subjectRef !== 'manual_lock') {
                filteredImages = allUserImagesInSession.filter(img =>
                    img.label.toLowerCase().includes(msg.imageParams.subjectRef!.toLowerCase())
                );
            }
            // Priority 3: AI Label Priority (If no specific subjectRef)
            if (filteredImages.length === 0 && needLabels && needLabels.length > 0) {
                filteredImages = allUserImagesInSession.filter(img =>
                    needLabels.some(nl => img.label.toLowerCase().includes(nl.toLowerCase()))
                );
            }

            // Priority 4: Fallback (If still no match, prioritize "白底", then "主图"/"产品")
            if (filteredImages.length === 0 && allUserImagesInSession.length > 0) {
                filteredImages = allUserImagesInSession.filter(img => img.label.includes('白底'));
                if (filteredImages.length === 0) {
                    filteredImages = allUserImagesInSession.filter(img =>
                        img.label.includes('主图') || img.label.includes('产品')
                    );
                }
                // Priority 5: Ultimate Fallback (First image ever uploaded)
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

    // 优化：缓存模型选择器数据，避免每次渲染重复计算
    const modelSelectorData = useMemo(() => {
        return Object.entries(CATEGORY_MAP).map(([category, pluginCategory]) => {
            const provider = category === '图像模型'
                ? (apiConfig.providers.find(p => p.id === apiConfig.defaultImageProviderId) || apiConfig.providers[0])
                : (apiConfig.providers.find(p => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0]);

            const providerModels = category === '图像模型'
                ? (provider?.imageModels || provider?.models || [])
                : (provider?.models || []);

            const fetchedModels = (provider && fetchedModelsMap[provider.id]) || [];
            const suggested = SUGGESTED_MODELS[pluginCategory] || [];

            // 优先级：1. 建议模型 2. 接口获取的模型 3. 配置中的模型
            const allAvailableModels = [...suggested];

            fetchedModels.forEach(mId => {
                if (!allAvailableModels.some(m => m.id === mId)) {
                    allAvailableModels.push({ id: mId, label: mId });
                }
            });

            providerModels.forEach(mId => {
                if (!allAvailableModels.some(m => m.id === mId)) {
                    allAvailableModels.push({ id: mId, label: mId });
                }
            });

            const currentModelId = getSelectedModelId(category);
            if (currentModelId && !allAvailableModels.some(m => m.id === currentModelId)) {
                allAvailableModels.push({ id: currentModelId, label: currentModelId });
            }

            const currentModel = allAvailableModels.find(m => m.id === currentModelId);

            return {
                category,
                pluginCategory,
                provider,
                allAvailableModels,
                currentModel
            };
        });
    }, [apiConfig.providers, apiConfig.defaultProviderId, apiConfig.defaultImageProviderId, categoryModels, localSelectedModels, currentFetchedModelsMap]);

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
            <div className={`min-h-14 flex flex-wrap items-center justify-between px-4 shrink-0 border-b gap-2 py-2 ${isDark ? 'border-white/10 bg-white/5' : 'border-zinc-200'}`}>
                <div className="flex items-center gap-3 relative flex-wrap">
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>

                    {/* Multi-Category Model Selectors */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {modelSelectorData.map(({ category, allAvailableModels, currentModel }) => (
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
                                    {isCustomModelInput[category] ? (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                            <input
                                                autoFocus
                                                type="text"
                                                className={`bg-transparent border-none outline-none text-[10px] w-20 ${isDark ? 'text-white' : 'text-black'}`}
                                                placeholder="模型名..."
                                                value={getSelectedModelId(category)}
                                                onChange={(e) => updateSelectedModel(category, e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') setIsCustomModelInput(prev => ({ ...prev, [category]: false }));
                                                }}
                                            />
                                            <button onClick={() => setIsCustomModelInput(prev => ({ ...prev, [category]: false }))} className="text-blue-500">确定</button>
                                        </div>
                                    ) : (
                                        <>
                                            {currentModel?.label || getSelectedModelId(category) || '选择模型'}
                                            <ChevronDown size={10} className={openDropdownCategory === category ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                        </>
                                    )}
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
                                                        updateSelectedModel(category, model.id);
                                                        setOpenDropdownCategory(null);
                                                        setIsCustomModelInput(prev => ({ ...prev, [category]: false }));
                                                    }}
                                                    className={`w-full text-left px-3 py-1.5 text-[11px] ${getSelectedModelId(category) === model.id
                                                        ? (isDark ? 'bg-blue-600/20 text-blue-400 font-bold' : 'bg-blue-50 text-blue-600 font-bold')
                                                        : (isDark ? 'text-slate-300 hover:bg-white/5' : 'text-zinc-600 hover:bg-zinc-50')
                                                        }`}
                                                >
                                                    {model.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className={`mt-1 pt-1 border-t px-1 space-y-0.5 ${isDark ? 'border-white/5' : 'border-zinc-100'}`}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    refreshProviderModels(category);
                                                }}
                                                disabled={isRefreshingModels === category}
                                                className={`w-full text-left px-2 py-1 text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-between rounded-md ${isRefreshingModels === category
                                                    ? 'opacity-50 cursor-not-allowed'
                                                    : (isDark ? 'text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-500' : 'text-amber-600/70 hover:bg-amber-50/50 hover:text-amber-600')
                                                    }`}
                                            >
                                                <span>{isRefreshingModels === category ? '⏳ 正在刷新列表...' : '🔄 刷新列表'}</span>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsCustomModelInput(prev => ({ ...prev, [category]: true }));
                                                    setOpenDropdownCategory(null);
                                                }}
                                                className={`w-full text-left px-2 py-1 text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-between rounded-md ${isDark ? 'text-blue-500/70 hover:bg-blue-500/10 hover:text-blue-500' : 'text-blue-600/70 hover:bg-blue-50/50 hover:text-blue-600'
                                                    }`}
                                            >
                                                <span>✍️ 自定义模型...</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
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

                <div className="flex items-center gap-1 shrink-0">
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
                {/* Visual DNA Modular Card (Premium Upgrade) */}
                {mode === 'detail_page' && visualDNA && (
                    <div className={`mb-6 p-4 rounded-3xl border backdrop-blur-3xl shadow-2xl animate-in slide-in-from-top duration-700 ${isDark ? 'bg-emerald-500/5 border-emerald-500/20 shadow-emerald-500/5' : 'bg-emerald-50/50 border-emerald-200 shadow-emerald-500/10'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute opacity-20" />
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 relative" />
                                </div>
                                <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    Visual DNA V2.0 Locked
                                </span>
                            </div>
                            <button
                                onClick={() => { setVisualDNA(''); setProductIdentity(''); }}
                                className={`p-1.5 rounded-lg transition-all ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-400/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* DNA Attributes Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {productIdentity && (
                                <div className={`col-span-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    <span className="text-[12px]">📦</span>
                                    <div className="flex flex-col">
                                        <span className="text-[8px] uppercase opacity-50 font-bold tracking-tighter">Product Identity</span>
                                        <span className="text-[10px] font-bold truncate">{productIdentity}</span>
                                    </div>
                                </div>
                            )}

                            {/* Color Palette Preview */}
                            {(() => {
                                const mainColor = visualDNA.match(/palette_main:\s*(#[0-9A-Fa-f]{6}|[a-zA-Z]+)/)?.[1] || '#10b981';
                                const accentColor = visualDNA.match(/palette_accent:\s*(#[0-9A-Fa-f]{6}|[a-zA-Z]+)/)?.[1] || '#3b82f6';
                                return (
                                    <div className={`col-span-2 flex gap-2 p-2 rounded-xl ${isDark ? 'bg-black/20 border border-white/5' : 'bg-zinc-100/50 border border-zinc-200'}`}>
                                        <div className="flex-1 flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg shadow-inner border border-white/10" style={{ backgroundColor: mainColor }} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[7px] uppercase font-bold text-slate-500">Main</span>
                                                <span className="text-[9px] font-mono truncate">{mainColor}</span>
                                            </div>
                                        </div>
                                        <div className="w-px h-6 bg-white/10" />
                                        <div className="flex-1 flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg shadow-inner border border-white/10" style={{ backgroundColor: accentColor }} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[7px] uppercase font-bold text-slate-500">Accent</span>
                                                <span className="text-[9px] font-mono truncate">{accentColor}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Fidelity Checkpoints */}
                            <div className="col-span-2">
                                <div className="text-[8px] font-black uppercase text-slate-500 mb-2 px-1">Fidelity Checkpoints</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(visualDNA.match(/fidelity_checkpoints:\s*\[?(.+?)\]?(\n|$)/)?.[1] || "Material Accuracy,Shape Integrity,Lighting Balance").split(',').map((anchor, i) => (
                                        <span key={i} className={`px-2 py-0.5 rounded-full border text-[8px] font-bold ${isDark ? 'bg-white/5 border-emerald-500/30 text-emerald-400/80' : 'bg-white border-emerald-200 text-emerald-600'}`}>
                                            ⚓ {anchor.trim()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Manual DNA Expansion */}
                        <details className="group">
                            <summary className={`list-none cursor-pointer text-[9px] font-bold flex items-center justify-center gap-1 transition-all ${isDark ? 'text-slate-500 hover:text-white' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                <span>VIEW FULL CODE</span>
                                <ChevronDown size={10} className="group-open:rotate-180 transition-transform" />
                            </summary>
                            <div className={`mt-3 p-3 rounded-xl font-mono text-[9px] leading-relaxed overflow-x-auto custom-scrollbar ${isDark ? 'bg-black/30 text-emerald-500/70 border border-emerald-500/10' : 'bg-white border border-emerald-200 text-emerald-700/70'}`}>
                                {visualDNA}
                            </div>
                        </details>
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

                                    {/* Design Proposal & Confirmation (Premium Node-like UI) */}
                                    {msg.imageParams && !msg.generatedImage && (
                                        <div className={`mt-4 overflow-hidden rounded-2xl border transition-all duration-300 hover:shadow-2xl ${isDark ? 'bg-slate-900 border-white/10 shadow-black' : 'bg-white border-zinc-200 shadow-xl shadow-zinc-200/50'}`}>
                                            {/* Node Header */}
                                            <div className={`px-3 py-2 border-b flex items-center justify-between ${isDark ? 'bg-white/5 border-white/5' : 'bg-zinc-50 border-zinc-100'}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 rounded bg-amber-500/10 border border-amber-500/20">
                                                        <Box size={12} className="text-amber-500" />
                                                    </div>
                                                    <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-zinc-600'}`}>
                                                        {msg.moduleInfo || 'Design Proposal'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                    <span className="text-[8px] font-bold text-amber-500/70 uppercase">Ready to compile</span>
                                                </div>
                                            </div>

                                            <div className="p-4 space-y-4">
                                                {/* Meta Row: Ratio & Fidelity */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 flex flex-col gap-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[7px] font-black text-slate-500 uppercase">Aspect Ratio</span>
                                                            {msg.imageParams?.ratioReasoning && (
                                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[6px] font-black uppercase tracking-wider">
                                                                    💡 AI Suggestion
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                                                            {['1:1', '3:4', '4:3', '9:16', '16:9'].map(r => (
                                                                <button
                                                                    key={r}
                                                                    onClick={() => updateMessageRatio(msg.id, r)}
                                                                    className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all border ${msg.imageParams?.ratio === r
                                                                        ? 'bg-amber-500 border-amber-500 text-black'
                                                                        : (isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white' : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300')
                                                                        }`}
                                                                >
                                                                    {r}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {msg.imageParams?.ratioReasoning && (
                                                            <div className="text-[8px] text-slate-500 leading-tight italic mt-0.5">
                                                                {msg.imageParams.ratioReasoning}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Subject Selection Preview */}
                                                    <div className="flex flex-col gap-1.5 items-end">
                                                        <span className="text-[7px] font-black text-slate-500 uppercase text-right">Target Subject</span>
                                                        {(() => {
                                                            const isManual = msg.imageParams?.subjectRef === 'manual_lock' || (!msg.imageParams?.subjectRef && currentSession.messages.some(m => m.files?.some(f => f.selected)));
                                                            const targetLabel = msg.imageParams?.subjectRef;
                                                            // Search for a matching file in history or current message
                                                            const refFile = targetLabel && targetLabel !== 'manual_lock'
                                                                ? currentSession.messages.flatMap(m => m.files || []).find(f => f.label?.toLowerCase().includes(targetLabel.toLowerCase()))
                                                                : currentSession.messages.flatMap(m => m.files || []).find(f => f.selected);

                                                            return (
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${isManual ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                                                        {isManual ? 'Manual Lock' : (targetLabel || 'Auto Detect')}
                                                                    </div>
                                                                    {refFile?.content && (
                                                                        <div className="w-8 h-8 rounded-lg border border-white/10 overflow-hidden shrink-0">
                                                                            <img src={refFile.content} className="w-full h-full object-cover" alt="target" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* Content Section */}
                                                <div className="space-y-3">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[7px] font-black text-slate-500 uppercase">Strategic Prompt</span>
                                                        <div className={`p-3 rounded-xl text-[10px] leading-relaxed italic border ${isDark ? 'bg-black/20 border-white/5 text-slate-300' : 'bg-zinc-50 border-zinc-100 text-zinc-600'}`}>
                                                            "{msg.imageParams.prompt}"
                                                        </div>
                                                    </div>

                                                    {msg.imageParams.copy && (
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[7px] font-black text-slate-500 uppercase">Visual Copywriting</span>
                                                            <div className={`px-3 py-2 rounded-xl text-[10px] font-bold border ${isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>
                                                                {msg.imageParams.copy.split('|').map((part, i) => (
                                                                    <div key={i} className={i === 0 ? "text-[11px]" : "mt-0.5 opacity-70 font-medium"}>
                                                                        {part.trim()}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Fidelity Anchors Bar */}
                                                {msg.imageParams.needLabels && msg.imageParams.needLabels.length > 0 && (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {msg.imageParams.needLabels.map(l => (
                                                            <span key={l} className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[8px] border border-blue-500/20 flex items-center gap-1">
                                                                <div className="w-1 h-1 rounded-full bg-blue-400" />
                                                                {l}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Render Selection Context */}
                                                {currentSession.messages.some(m => m.files?.some(f => f.selected)) && (
                                                    <div className={`pt-3 border-t ${isDark ? 'border-white/5' : 'border-zinc-100'}`}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[7px] font-black text-blue-500 uppercase">Target Subjects (Fidelity)</span>
                                                            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[6px] font-black tracking-[0.1em] uppercase">Locked</span>
                                                        </div>
                                                        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                                                            {currentSession.messages.flatMap(m =>
                                                                (m.files || []).filter(f => f.selected && f.isImage).map((f, idx) => (
                                                                    <div key={`${m.id}-${idx}`} className="relative shrink-0 transition-transform hover:scale-105">
                                                                        <img src={f.content} className="w-10 h-10 object-cover rounded-lg border border-blue-500/30" alt="selected ref" />
                                                                        <div className="absolute inset-0 ring-1 ring-inset ring-blue-500/30 rounded-lg pointer-events-none" />
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => handleConfirmGenerate(msg.id)}
                                                    disabled={isChatSending || generatingImage}
                                                    className="w-full relative group overflow-hidden"
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-amber-400 transition-transform group-hover:scale-105 duration-300" />
                                                    <div className="relative py-3 text-black text-[11px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2">
                                                        {generatingImage ? (
                                                            <>
                                                                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                                Compiling...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Play size={14} className="fill-black" />
                                                                COMPOSE IMAGE
                                                            </>
                                                        )}
                                                    </div>
                                                </button>
                                            </div>
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
                {(isChatSending || generatingImage || isAnalyzingDNA || thinkingStatus) && (
                    <div className="flex gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${generatingImage ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                            <Bot size={16} className="text-white" />
                        </div>
                        <div className={`rounded-2xl rounded-tl-none px-4 py-2 border flex flex-col gap-2 ${generatingImage
                            ? (isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700')
                            : (isDark ? 'bg-slate-800/50 border-white/10' : 'bg-zinc-100 border-zinc-200 shadow-sm')
                            }`}>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-blue-400'}`} style={{ animationDelay: '0s' }}></div>
                                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-blue-400'}`} style={{ animationDelay: '0.2s' }}></div>
                                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${generatingImage ? 'bg-amber-500' : 'bg-blue-400'}`} style={{ animationDelay: '0.4s' }}></div>
                                </div>
                                {thinkingStatus && <span className={`text-[10px] font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{thinkingStatus}</span>}
                                {generatingImage && <span className="text-[10px] font-bold uppercase tracking-tighter">🎨 图像生成中...</span>}
                                {isAnalyzingDNA && <span className="text-[10px] font-bold uppercase tracking-tighter text-emerald-500">🧬 正在分析视觉基因...</span>}
                            </div>
                            {thinkingStatus?.includes("Reflection") && (
                                <div className={`text-[8px] opacity-60 italic max-w-[200px] truncate`}>
                                    正在对比已锁定的视觉锚点...
                                </div>
                            )}
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
                        style={{ minHeight: '36px', height: 'auto', overflow: 'hidden' }}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                        }}
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


