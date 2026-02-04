

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { NodeType, AppNode, ApiConfig, ApiProvider, PluginCategory } from '../types';
import { PLUGINS } from '../constants';
import { apiService, decodeAudioData, decodeBase64 } from '../services/ApiService';
import { logger } from '../services/loggerService';
import { historyService } from '../services/historyService';
import { CameraControl3D } from './CameraControl3D';
import { BatchImageGenUI } from './BatchImageGenUI';
import { CollageWorkshopUI } from './CollageWorkshopUI';
import { IntentParserUI } from './IntentParserUI';
import { AIChatUI } from './AIChatUI';
import { ImageOutpaintUI } from './ImageOutpaintUI';
import { MultiImageGenUI } from './MultiImageGenUI';
import { SVGTextOverlayUI } from './SVGTextOverlayUI';
import { ImageSlicerUI } from './ImageSlicerUI';

// Image labels - simple text tags for each image to help AI understand context
// Stored as node.data.imageLabels: Record<number, string[]>

interface NodeUIProps {
  node: AppNode;
  allNodes: AppNode[];
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  globalCategoryModel?: string;
  apiConfig: ApiConfig;
  onImageClick: (src: string) => void;
  onAddNode: (type: NodeType, pos?: { x: number, y: number }, data?: any) => AppNode | null;
  isPaused?: boolean;
}


