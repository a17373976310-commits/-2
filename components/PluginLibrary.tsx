
import React, { useState, useEffect } from 'react';
import { PLUGINS, CATEGORY_LABELS, SUGGESTED_MODELS } from '../constants';
import { NodeType, PluginMetadata, PluginCategory } from '../types';
import { apiService } from '../services/ApiService';

interface PluginLibraryProps {
  onAddNode: (plugin: PluginMetadata) => void;
  categoryModels: Record<PluginCategory, string>;
  setCategoryModels: React.Dispatch<React.SetStateAction<Record<PluginCategory, string>>>;
  onOpenSettings: () => void;
  apiConfig: any; // We'll use any or import ApiConfig
  fetchedModelsMap: Record<string, string[]>;
  setFetchedModelsMap?: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export const PluginLibrary: React.FC<PluginLibraryProps> = ({
  onAddNode,
  categoryModels,
  setCategoryModels,
  onOpenSettings,
  apiConfig,
  fetchedModelsMap,
  setFetchedModelsMap
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<PluginCategory[]>([
    PluginCategory.VISUAL,
    PluginCategory.VIDEO,
    PluginCategory.LOGIC,
    PluginCategory.INTERACT
  ]);

  const [isRefreshingModels, setIsRefreshingModels] = useState<string | null>(null);
  const [isCustomModelInput, setIsCustomModelInput] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: PluginCategory) => {
    setExpandedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleModelChange = (cat: PluginCategory, modelId: string) => {
    setCategoryModels(prev => ({ ...prev, [cat]: modelId }));
  };

  const refreshProviderModels = async (cat: PluginCategory) => {
    if (apiConfig.providers.length > 0) {
      const provider = cat === PluginCategory.VISUAL
        ? (apiConfig.providers.find((p: any) => p.id === apiConfig.defaultImageProviderId) || apiConfig.providers[0])
        : (apiConfig.providers.find((p: any) => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0]);

      if (!provider) return;

      setIsRefreshingModels(cat);
      try {
        const models = await apiService.fetchModels(provider);
        if (models.length > 0) {
          if (setFetchedModelsMap) {
            setFetchedModelsMap(prev => ({ ...prev, [provider.id]: models }));
          }
          console.log(`[PluginLibrary] Successfully fetched ${models.length} models for ${provider.name}`);
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

  const groupedPlugins = PLUGINS.reduce((acc, plugin) => {
    if (!acc[plugin.category]) acc[plugin.category] = [];
    acc[plugin.category].push(plugin);
    return acc;
  }, {} as Record<PluginCategory, PluginMetadata[]>);

  // Collapsed state - just show a toggle button
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed left-6 top-6 w-14 h-14 bg-[#0f172a]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 flex items-center justify-center text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-all group"
        title="展开组件库"
      >
        <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      </button>
    );
  }

  return (
    <div
      onWheel={(e) => e.stopPropagation()} // 核心修复：阻止缩放联动
      onMouseDown={(e) => e.stopPropagation()} // 阻止在侧边栏点击触发画布移动
      className="fixed left-6 top-6 bottom-6 w-80 bg-[#0f172a]/95 backdrop-blur-2xl border border-white/5 rounded-[32px] shadow-[0_40px_80px_rgba(0,0,0,0.8)] flex flex-col z-50 overflow-hidden pointer-events-auto ring-1 ring-white/10"
    >
      <div className="p-8 bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/5">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-2xl font-black tracking-tighter flex items-center gap-3">
            核心组件库 <span className="bg-blue-600 text-[10px] px-2 py-0.5 rounded-full shadow-lg shadow-blue-500/20">v2.8</span>
          </h2>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-blue-400 transition-all"
            title="收起组件库"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>
            </svg>
          </button>
        </div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2 opacity-60 italic">AI 工作流编排引擎</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
        {(Object.keys(groupedPlugins) as PluginCategory[]).map((cat) => (
          <div key={cat} className="space-y-3">
            <button
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between px-3 py-1 group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl grayscale group-hover:grayscale-0 transition-all group-hover:scale-110 duration-300">{CATEGORY_LABELS[cat].icon}</span>
                <div className="flex flex-col items-start">
                  <span className="text-white font-black text-[11px] uppercase tracking-widest transition-colors group-hover:text-blue-400">{CATEGORY_LABELS[cat].zh}</span>
                  <span className="text-slate-600 text-[8px] font-bold uppercase tracking-tight">{CATEGORY_LABELS[cat].en}</span>
                </div>
              </div>
              <svg
                className={`w-3 h-3 text-slate-700 transition-transform duration-500 ${expandedCategories.includes(cat) ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>

            {expandedCategories.includes(cat) && (
              <div className="space-y-3 animate-in slide-in-from-top-4 fade-in duration-500">
                {SUGGESTED_MODELS[cat] && (
                  <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-2 mx-1">
                    <div className="flex items-center justify-between mb-2 px-2">
                      <span className="text-[7px] text-slate-500 font-black uppercase tracking-[0.15em]">默认模型引擎选择</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-black/40 rounded-2xl">
                      {(() => {
                        const provider = cat === PluginCategory.VISUAL
                          ? (apiConfig.providers.find((p: any) => p.id === apiConfig.defaultImageProviderId) || apiConfig.providers[0])
                          : (apiConfig.providers.find((p: any) => p.id === apiConfig.defaultProviderId) || apiConfig.providers[0]);

                        const fetchedModels = (provider && fetchedModelsMap[provider.id]) || [];
                        const suggested = SUGGESTED_MODELS[cat] || [];
                        const currentId = categoryModels[cat];

                        // Build combined list
                        const allModels = [...suggested];
                        fetchedModels.forEach(mId => {
                          if (!allModels.some(m => m.id === mId)) {
                            allModels.push({ id: mId, label: mId });
                          }
                        });

                        // Ensure current selected custom model is in the list
                        if (currentId && !allModels.some(m => m.id === currentId)) {
                          allModels.push({ id: currentId, label: currentId });
                        }

                        return (
                          <>
                            {allModels.slice(0, 11).map(model => { // Limit to 11 to allow for one extra custom if needed
                              const isSelected = categoryModels[cat] === model.id;
                              const isPro = model.id.includes('pro') || model.id.includes('veo-3.1-generate') || model.id.includes('gemini-3');
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => {
                                    handleModelChange(cat, model.id);
                                    setIsCustomModelInput(prev => ({ ...prev, [cat]: false }));
                                  }}
                                  className={`relative py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all border overflow-hidden group/model
                                    ${isSelected
                                      ? isPro
                                        ? 'bg-amber-600/20 border-amber-400 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                                        : 'bg-blue-600/20 border-blue-400 text-blue-200 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                                      : 'bg-transparent border-white/5 text-slate-500 hover:text-slate-300 hover:border-white/10'
                                    }
                                  `}
                                >
                                  {isPro && (
                                    <div className="absolute top-0 right-0 w-4 h-4 overflow-hidden pointer-events-none">
                                      <div className="absolute top-[-8px] right-[-8px] w-4 h-4 bg-amber-400 rotate-45 shadow-[0_0_10px_#f59e0b]"></div>
                                    </div>
                                  )}
                                  <span className="relative z-10 truncate block w-full">{model.label}</span>
                                  {isSelected && (
                                    <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${isPro ? 'from-amber-400 to-transparent' : 'from-blue-400 to-transparent'}`}></div>
                                  )}
                                </button>
                              );
                            })}

                            {/* Custom Model Input */}
                            {isCustomModelInput[cat] && (
                              <div className="col-span-2 mt-2 px-1">
                                <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-2">
                                  <input
                                    autoFocus
                                    type="text"
                                    className="flex-1 bg-transparent border-none outline-none text-[10px] text-white placeholder:text-slate-600"
                                    placeholder="输入模型 ID (如 gpt-4-turbo)..."
                                    value={categoryModels[cat] || ''}
                                    onChange={(e) => handleModelChange(cat, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') setIsCustomModelInput(prev => ({ ...prev, [cat]: false }));
                                    }}
                                  />
                                  <button
                                    onClick={() => setIsCustomModelInput(prev => ({ ...prev, [cat]: false }))}
                                    className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300"
                                  >
                                    确定
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="col-span-2 mt-2 grid grid-cols-2 gap-2 px-1 pb-1">
                              <button
                                onClick={() => refreshProviderModels(cat)}
                                disabled={isRefreshingModels === cat}
                                className={`flex items-center justify-center gap-2 py-2 rounded-xl border border-white/5 text-[8px] font-black uppercase tracking-widest transition-all
                                  ${isRefreshingModels === cat
                                    ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-blue-400 hover:border-blue-500/20'
                                  }`}
                              >
                                {isRefreshingModels === cat ? '⏳ 正在刷新...' : '🔄 刷新列表'}
                              </button>
                              <button
                                onClick={() => setIsCustomModelInput(prev => ({ ...prev, [cat]: !prev[cat] }))}
                                className={`flex items-center justify-center gap-2 py-2 rounded-xl border border-white/5 text-[8px] font-black uppercase tracking-widest transition-all
                                  ${isCustomModelInput[cat]
                                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-blue-400 hover:border-blue-500/20'
                                  }`}
                              >
                                ✍️ 自定义模型
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 mx-1">
                  {groupedPlugins[cat].map((plugin) => (
                    <button
                      key={plugin.type}
                      onClick={() => onAddNode(plugin)}
                      className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.03] hover:border-white/10 p-4 rounded-2xl transition-all group flex items-center gap-4 active:scale-95"
                    >
                      <div className={`w-11 h-11 shrink-0 rounded-2xl ${plugin.color} flex items-center justify-center text-xl shadow-2xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                        {plugin.icon}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-white font-black text-xs truncate group-hover:text-blue-400 transition-colors">{plugin.titleZh}</span>
                        <p className="text-slate-500 text-[9px] mt-1 leading-tight line-clamp-1 italic font-medium">
                          {plugin.descriptionZh}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-6 bg-white/[0.02] border-t border-white/5 space-y-4">
        <button
          onClick={onOpenSettings}
          className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/20 shadow-lg shadow-blue-500/5"
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_12px_#3b82f6]"></div>
          配置 API 提供商
        </button>
      </div>
    </div>
  );
};
