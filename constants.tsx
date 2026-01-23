
import { NodeType, PluginMetadata, PluginCategory } from './types';

export const SUGGESTED_MODELS: Record<PluginCategory, { id: string, label: string }[]> = {
  [PluginCategory.VISUAL]: [
    { id: 'nano-banana-2', label: 'Nano Banana v2' },
    { id: 'nano-banana-2-2k', label: 'Nano Banana 2K' },
    { id: 'nano-banana-2-4k', label: 'Nano Banana 4K' },
    { id: 'doubao-seedream-4-5-251128', label: '豆包Seedream 4.5' },
    { id: 'gpt-image-1.5', label: 'GPT Image 1.5' }
  ],
  [PluginCategory.VIDEO]: [
    { id: 'luma-dream-machine', label: 'Luma' },
    { id: 'runway-gen-3', label: 'Runway' }
  ],
  [PluginCategory.LOGIC]: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'o1-preview', label: 'OpenAI o1' },
    { id: 'o3-mini', label: 'OpenAI o3-mini' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
    { id: 'gemini-3-pro-preview-thinking-*', label: 'Gemini 3 Thinking' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5' }
  ],
  [PluginCategory.INTERACT]: [
    { id: 'whisper-1', label: 'Whisper' },
    { id: 'tts-1', label: 'OpenAI TTS' }
  ]
};

