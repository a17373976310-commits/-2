
import { NodeType, PluginCategory, PluginMetadata } from './types';

export const CATEGORY_LABELS = {
    [PluginCategory.VISUAL]: { zh: '图像创作', en: 'Visual Creation', icon: '🎨' },
    [PluginCategory.VIDEO]: { zh: '视频生成', en: 'Video Generation', icon: '🎬' },
    [PluginCategory.LOGIC]: { zh: '逻辑与搜索', en: 'Logic & Search', icon: '🧠' },
    [PluginCategory.INTERACT]: { zh: '感知与对话', en: 'Perception & Dialog', icon: '🎧' },
};

export const SUGGESTED_MODELS: Record<string, { id: string, label: string }[]> = {
    [PluginCategory.VISUAL]: [
        { id: 'flux.1-schnell', label: 'Flux.1 Schnell' },
        { id: 'dall-e-3', label: 'DALL-E 3' },
        { id: 'nano-banana-2', label: 'Nano Banana 2' },
        { id: 'flux-pro-1.1', label: 'Flux Pro 1.1' },
        { id: 'flux-dev', label: 'Flux Dev' },
    ],
    [PluginCategory.VIDEO]: [
        { id: 'luma-dream-machine', label: 'Luma Dream Machine' },
        { id: 'kling-v1.5-pro', label: 'Kling v1.5 Pro' },
        { id: 'hailuo-mini-v1', label: 'Hailuo Mini' },
    ],
    [PluginCategory.LOGIC]: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-5.2', label: 'GPT-5.2 (Sonnet 3.5)' },
        { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
        { id: 'o1-preview', label: 'O1 Preview' },
        { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    ],
    [PluginCategory.INTERACT]: [
        { id: 'whisper-1', label: 'Whisper 1' },
        { id: 'gpt-4o-realtime', label: 'Realtime Voice' },
    ],
};

export const PLUGINS: PluginMetadata[] = [
    // --- VISUAL CATEGORY ---
    {
        type: NodeType.IMAGE_GEN,
        category: PluginCategory.VISUAL,
        title: 'Image Gen',
        titleZh: '文生图',
        description: 'Create images from text descriptions',
        descriptionZh: '根据文字描述生成精美图像',
        icon: '🖍️',
        color: 'bg-blue-500'
    },
    {
        type: NodeType.IMAGE_EDIT,
        category: PluginCategory.VISUAL,
        title: 'Image Edit',
        titleZh: '图生图',
        description: 'Transform or modify existing images',
        descriptionZh: '基于参考图进行风格转换或局部重绘',
        icon: '✨',
        color: 'bg-purple-500'
    },
    {
        type: NodeType.IMAGE_OUTPAINT,
        category: PluginCategory.VISUAL,
        title: 'Outpaint',
        titleZh: '智能扩图',
        description: 'Extend image boundaries seamlessly',
        descriptionZh: '智能填充边缘，实现无缝扩图',
        icon: '🖼️',
        color: 'bg-indigo-500'
    },
    {
        type: NodeType.IMAGE_SLICER,
        category: PluginCategory.VISUAL,
        title: 'Image Slicer',
        titleZh: '智能切卷',
        description: 'Analyze and slice design layouts',
        descriptionZh: '自动识别设计稿中的模块并切片',
        icon: '✂️',
        color: 'bg-rose-500'
    },
    {
        type: NodeType.MULTI_IMAGE_GEN,
        category: PluginCategory.VISUAL,
        title: 'Multi-Image Gen',
        titleZh: '多图连画',
        description: 'Generate sets of matching images',
        descriptionZh: '批量生成风格高度一致的系列套图',
        icon: '🎨',
        color: 'bg-emerald-500'
    },
    {
        type: NodeType.BATCH_IMAGE_GEN,
        category: PluginCategory.VISUAL,
        title: 'Batch Image Gen',
        titleZh: '批量绘图',
        description: 'Generate multiple images at once',
        descriptionZh: '一键并行生成多张高质量图片',
        icon: '📚',
        color: 'bg-cyan-500'
    },
    {
        type: NodeType.IMAGE_COLLAGE,
        category: PluginCategory.VISUAL,
        title: 'Image Collage',
        titleZh: '智能拼贴',
        description: 'Create beautiful collages and layouts',
        descriptionZh: '将多张图片智能组合成精美画册或拼贴画',
        icon: '🧩',
        color: 'bg-violet-500'
    },
    {
        type: NodeType.CAMERA_3D,
        category: PluginCategory.VISUAL,
        title: '3D Camera',
        titleZh: '3D 运镜',
        description: 'Control 3D camera perspectives',
        descriptionZh: '模拟电影级 3D 运镜与景深控制',
        icon: '🎥',
        color: 'bg-orange-500'
    },
    {
        type: NodeType.SVG_TEXT_OVERLAY,
        category: PluginCategory.VISUAL,
        title: 'SVG Overlay',
        titleZh: 'SVG 文字覆层',
        description: 'Generate precise text overlays',
        descriptionZh: '生成可缩放的 SVG 文字与图形覆盖图层',
        icon: '✒️',
        color: 'bg-blue-600'
    },

    // --- VIDEO CATEGORY ---
    {
        type: NodeType.VIDEO_GEN,
        category: PluginCategory.VIDEO,
        title: 'Video Gen',
        titleZh: '文生视频',
        description: 'Create short videos from snippets',
        descriptionZh: '将描述词或图片转化为动态视频',
        icon: '📹',
        color: 'bg-red-500'
    },

    // --- LOGIC CATEGORY ---
    {
        type: NodeType.SEARCH,
        category: PluginCategory.LOGIC,
        title: 'Network Search',
        titleZh: '联网搜索',
        description: 'Search the web for real-time information',
        descriptionZh: '接入实时互联网信息进行搜索与验证',
        icon: '🌐',
        color: 'bg-sky-600'
    },
    {
        type: NodeType.IMAGE_ANALYSIS,
        category: PluginCategory.LOGIC,
        title: 'Image Analysis',
        titleZh: '图像分析',
        description: 'Analyze image content and details',
        descriptionZh: '深入理解图片内容，提取视觉特征与属性',
        icon: '🔍',
        color: 'bg-violet-600'
    },
    {
        type: NodeType.TEXT_FAST,
        category: PluginCategory.LOGIC,
        title: 'Text (Fast)',
        titleZh: '文字 (快)',
        description: 'Quick responses for simple logic',
        descriptionZh: '极速响应的文字处理与逻辑转换',
        icon: '⚡',
        color: 'bg-slate-500'
    },
    {
        type: NodeType.TEXT_PRO,
        category: PluginCategory.LOGIC,
        title: 'Text (Pro)',
        titleZh: '文字 (强)',
        description: 'Deep reasoning and complex text',
        descriptionZh: '具备深度推理能力的复杂文本处理',
        icon: '💎',
        color: 'bg-slate-700'
    },
    {
        type: NodeType.PROMPT_OPTIMIZER,
        category: PluginCategory.LOGIC,
        title: 'Prompt Optimizer',
        titleZh: '提示词优化',
        description: 'Optimize prompts for better results',
        descriptionZh: '智能重构提示词，大幅提升 AI 输出质量',
        icon: '🪄',
        color: 'bg-teal-500'
    },
    {
        type: NodeType.INTENT_PARSER,
        category: PluginCategory.LOGIC,
        title: 'Intent Parser',
        titleZh: '意图识别',
        description: 'Analyze user intent and goals',
        descriptionZh: '智能解析复杂需求并规划工作流',
        icon: '🚥',
        color: 'bg-slate-600'
    },

    // --- INTERACT CATEGORY ---
    {
        type: NodeType.AI_CHAT,
        category: PluginCategory.INTERACT,
        title: 'AI Assistant',
        titleZh: 'AI 交互助手',
        description: 'Intelligent multi-agent coordination',
        descriptionZh: '多智能体协作，支持对话与指令编排',
        icon: '💬',
        color: 'bg-sky-500'
    },
    {
        type: NodeType.TTS,
        category: PluginCategory.INTERACT,
        title: 'Speech Synthesis',
        titleZh: '语音合成',
        description: 'Convert text to natural speech',
        descriptionZh: '将文字转化为自然流畅的高保真语音',
        icon: '🎙️',
        color: 'bg-pink-500'
    },
    {
        type: NodeType.AUDIO_LIVE,
        category: PluginCategory.INTERACT,
        title: 'Live Audio',
        titleZh: '音视听 (实时)',
        description: 'Real-time multi-modal interaction',
        descriptionZh: '真正的实时多模态交互体验',
        icon: '🎧',
        color: 'bg-rose-600'
    }
];
