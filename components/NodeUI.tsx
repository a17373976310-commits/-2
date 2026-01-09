
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { NodeType, AppNode, ApiConfig, ApiProvider } from '../types';
import { apiService, decodeAudioData, decodeBase64 } from '../services/ApiService';
import { logger } from '../services/loggerService';
import { historyService } from '../services/historyService';

interface NodeUIProps {
  node: AppNode;
  allNodes: AppNode[];
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  globalCategoryModel?: string;
  apiConfig: ApiConfig;
  onImageClick: (src: string) => void;
  isPaused?: boolean;
}

export const NodeUI: React.FC<NodeUIProps> = ({ node, allNodes, onUpdate, onDelete, globalCategoryModel, apiConfig, onImageClick, isPaused }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ name: string; content: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (node.type === NodeType.PROMPT_OPTIMIZER) {
      loadTemplates();
    }
  }, [node.type]);

  const loadTemplates = async () => {
    const data = await historyService.getTemplates();
    setTemplates(data);
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

  const availableSources = useMemo(() => {
    return allNodes.filter(n => n.id !== node.id);
  }, [allNodes, node.id]);

  const sourceNode = useMemo(() => {
    return allNodes.find(n => n.id === node.data.sourceNodeId);
  }, [allNodes, node.data.sourceNodeId]);

  const handleRun = async () => {
    // Check if globally paused
    if (isPaused) {
      setError('全局任务已暂停，请点击右上角“恢复”按钮继续。');
      logger.warn('任务被暂停', node.id, node.titleZh);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('Initializing...');

    const originalPrompt = node.data.prompt || '';
    let finalPrompt = originalPrompt;
    if (sourceNode) {
      if (sourceNode.data.result) {
        finalPrompt = typeof sourceNode.data.result === 'object' ? sourceNode.data.result.text : sourceNode.data.result;
        logger.info(`从 [${sourceNode.titleZh}] 接入数据`, node.id, node.titleZh);
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

      // 图像继承逻辑：如果当前节点没图，尝试从来源节点继承
      const localImages = node.data.images || (node.data.image ? [node.data.image] : []);
      const inheritedImages = (localImages.length === 0 && sourceNode)
        ? (sourceNode.data.images || (sourceNode.data.image ? [sourceNode.data.image] : []))
        : localImages;

      let result;
      switch (node.type) {
        case NodeType.IMAGE_GEN:
          setStatus('图像生成中...');
          result = await apiService.generateImage(finalPrompt, { ratio: node.data.ratio || '1:1', model: activeModel }, provider, inheritedImages[0]);
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
            activeModel
          );
          break;
        case NodeType.TEXT_PRO:
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
            node.data.promptEngineering
          );
          break;
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
      onUpdate(node.id, { ...node.data, result });
    } catch (err: any) {
      setError(err.message || "执行错误");
      logger.error(err.message, node.id, node.titleZh);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const readers = files.map((file: File) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      const results = await Promise.all(readers);
      onUpdate(node.id, {
        ...node.data,
        images: [...(node.data.images || []), ...results],
        image: results[0] // 兼容旧版
      });
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
      onWheel={(e) => e.stopPropagation()} // 核心修复：阻止缩放联动
      className={`group bg-[#1e293b]/95 border-2 transition-all duration-300 rounded-3xl w-80 overflow-hidden flex flex-col shadow-2xl backdrop-blur-md cursor-auto
      ${loading ? 'border-blue-500 ring-4 ring-blue-500/10' : isProModel ? 'border-amber-500/30 shadow-amber-900/10 hover:border-amber-500' : 'border-slate-700 hover:border-slate-500'}
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

      <div className="p-5 space-y-5 overflow-y-auto max-h-[600px] custom-scrollbar" onMouseDown={(e) => e.stopPropagation()}>
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

        {(node.type === NodeType.PROMPT_OPTIMIZER) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest">提示词工程模板</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.txt,.md';
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (re) => onUpdate(node.id, { ...node.data, promptEngineering: re.target?.result });
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
        )}

        {(node.type !== NodeType.AUDIO_LIVE) && (
          <div className="space-y-1.5">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 flex justify-between">
              <span>本地提示词</span>
              {sourceNode && <span className="text-blue-500 italic opacity-60">已被连线覆盖</span>}
            </label>
            <textarea
              className={`w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl p-4 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[80px] transition-all resize-none shadow-inner ${sourceNode ? 'opacity-40 grayscale pointer-events-none' : ''}`}
              placeholder="输入你的创意指令..."
              value={node.data.prompt || ''}
              onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
            />
          </div>
        )}

        {(node.type === NodeType.IMAGE_GEN) && (
          <div className="flex-1 space-y-1">
            <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">比例</label>
            <select
              className="w-full bg-slate-900 border border-slate-700/50 rounded-xl p-2 text-slate-300 text-[10px] font-bold cursor-pointer"
              value={node.data.ratio || '1:1'}
              onChange={(e) => onUpdate(node.id, { ...node.data, ratio: e.target.value })}
            >
              {['1:1', '3:4', '4:3', '9:16', '16:9'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}

        {(node.type === NodeType.IMAGE_EDIT || node.type === NodeType.IMAGE_ANALYSIS || node.type === NodeType.PROMPT_OPTIMIZER || node.type === NodeType.IMAGE_GEN) && (() => {
          const localImages = node.data.images || (node.data.image ? [node.data.image] : []);
          const hasLocal = localImages.length > 0;
          const sourceImages = sourceNode ? (sourceNode.data.images || (sourceNode.data.image ? [sourceNode.data.image] : [])) : [];
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
                    onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { ...node.data, images: [], image: null }); }}
                    className="text-[7px] text-red-400 hover:text-red-300 font-bold uppercase"
                  >
                    清空全部
                  </button>
                )}
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`group/upload relative border-2 border-dashed rounded-2xl p-2 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden min-h-[120px]
                  ${isInherited ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-700 bg-slate-900/30 hover:border-blue-500/50 hover:bg-blue-500/5'}
                `}
              >
                {displayImages.length > 0 ? (
                  <div className="w-full flex gap-2 overflow-x-auto py-1 no-scrollbar" onClick={(e) => e.stopPropagation()}>
                    {displayImages.map((img: string, idx: number) => (
                      <div key={idx} className="relative shrink-0 w-24 h-24 group/img">
                        <img
                          src={img}
                          alt={`Input ${idx}`}
                          className={`w-full h-full object-cover rounded-xl cursor-zoom-in hover:opacity-80 transition-opacity ${isInherited ? 'ring-2 ring-blue-500/20' : ''}`}
                          onClick={() => onImageClick(img)}
                        />
                        {hasLocal && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const newImages = node.data.images.filter((_: any, i: number) => i !== idx);
                              onUpdate(node.id, { ...node.data, images: newImages, image: newImages[0] || null });
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        )}
                      </div>
                    ))}
                    {!isInherited && (
                      <div className="shrink-0 w-24 h-24 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 hover:border-blue-500/50 hover:text-blue-400 transition-all" onClick={() => fileInputRef.current?.click()}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover/upload:text-blue-400 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">上传素材 (支持多选)</span>
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
          {loading ? '处理中...' : (node.type === NodeType.PROMPT_OPTIMIZER ? '优化提示词' : '开始执行')}
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
              ) : (node.type === NodeType.IMAGE_GEN || node.type === NodeType.IMAGE_EDIT) && typeof node.data.result === 'string' ? (
                <img
                  src={node.data.result}
                  className="w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                  alt="AI Synthesized"
                  onClick={() => onImageClick(node.data.result)}
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
    </div>
  );
};