export const PLUGINS: PluginMetadata[] = [
  // --- 图像创作 (Visual Creation) ---
  {
    type: NodeType.IMAGE_GEN,
    category: PluginCategory.VISUAL,
    title: 'Nano Banana Gen',
    titleZh: '纳米香蕉图像生成',
    description: 'High-speed image synthesis.',
    descriptionZh: '高速图像合成生成。',
    icon: '🖼️',
    color: 'bg-blue-500'
  },
  {
    type: NodeType.IMAGE_EDIT,
    category: PluginCategory.VISUAL,
    title: 'Nano Banana Edit',
    titleZh: '纳米香蕉图像编辑',
    description: 'Modify images with text instructions.',
    descriptionZh: '通过文本指令修改和编辑图像。',
    icon: '🎨',
    color: 'bg-sky-500'
  },
  {
    type: NodeType.BATCH_IMAGE_GEN,
    category: PluginCategory.VISUAL,
    title: 'Batch Image Gen',
    titleZh: '批量图像生成',
    description: 'Generate multiple images from prompts with gallery view.',
    descriptionZh: '批量生成图像，带画廊视图和历史记录。',
    icon: '🏞️',
    color: 'bg-gradient-to-br from-blue-500 to-purple-600'
  },
  {
    type: NodeType.IMAGE_COLLAGE,
    category: PluginCategory.VISUAL,
    title: 'Image Collage',
    titleZh: '拼图工坊',
    description: 'Combine multiple images into a grid collage.',
    descriptionZh: '将多张图片拼合成网格大图。',
    icon: '🧩',
    color: 'bg-gradient-to-br from-pink-500 to-orange-500'
  },
  {
    type: NodeType.MULTI_IMAGE_GEN,
    category: PluginCategory.VISUAL,
    title: 'Multi-Image Gen',
    titleZh: '多图参考生成',
    description: 'Generate images with up to 14 ordered reference images.',
    descriptionZh: '支持最多14张有序参考图的图像生成。',
    icon: '🎭',
    color: 'bg-gradient-to-br from-violet-500 to-fuchsia-600'
  },
  // --- 视频生成 (Video Studio) ---
  {
    type: NodeType.VIDEO_GEN,
    category: PluginCategory.VIDEO,
    title: 'Veo Video Studio',
    titleZh: 'Veo 视频生成',
    description: 'Cinematic video generation from text.',
    descriptionZh: '从文本生成电影感视频。',
    icon: '🎬',
    color: 'bg-purple-600'
  },

  // --- 逻辑与搜索 (Logic & Intel) ---
  {
    type: NodeType.IMAGE_OUTPAINT,
    category: PluginCategory.LOGIC,
    title: 'Smart Outpaint',
    titleZh: '智能扩图',
    description: 'Expand images with AI-generated content.',
    descriptionZh: '智能扩展图像边界，AI 自动补全周围内容。',
    icon: '🔲',
    color: 'bg-gradient-to-br from-teal-500 to-cyan-600'
  },
  {
    type: NodeType.CAMERA_3D,
    category: PluginCategory.LOGIC,
    title: '3D Camera Control',
    titleZh: '3D 视角控制',
    description: 'Control camera angle for multi-view generation.',
    descriptionZh: '控制相机视角，生成多角度视图提示词。',
    icon: '📐',
    color: 'bg-violet-500'
  },
  {
    type: NodeType.TEXT_PRO,
    category: PluginCategory.LOGIC,
    title: 'Gemini Logic',
    titleZh: 'Gemini 逻辑推理',
    description: 'Deep reasoning and text generation.',
    descriptionZh: '深度逻辑推理与文本创作。',
    icon: '🧠',
    color: 'bg-indigo-500'
  },
  {
    type: NodeType.PROMPT_OPTIMIZER,
    category: PluginCategory.LOGIC,
    title: 'Prompt Optimizer',
    titleZh: '提示词优化',
    description: 'Refine and expand your prompts for better AI results.',
    descriptionZh: '精炼并扩展您的提示词，以获得更好的AI效果。',
    icon: '🪄',
    color: 'bg-violet-500'
  },
  {
    type: NodeType.SEARCH,
    category: PluginCategory.LOGIC,
    title: 'Google Search AI',
    titleZh: '谷歌搜索增强',
    description: 'Grounded web-based intelligence.',
    descriptionZh: '基于实时搜索的智能问答。',
    icon: '🔍',
    color: 'bg-emerald-600'
  },
  {
    type: NodeType.INTENT_PARSER,
    category: PluginCategory.LOGIC,
    title: 'Intent Parser',
    titleZh: '意图解析器',
    description: 'Parse user input into multiple creative intents using AI.',
    descriptionZh: '使用AI解析用户输入，拆分多个创作意图。',
    icon: '🎯',
    color: 'bg-gradient-to-br from-cyan-500 to-blue-600'
  },
  {
    type: NodeType.AI_CHAT,
    category: PluginCategory.LOGIC,
    title: 'AI Assistant',
    titleZh: 'AI 智能助手',
    description: 'Real-time conversation with file support.',
    descriptionZh: '实时对话助手，支持文件上传与深度问答。',
    icon: '💬',
    color: 'bg-gradient-to-br from-emerald-500 to-teal-600'
  },


  // --- 感知与对话 (Interaction) ---
  {
    type: NodeType.IMAGE_ANALYSIS,
    category: PluginCategory.INTERACT,
    title: 'Vision Intel',
    titleZh: '图像视觉分析',
    description: 'Analyze content of any image.',
    descriptionZh: '分析任何图像中的视觉内容。',
    icon: '👁️',
    color: 'bg-orange-500'
  },
  {
    type: NodeType.AUDIO_LIVE,
    category: PluginCategory.INTERACT,
    title: 'Conversational Voice',
    titleZh: '实时语音对话',
    description: 'Real-time multi-modal audio chat.',
    descriptionZh: '实时多模态语音交互对话。',
    icon: '🎙️',
    color: 'bg-rose-500'
  },
  {
    type: NodeType.TTS,
    category: PluginCategory.INTERACT,
    title: 'Speech Synthesis',
    titleZh: '语音合成 (TTS)',
    description: 'Natural text-to-speech engine.',
    descriptionZh: '将文字转换为自然语音。',
    icon: '🔊',
    color: 'bg-pink-500'
  },
  {
    type: NodeType.SVG_TEXT_OVERLAY,
    category: PluginCategory.VISUAL,
    title: 'SVG Text Overlay',
    titleZh: 'SVG 文字叠加',
    description: 'Overlay crisp vector text on images using AI layout analysis.',
    descriptionZh: '使用 AI 分析排版，在图片上叠加清晰的矢量文字。',
    icon: '✍️',
    color: 'bg-gradient-to-br from-cyan-500 to-blue-600'
  },
  {
    type: NodeType.IMAGE_SLICER,
    category: PluginCategory.LOGIC,
    title: 'AI Image Slicer',
    titleZh: 'AI 智能切割',
    description: 'AI analyzes image layout and returns precise cut coordinates.',
    descriptionZh: 'AI 分析图片布局，返回精确切割坐标，智能切片导出。',
    icon: '🔪',
    color: 'bg-gradient-to-br from-amber-500 to-orange-600'
  }
];

export const CATEGORY_LABELS: Record<PluginCategory, { zh: string, en: string, icon: string }> = {
  [PluginCategory.VISUAL]: { zh: '图像创作', en: 'Image Creation', icon: '🎨' },
  [PluginCategory.VIDEO]: { zh: '视频生成', en: 'Video Studio', icon: '🎬' },
  [PluginCategory.LOGIC]: { zh: '逻辑与搜索', en: 'Logic & Intel', icon: '⚡' },
  [PluginCategory.INTERACT]: { zh: '感知与交互', en: 'Interaction', icon: '💬' }
};
