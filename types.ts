
export enum NodeType {
  IMAGE_GEN = 'IMAGE_GEN',
  IMAGE_EDIT = 'IMAGE_EDIT',
  SEARCH = 'SEARCH',
  AUDIO_LIVE = 'AUDIO_LIVE',
  IMAGE_ANALYSIS = 'IMAGE_ANALYSIS',
  TEXT_FAST = 'TEXT_FAST',
  TEXT_PRO = 'TEXT_PRO',
  VIDEO_GEN = 'VIDEO_GEN',
  TTS = 'TTS',
  PROMPT_OPTIMIZER = 'PROMPT_OPTIMIZER'
}

export enum PluginCategory {
  VISUAL = 'VISUAL',      // 图像创作
  VIDEO = 'VIDEO',        // 视频生成
  LOGIC = 'LOGIC',        // 逻辑与搜索
  INTERACT = 'INTERACT',  // 感知与对话
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface AppNode {
  id: string;
  type: NodeType;
  position: NodePosition;
  data: any;
  title: string;
  titleZh: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  nodeId?: string;
  nodeTitle?: string;
}

export interface PluginMetadata {
  type: NodeType;
  category: PluginCategory;
  title: string;
  titleZh: string;
  description: string;
  descriptionZh: string;
  icon: string;
  color: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: AppNode[];
  transform: { x: number; y: number; scale: number };
  categoryModels: Record<PluginCategory, string>;
  createdAt: number;
}

// === API Provider Configuration ===

export type ApiFormat = 'openai' | 'stability';

export interface ApiProvider {
  id: string;
  name: string;              // User-friendly name (e.g., "My OpenRouter")
  baseUrl: string;           // API endpoint (e.g., "https://openrouter.ai/api/v1")
  apiKey: string;            // API key
  format: ApiFormat;         // API format type
  models: string[];          // Available models for this provider
  imageModels?: string[];    // Image generation models (for DALL-E style APIs)
  isDefault?: boolean;       // Mark as default provider
}

export interface ApiConfig {
  providers: ApiProvider[];
  defaultProviderId: string | null;
  defaultImageProviderId: string | null;  // Separate default for image generation
}