export const NodeUI: React.FC<NodeUIProps> = React.memo(({ node, allNodes, onUpdate, onDelete, onAddNode, globalCategoryModel, apiConfig, onImageClick, isPaused }) => {

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ name: string; content: string }[]>([]);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [isUploadAreaHovered, setIsUploadAreaHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [tempWidth, setTempWidth] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Image label input state
  const [labelInputs, setLabelInputs] = useState<Record<number, string>>({});

  // Node dimensions
  const nodeWidth = tempWidth || node.data.width || 320; // Use tempWidth if resizing
  const minWidth = 280;
  const maxWidth = 600;

  // Resize handler
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = nodeWidth;
    let currentWidth = startWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      currentWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      setTempWidth(currentWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onUpdate(node.id, { width: currentWidth });
      setTempWidth(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const plugin = PLUGINS.find(p => p.type === node.type);
    if (plugin?.category === PluginCategory.LOGIC) {
      loadTemplates();
    }
  }, [node.type]);

  // 监听节点高度变化，更新到 node.data.height 供 ConnectionLines 使用
  const lastHeightRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!nodeRef.current) return;

    const updateHeight = () => {
      if (!nodeRef.current) return;
      const height = nodeRef.current.getBoundingClientRect().height;
      if (height <= 0) return;

      // 节流：每 500ms 最多更新一次
      const now = Date.now();
      if (now - lastUpdateTimeRef.current < 500) return;

      // 阈值：高度变化超过 20px 才更新
      if (Math.abs(height - lastHeightRef.current) < 20) return;

      // 检查是否真的需要更新（避免重复设置相同的值）
      if (Math.abs(height - (node.data.height || 0)) < 5) return;

      lastHeightRef.current = height;
      lastUpdateTimeRef.current = now;
      onUpdate(node.id, { ...node.data, height });
    };

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(nodeRef.current);

    // 初始更新
    updateHeight();

    return () => resizeObserver.disconnect();
  }, [node.id]); // 减少依赖项，只在节点变化时重新绑定

  const loadTemplates = async () => {
    const data = await historyService.getTemplates();
    setTemplates(data);
  };

  // Copy image to clipboard
  const handleCopyImage = async (imageBase64: string) => {
    try {
      // Convert base64 to blob
      const response = await fetch(imageBase64);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      logger.success('图片已复制到剪贴板');
    } catch (err) {
      logger.error('复制失败: ' + (err as Error).message);
    }
  };

  // Paste image from clipboard
  const handlePasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              const currentImages = node.data.images || [];
              onUpdate(node.id, { ...node.data, images: [...currentImages, base64], image: base64 });
              logger.success('图片已粘贴');
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
      logger.warn('剪贴板中没有图片');
    } catch (err) {
      logger.error('粘贴失败: ' + (err as Error).message);
    }
  };

  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && hoveredImage) {
        e.preventDefault();
        handleCopyImage(hoveredImage);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && isUploadAreaHovered) {
        e.preventDefault();
        handlePasteImage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredImage, isUploadAreaHovered]);

  // ===== 优化后的节点关系数据计算（合并多次遍历） =====
  const nodeRelations = useMemo(() => {
    // 创建节点映射，避免多次遍历 allNodes
    const nodeMap = new Map<string, AppNode>();
    const availableSources: AppNode[] = [];

    for (const n of allNodes) {
      nodeMap.set(n.id, n);
      if (n.id !== node.id) {
        availableSources.push(n);
      }
    }

    const sourceNode = nodeMap.get(node.data.sourceNodeId || '');

    // 递归查找所有继承数据（一次遍历完成所有查找）
    const findInheritedData = (nodeId: string | undefined, visited = new Set<string>()): {
      images: string[];
      labels: Record<number, string[]>;
      ratio: { ratio: string; sourceTitle: string } | null;
      outpaintConfig: any | null;
    } => {
      if (!nodeId || visited.has(nodeId)) {
        return { images: [], labels: {}, ratio: null, outpaintConfig: null };
      }
      visited.add(nodeId);

      const n = nodeMap.get(nodeId);
      if (!n) {
        return { images: [], labels: {}, ratio: null, outpaintConfig: null };
      }

      const localImages = n.data.images || (n.data.image ? [n.data.image] : []);

      // 如果当前节点有本地图片，返回其数据
      if (localImages.length > 0) {
        return {
          images: localImages,
          labels: n.data.imageLabels || {},
          ratio: n.type === NodeType.IMAGE_OUTPAINT
            ? { ratio: n.data.outpaint?.ratio || '1:1', sourceTitle: n.titleZh }
            : null,
          outpaintConfig: n.type === NodeType.IMAGE_OUTPAINT ? n.data.outpaint : null
        };
      }

      // 继续向上查找
      return findInheritedData(n.data.sourceNodeId, visited);
    };

    const inherited = findInheritedData(node.data.sourceNodeId);

    // 检查本地是否有图片
    const localImages = node.data.images || (node.data.image ? [node.data.image] : []);
    const hasLocalImages = localImages.length > 0;

    // 有效的继承数据（当没有本地图片时使用）
    const inheritedImages = hasLocalImages ? localImages : inherited.images;
    const inheritedLabels = hasLocalImages ? {} : inherited.labels;

    // 最终生效的标签
    const imageLabels: Record<number, string[]> = node.data.imageLabels || {};
    const effectiveLabels = hasLocalImages ? imageLabels : inheritedLabels;

    // 比例继承信息
    const inheritanceInfo = node.type === NodeType.IMAGE_GEN ? inherited.ratio : null;
    const activeRatio = inheritanceInfo ? inheritanceInfo.ratio : (node.data.ratio || '1:1');

    return {
      availableSources,
      sourceNode,
      hasLocalImages,
      inheritedImages,
      inheritedLabels,
      imageLabels,
      effectiveLabels,
      inheritanceInfo,
      activeRatio,
      inheritedOutpaintConfig: inherited.outpaintConfig
    };
  }, [allNodes, node.id, node.data.sourceNodeId, node.data.images, node.data.image, node.data.imageLabels, node.data.ratio, node.type]);

  // 解构以便使用
  const {
    availableSources,
    sourceNode,
    hasLocalImages,
    inheritedImages,
    inheritanceInfo,
    activeRatio,
    inheritedOutpaintConfig,
    effectiveLabels,
    imageLabels
  } = nodeRelations;

  // Image label handlers
  const addLabel = (imgIndex: number, label: string) => {
    if (!label.trim()) return;
    const currentLabels = imageLabels[imgIndex] || [];
    if (currentLabels.includes(label.trim())) return; // Avoid duplicates
    const updatedLabels = {
      ...imageLabels,
      [imgIndex]: [...currentLabels, label.trim()]
    };
    onUpdate(node.id, { ...node.data, imageLabels: updatedLabels });
    setLabelInputs(prev => ({ ...prev, [imgIndex]: '' }));
    logger.success(`标签已添加: "${label.trim()}"`);
  };

  const removeLabel = (imgIndex: number, labelIndex: number) => {
    const currentLabels = imageLabels[imgIndex] || [];
    const updatedLabels = {
      ...imageLabels,
      [imgIndex]: currentLabels.filter((_, i) => i !== labelIndex)
    };
    onUpdate(node.id, { ...node.data, imageLabels: updatedLabels });
  };

  // Generate label context for AI (used in API calls)
  const generateLabelContext = (): string => {
    const labels = (node.data.imageLabels as Record<number, string[]>) || {};
    const entries = Object.entries(labels).filter(([_, l]) => l.length > 0);
    if (entries.length === 0) return '';
    const lines = entries.map(([idx, l]) => `- 图片${parseInt(idx) + 1}: [${l.join(', ')}]`);
    return `用户提供的参考图片说明：\n${lines.join('\n')}\n\n`;
  };


  const handleSaveTemplate = async () => {
    if (!node.data.promptEngineering) return;
    const name = prompt("请输入模板名称:", "新模板");
    if (name) {
      const res = await historyService.saveTemplate(name, node.data.promptEngineering);
      if (res.success) {
        loadTemplates();
        alert("模板保存成功！");
      } else {
        alert("保存失败: " + res.error);
      }
    }
  };

  const activeModel = node.data.modelOverride || globalCategoryModel;

  const isProModel =
    activeModel?.includes('pro') ||
    activeModel?.includes('veo-3.1-generate-preview') ||
    activeModel?.includes('gemini-3-pro');

  const handleRun = async () => {
    // Check if globally paused
    if (isPaused) {
      setError('全局任务已暂停，请点击右上角"恢复"按钮继续。');
      logger.warn('任务被暂停', node.id, node.titleZh);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('Initializing...');

    const isLogicNode = PLUGINS.find(p => p.type === node.type)?.category === PluginCategory.LOGIC;

    const originalPrompt = node.data.prompt || '';
    let finalPrompt = originalPrompt;
    if (sourceNode) {
      if (sourceNode.data.result) {
        const sourceResult = sourceNode.data.result;
        // 优化后的类型检查：更严格地检查结果是否为图片
        const isImageResult =
          typeof sourceResult === 'string' &&
          (sourceResult.startsWith('data:image') || sourceResult.startsWith('http'));

        // 检查是否为包含图片数据的对象
        const isImageObjectResult =
          typeof sourceResult === 'object' &&
          sourceResult !== null &&
          'url' in sourceResult &&
          typeof sourceResult.url === 'string' &&
          (sourceResult.url.startsWith('data:image') || sourceResult.url.startsWith('http'));

        if (isImageResult || isImageObjectResult) {
          // Result is an image - don't add to prompt, just log
          logger.info(`从 [${sourceNode.titleZh}] 继承图片结果`, node.id, node.titleZh);
        } else {
          // Result is text - add to prompt
          const sourceText = typeof sourceResult === 'object' ? sourceResult.text : sourceResult;
          finalPrompt = originalPrompt ? `${sourceText}\n\n${originalPrompt}` : sourceText;
          logger.info(`从 [${sourceNode.titleZh}] 接入数据`, node.id, node.titleZh);
        }
      } else {
        logger.warn(`来源节点 [${sourceNode.titleZh}] 暂无结果。`, node.id, node.titleZh);
      }
    }

    try {
      // Find provider
      const isImageNode = node.type === NodeType.IMAGE_GEN || node.type === NodeType.IMAGE_EDIT;
      const providerId = isImageNode ? apiConfig.defaultImageProviderId : apiConfig.defaultProviderId;
      const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];

      if (!provider) {
        throw new Error("请先配置 API 提供商");
      }

      let result;
      switch (node.type) {
        case NodeType.CAMERA_3D:
          // Combine incoming prompt (subject) with 3D camera settings
          // node.data.prompt is the camera setting generated by the 3D UI
          const cameraSettings = node.data.prompt || 'front view eye-level shot medium shot';

          // If finalPrompt already contains cameraSettings, don't duplicate
          if (finalPrompt && finalPrompt.includes(cameraSettings)) {
            result = finalPrompt;
          } else {
            result = finalPrompt ? `${finalPrompt}, ${cameraSettings}` : cameraSettings;
          }

          // Pass through images to help downstream nodes
          onUpdate(node.id, { result, images: inheritedImages });
          return; // Early return as we already called onUpdate
        case NodeType.IMAGE_GEN:
          setStatus('图像生成中...');
          if (inheritedOutpaintConfig) {
            setStatus('正在执行智能扩图生成...');
            result = await apiService.outpaintImage(
              inheritedImages[0],
              finalPrompt, // The optimized prompt should already come from the upstream outpaint node
              inheritedOutpaintConfig,
              provider,
              activeModel
            );
          } else {
            // Pass all inherited images and their labels for better context
            const labelsArray = inheritedImages.map((_, i) => ((effectiveLabels[i] as string[]) || []).join(', ') || '');
            result = await apiService.generateImage(
              finalPrompt,
              { ratio: activeRatio, model: activeModel },
              provider,
              inheritedImages,
              labelsArray
            );
          }
          break;
        case NodeType.VIDEO_GEN:
          setStatus('视频渲染中 (较慢)...');
          result = await apiService.generateVideo(finalPrompt, provider);
          break;
        case NodeType.TTS:
          setStatus('语音合成中...');
          result = await apiService.generateTTS(finalPrompt, node.data.voice || 'Kore', provider);
          break;
        case NodeType.IMAGE_EDIT:
          if (inheritedImages.length === 0) throw new Error("请先上传图片或连接有图片的节点。");
          setStatus('正在应用编辑...');
          result = await apiService.editImage(inheritedImages[0], finalPrompt, provider);
          break;
        case NodeType.SEARCH:
          setStatus('正在联网搜索...');
          result = await apiService.searchGrounding(finalPrompt, provider);
          break;
        case NodeType.IMAGE_ANALYSIS:
          setStatus('视觉分析中...');
          result = await apiService.analyzeImage(
            inheritedImages,
            finalPrompt || "这张图片里有什么？",
            provider,
            activeModel,
            effectiveLabels
          );
          break;
        case NodeType.TEXT_PRO:
        case NodeType.TEXT_FAST:
          setStatus('逻辑计算中...');
          result = await apiService.chatPro(finalPrompt, activeModel || '', provider);
          break;
        case NodeType.PROMPT_OPTIMIZER:
          setStatus('提示词优化中...');
          result = await apiService.optimizePrompt(
            finalPrompt,
            activeModel || '',
            provider,
            inheritedImages,
            node.data.promptEngineering,
            effectiveLabels
          );
          break;
        case NodeType.IMAGE_OUTPAINT:
          // Smart Outpaint now acts as a controller with built-in prompt optimization
          setStatus('正在分析原图...');

          const localOutpaintPrompt = node.data.outpaint?.prompt || "";
          const basePrompt = finalPrompt ? `${finalPrompt}, ${localOutpaintPrompt}` : localOutpaintPrompt;

          // Step 1: Analyze the original image and optimize the prompt using the template
          let outpaintSystemPrompt = node.data.promptEngineering;
          if (!outpaintSystemPrompt) {
            const template = await apiService.getPromptTemplate('OUTPAINT_OPTIMIZER');
            outpaintSystemPrompt = template || `You are an expert at describing images for AI outpainting. Analyze the provided image and create a detailed prompt that describes the background, patterns, textures, colors, and style. Focus on elements that should be seamlessly extended. Be specific about:
            1. Color palette and gradients
            2. Repeating patterns and their style (e.g., cartoon stickers, geometric shapes)
            3. Lighting and shadows
            4. Overall mood and aesthetic
            5. Any text or logos that should NOT be extended
            Output ONLY the optimized prompt in English, no explanation.`;
          }

          let optimizedOutpaintPrompt = basePrompt;
          if (inheritedImages.length > 0) {
            try {
              setStatus('正在优化扩图提示词...');
              const analysisPrompt = basePrompt
                ? `Analyze this image and optimize the following prompt for outpainting: "${basePrompt}"`
                : `Analyze this image and create a detailed prompt for seamlessly extending its background.`;

              optimizedOutpaintPrompt = await apiService.optimizePrompt(
                analysisPrompt,
                globalCategoryModel || 'gemini-3-flash-preview',
                provider,
                inheritedImages,
                outpaintSystemPrompt,
                effectiveLabels
              );
              logger.success(`扩图提示词优化完成`);
            } catch (err) {
              logger.warn('提示词优化失败，使用原始提示词');
            }
          }

          result = optimizedOutpaintPrompt;

          // Pass through images and config to help downstream nodes
          onUpdate(node.id, { result, images: inheritedImages });
          return; // Early return
      }

      // 保存历史记录（仅图像生成类节点）
      if (isImageNode && result && typeof result === 'string') {
        setStatus('保存历史记录...');
        const historyResult = await historyService.saveRecord({
          originalImage: node.data.image,
          generatedImage: result,
          // 如果有来源节点，原始提示词就是来源节点传入的内容；否则是本地输入
          originalPrompt: finalPrompt,
          // 只有当本地有输入时才记录优化前的提示词
          optimizedPrompt: sourceNode && originalPrompt ? `[本地输入] ${originalPrompt}` : undefined,
          model: activeModel || '',
          ratio: node.data.ratio || '1:1',
          nodeType: node.type,
        });
        if (historyResult.success) {
          logger.info('历史记录已保存', node.id, node.titleZh);
        } else if (historyResult.error) {
          logger.warn(`历史保存失败: ${historyResult.error}`, node.id, node.titleZh);
        }
      }

      logger.success(`处理完成！`, node.id, node.titleZh);
      onUpdate(node.id, { result });
    } catch (err: any) {
      setError(err.message || "执行错误");
      logger.error(err.message, node.id, node.titleZh);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };


  // 优化后的文件上传处理：添加文件大小检查
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // 文件大小检查（10MB = 10 * 1024 * 1024 bytes）
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const oversizedFiles = files.filter(file => (file as File).size > MAX_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      logger.warn(`以下文件超过10MB限制，将被跳过: ${oversizedFiles.map(f => (f as File).name).join(', ')}`);
      alert(`以下文件超过10MB限制: ${oversizedFiles.map(f => (f as File).name).join(', ')}\n请选择更小的图片。`);
    }

    const validFiles = files.filter(file => (file as File).size <= MAX_FILE_SIZE);
    if (validFiles.length === 0) return;

    try {
      const readers = validFiles.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`读取文件 ${file.name} 失败`));
          reader.readAsDataURL(file);
        });
      });

      const results = await Promise.all(readers);
      onUpdate(node.id, {
        images: [...(node.data.images || []), ...results],
        image: results[0] // 兼容旧版
      });
      logger.success(`成功上传 ${results.length} 张图片`);
    } catch (err) {
      logger.error('上传图片失败: ' + (err as Error).message);
    }
  };

  const playTTS = async (base64: string) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const buffer = await decodeAudioData(decodeBase64(base64.split(',')[1]), ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  };

  return (
    <div
      ref={nodeRef}
      onWheel={(e) => e.stopPropagation()} // 核心修复：阻止缩放联动
      style={{ width: nodeWidth }}
      className={`group relative bg-[#1e293b]/95 border-2 transition-all duration-300 rounded-3xl overflow-hidden flex flex-col shadow-2xl backdrop-blur-md cursor-auto
      ${loading ? 'border-blue-500 ring-4 ring-blue-500/10' : isProModel ? 'border-amber-500/30 shadow-amber-900/10 hover:border-amber-500' : 'border-slate-700 hover:border-slate-500'}
      ${isResizing ? 'select-none' : ''}
    `}>
      {/* Header - 拖拽区 */}
      <div className={`p-4 flex justify-between items-center border-b transition-colors cursor-grab active:cursor-grabbing ${isProModel ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-blue-500 animate-pulse' : isProModel ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-600'}`}></div>
          <div className="flex flex-col">
            <span className={`font-black text-[11px] uppercase tracking-wider ${isProModel ? 'text-amber-200' : 'text-white/90'}`}>{node.titleZh}</span>
            <span className="text-slate-500 text-[8px] font-mono font-bold uppercase">{node.title}</span>
          </div>
        </div>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onDelete(node.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div className="p-5 space-y-5 overflow-y-auto max-h-[600px] custom-scrollbar select-text" onMouseDown={(e) => e.stopPropagation()}>
        {/* 内容区交互 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[7px] text-slate-500 font-black uppercase tracking-[0.2em]">当前模型</span>
            <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full bg-slate-900/50 border border-white/5 ${isProModel ? 'text-amber-400' : 'text-blue-400'}`}>
              {activeModel}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 flex items-center gap-2">
              接入数据源
            </label>
            <select
              className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
              value={node.data.sourceNodeId || ''}
              onChange={(e) => onUpdate(node.id, { ...node.data, sourceNodeId: e.target.value })}
            >
              <option value="">无 / 使用本地输入</option>
              {availableSources.map(s => <option key={`${node.id}-src-${s.id}`} value={s.id}>{s.titleZh} ({s.id.substring(0, 4)})</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-[9px] text-red-400 font-bold italic animate-in fade-in slide-in-from-top-1">
            错误: {error}
          </div>
        )}

        {(() => {
          const plugin = PLUGINS.find(p => p.type === node.type);
          const isLogic = plugin?.category === PluginCategory.LOGIC;
          if (!isLogic) return null;

          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest">提示词工程模板</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.txt,.md';
                      input.onchange = (e: Event) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (re) => onUpdate(node.id, { ...node.data, promptEngineering: re.target?.result as string });
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                    className="text-[7px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md border border-blue-500/20 transition-all uppercase font-bold"
                  >
                    上传
                  </button>
                  <button
                    onClick={handleSaveTemplate}
                    className="text-[7px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/20 transition-all uppercase font-bold"
                  >
                    保存
                  </button>
                  {node.data.promptEngineering && (
                    <button
                      onClick={() => onUpdate(node.id, { ...node.data, promptEngineering: '' })}
                      className="text-[7px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded-md border border-red-500/20 transition-all uppercase font-bold"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <select
                  className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
                  onChange={(e) => {
                    const selected = templates.find(t => t.name === e.target.value);
                    if (selected) {
                      onUpdate(node.id, { ...node.data, promptEngineering: selected.content });
                    }
                  }}
                  value=""
                >
                  <option value="" disabled>选择已保存模板...</option>
                  {templates.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <textarea
                className="w-full bg-slate-950/50 border border-slate-700/30 rounded-xl p-3 text-slate-400 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500/30 min-h-[120px] transition-all resize-none font-mono"
                placeholder="输入自定义优化指令（System Prompt）... 如果为空则使用默认逻辑。"
                value={node.data.promptEngineering || ''}
                onChange={(e) => onUpdate(node.id, { ...node.data, promptEngineering: e.target.value })}
              />
            </div>
          );
        })()}

        {(node.type !== NodeType.AUDIO_LIVE) && (
          <div className="space-y-1.5">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 flex justify-between">
              <span>本地提示词</span>
              {sourceNode && <span className="text-blue-500 italic opacity-60">将与上游结果合并</span>}
            </label>
            <textarea
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl p-4 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[80px] transition-all resize-none shadow-inner"
              placeholder="输入你的创意指令..."
              value={node.data.prompt || ''}
              onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
            />
          </div>
        )}

        {(node.type === NodeType.IMAGE_GEN) && (
          <div className="flex-1 space-y-1">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 flex justify-between">
              <span>比例</span>
              {inheritanceInfo && (
                <span className="text-blue-500 italic lowercase opacity-80">
                  (已从 {inheritanceInfo.sourceTitle} 继承)
                </span>
              )}
            </label>
            <select
              disabled={!!inheritanceInfo}
              className={`w-full bg-slate-900 border border-slate-700/50 rounded-xl p-2 text-slate-300 text-[10px] font-bold cursor-pointer ${inheritanceInfo ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={activeRatio}
              onChange={(e) => onUpdate(node.id, { ...node.data, ratio: e.target.value })}
            >
              {['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}

        {node.type === NodeType.CAMERA_3D && (
          <div className="space-y-3">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 block">3D 视角预览</label>
            <CameraControl3D
              value={{
                azimuth: node.data.azimuth || 0,
                elevation: node.data.elevation || 0,
                distance: node.data.distance || 1.0
              }}
              onChange={(val) => {
                onUpdate(node.id, {
                  ...node.data,
                  azimuth: val.azimuth,
                  elevation: val.elevation,
                  distance: val.distance,
                  prompt: val.prompt
                });
              }}
              imageUrl={inheritedImages[0]}
            />
          </div>
        )}

        {node.type === NodeType.IMAGE_OUTPAINT && (
          <div className="space-y-3">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 block">扩图范围设定</label>
            <ImageOutpaintUI
              node={node}
              onUpdate={onUpdate}
              imageUrl={inheritedImages[0]}
              activeModel={activeModel}
            />
          </div>
        )}

        {node.type === NodeType.BATCH_IMAGE_GEN && (
          <BatchImageGenUI
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            apiConfig={apiConfig}
            onImageClick={onImageClick}
            isPaused={isPaused}
            globalCategoryModel={globalCategoryModel}
          />
        )}

        {node.type === NodeType.IMAGE_COLLAGE && (
          <CollageWorkshopUI
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            onImageClick={onImageClick}
          />
        )}

        {node.type === NodeType.INTENT_PARSER && (
          <IntentParserUI
            node={node}
            onUpdate={onUpdate}
            apiConfig={apiConfig}
            isPaused={isPaused}
            globalCategoryModel={globalCategoryModel}
          />
        )}

        {node.type === NodeType.AI_CHAT && (
          <AIChatUI
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            onAddNode={onAddNode}
            apiConfig={apiConfig}
            isPaused={isPaused}
            globalCategoryModel={globalCategoryModel}
          />

        )}

        {node.type === NodeType.MULTI_IMAGE_GEN && (
          <MultiImageGenUI
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            apiConfig={apiConfig}
            onImageClick={onImageClick}
            isPaused={isPaused}
            globalCategoryModel={globalCategoryModel}
          />
        )}

        {node.type === NodeType.SVG_TEXT_OVERLAY && (
          <SVGTextOverlayUI
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            apiConfig={apiConfig}
            onImageClick={onImageClick}
            isPaused={isPaused}
            globalCategoryModel={globalCategoryModel}
          />
        )}

        {node.type === NodeType.IMAGE_SLICER && (
          <ImageSlicerUI
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            apiConfig={apiConfig}
            onImageClick={onImageClick}
            globalCategoryModel={globalCategoryModel}
          />
        )}

        {(node.type === NodeType.IMAGE_EDIT || node.type === NodeType.IMAGE_ANALYSIS || node.type === NodeType.PROMPT_OPTIMIZER || node.type === NodeType.IMAGE_GEN || node.type === NodeType.IMAGE_OUTPAINT) && (() => {
          const localImages = node.data.images || (node.data.image ? [node.data.image] : []);
          const hasLocal = localImages.length > 0;
          // Check images, image, and result fields from source node (result is where Multi-Image Gen stores output)
          const getSourceImages = () => {
            if (!sourceNode) return [];
            if (sourceNode.data.images?.length > 0) return sourceNode.data.images;
            if (sourceNode.data.image) return [sourceNode.data.image];
            if (sourceNode.data.result && typeof sourceNode.data.result === 'string' && sourceNode.data.result.startsWith('data:image')) {
              return [sourceNode.data.result];
            }
            return [];
          };
          const sourceImages = getSourceImages();
          const isInherited = !hasLocal && sourceImages.length > 0;
          const displayImages = hasLocal ? localImages : sourceImages;

          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest flex items-center gap-2">
                  参考图
                  {isInherited && <span className="text-blue-500 italic lowercase opacity-80">(已从 {sourceNode?.titleZh} 继承)</span>}
                </label>
                {hasLocal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { images: [], image: null }); }}
                    className="text-[7px] text-red-400 hover:text-red-300 font-bold uppercase"
                  >
                    清空全部
                  </button>
                )}
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={() => setIsUploadAreaHovered(true)}
                onMouseLeave={() => setIsUploadAreaHovered(false)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsUploadAreaHovered(true);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsUploadAreaHovered(false);
                  const imageUrl = e.dataTransfer.getData('text/plain');
                  if (imageUrl && imageUrl.startsWith('data:image')) {
                    const currentImages = node.data.images || (node.data.image ? [node.data.image] : []);
                    onUpdate(node.id, { images: [...currentImages, imageUrl], image: imageUrl });
                    logger.success('图片已添加');
                  }
                }}
                className={`group/upload relative border-2 border-dashed rounded-2xl p-2 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden min-h-[120px]
                  ${isInherited ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-700 bg-slate-900/30 hover:border-blue-500/50 hover:bg-blue-500/5'}
                  ${isUploadAreaHovered ? 'ring-2 ring-emerald-500/30' : ''}
                `}
              >
                {displayImages.length > 0 ? (
                  <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                      {displayImages.map((img: string, idx: number) => (
                        <div key={idx} className="relative shrink-0 group/img">
                          <div className="w-24 h-24 relative"
                            onMouseEnter={() => setHoveredImage(img)}
                            onMouseLeave={() => setHoveredImage(null)}
                          >
                            <img
                              src={img}
                              alt={`Input ${idx}`}
                              className={`w-full h-full object-cover rounded-xl cursor-zoom-in hover:opacity-80 transition-opacity ${isInherited ? 'ring-2 ring-blue-500/20' : ''}`}
                              onClick={() => onImageClick(img)}
                            />
                            {/* Copy button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyImage(img);
                              }}
                              className="absolute top-1 left-1 bg-blue-500 text-white rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg"
                              title="复制图片 (Ctrl+C)"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                            {hasLocal && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newImages = node.data.images.filter((_: any, i: number) => i !== idx);
                                  onUpdate(node.id, { images: newImages, image: newImages[0] || null });
                                }}
                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                            )}
                            {/* Label count indicator */}
                            {(effectiveLabels[idx] || []).length > 0 && (
                              <div className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 bg-amber-500 text-black text-[7px] font-black rounded-full shadow-lg">
                                {(effectiveLabels[idx] || []).length} 标签
                              </div>
                            )}
                          </div>
                          {/* Image labels */}
                          <div className="mt-1 flex flex-wrap gap-1 max-w-24">
                            {(effectiveLabels[idx] || []).map((label: string, labelIdx: number) => (
                              <span key={labelIdx} className="inline-flex items-center gap-0.5 bg-amber-500 text-black text-[7px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                                {label}
                                {hasLocal && (
                                  <button
                                    onClick={() => removeLabel(idx, labelIdx)}
                                    className="hover:text-white font-black ml-0.5"
                                  >×</button>
                                )}
                              </span>
                            ))}
                            {hasLocal && (
                              <input
                                type="text"
                                placeholder="+ 标签"
                                value={labelInputs[idx] || ''}
                                onChange={(e) => setLabelInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    addLabel(idx, (e.target as HTMLInputElement).value);
                                  }
                                }}
                                className="bg-slate-800 border border-slate-600 text-[8px] text-slate-300 px-1.5 py-0.5 rounded-full w-14 outline-none focus:border-amber-500 transition-colors"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Always show add button, even when inheriting */}
                      <div className="shrink-0 w-24 h-24 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 hover:border-blue-500/50 hover:text-blue-400 transition-all" onClick={() => fileInputRef.current?.click()}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover/upload:text-blue-400 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">上传素材 (支持多选)</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePasteImage();
                      }}
                      className="text-[8px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/30 transition-all uppercase font-bold"
                    >
                      粘贴图片 (Ctrl+V)
                    </button>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
            </div>
          );
        })()}

        <button
          onClick={handleRun}
          disabled={loading}
          className={`relative w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all overflow-hidden shadow-lg hover:scale-[1.02] active:scale-[0.98]
            ${loading ? 'bg-slate-700 text-slate-500' : isProModel ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'}
          `}
        >
          {loading ? '处理中...' : (node.type === NodeType.PROMPT_OPTIMIZER ? '优化提示词' : node.type === NodeType.IMAGE_OUTPAINT ? '确认构图' : '开始执行')}
          {loading && status && <div className="absolute bottom-1 left-0 right-0 text-[7px] text-center opacity-60 animate-pulse">{status}</div>}
        </button>

        {node.data.result && (
          <div className="pt-5 border-t border-slate-800 animate-in slide-in-from-top-2">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 block mb-3">输出结果</label>
            <div className="rounded-2xl overflow-hidden bg-slate-950/80 shadow-2xl ring-1 ring-white/10">
              {node.type === NodeType.VIDEO_GEN ? (
                <video src={node.data.result} controls className="w-full h-auto" />
              ) : node.type === NodeType.TTS ? (
                <div className="p-6 flex flex-col items-center justify-center gap-4">
                  <button onClick={() => playTTS(node.data.result)} className="w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-95 transition-all">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">语音就绪</span>
                </div>
              ) : node.type === NodeType.CAMERA_3D ? (
                <div className="p-4 bg-slate-900/50">
                  <div className="text-[10px] font-mono text-emerald-400 break-all leading-relaxed">
                    {node.data.result}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(node.data.result);
                      logger.info('提示词已复制到剪贴板');
                    }}
                    className="mt-3 w-full py-2 rounded-xl bg-slate-800 text-[8px] text-slate-400 uppercase font-black tracking-widest hover:bg-slate-700 transition-colors"
                  >
                    复制提示词
                  </button>
                </div>
              ) : typeof node.data.result === 'string' && (node.data.result.startsWith('data:image') || node.data.result.startsWith('blob:') || node.data.result.startsWith('http')) ? (
                <div className="relative">
                  <img
                    src={node.data.result}
                    crossOrigin="anonymous"
                    className="w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                    alt="AI Result"
                    onClick={() => onImageClick(node.data.result)}
                    onError={(e) => {
                      // If CORS fails, try without crossOrigin
                      const img = e.currentTarget;
                      if (img.crossOrigin) {
                        img.crossOrigin = '';
                        img.src = node.data.result;
                      } else {
                      }
                    }}
                  />
                  {/* Show URL for external images as fallback */}
                  {node.data.result.startsWith('http') && (
                    <a
                      href={node.data.result}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 bg-black/50 text-white text-[8px] px-2 py-1 rounded hover:bg-black/70 transition-colors"
                    >
                      在新标签打开
                    </a>
                  )}
                </div>
              ) : typeof node.data.result === 'string' && node.data.result.includes('<svg') ? (
                <div
                  className="w-full h-auto bg-slate-900 rounded-xl overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity p-2"
                  dangerouslySetInnerHTML={{ __html: node.data.result }}
                  onClick={() => onImageClick('data:image/svg+xml;base64,' + btoa(node.data.result))}
                />
              ) : typeof node.data.result === 'object' ? (
                <div className="p-4 space-y-4">
                  <p className="text-slate-300 text-xs leading-relaxed">{node.data.result.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {node.data.result.links?.map((link: any, i: number) => (
                      <a key={i} href={link.uri} target="_blank" className="text-[9px] text-blue-400 hover:text-white bg-blue-900/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                        来源_{i + 1}: {link.title.substring(0, 15)}...
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-slate-400 text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">{node.data.result}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
        title="拖动调整大小"
      >
        <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22ZM18 14H16V12H18V14ZM14 18H12V16H14V18ZM10 22H8V20H10V22Z" />
        </svg>
      </div>

      {/* Labels are now inline under each image - no modal needed */}
    </div>
  );
});
