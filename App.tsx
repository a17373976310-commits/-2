
import React, { useState, useEffect, useRef } from 'react';
import { AppNode, NodeType, PluginMetadata, PluginCategory, Workflow, LogEntry } from './types';
import { PluginLibrary } from './components/PluginLibrary';
import { NodeUI } from './components/NodeUI';
import { LiveAudioUI } from './components/LiveAudioUI';
import { LogPanel } from './components/LogPanel';
import { WorkflowPanel } from './components/WorkflowPanel';
import { ApiSettingsPanel } from './components/ApiSettingsPanel';
import { PLUGINS, SUGGESTED_MODELS } from './constants';
import { logger } from './services/loggerService';
import { ApiConfig } from './types';
import { HistoryPanel } from './components/HistoryPanel';
import { ImageLightbox } from './components/ImageLightbox';
import { ConnectionLines } from './components/ConnectionLines';
import { AIChatSidebar } from './components/AIChatSidebar';

const App: React.FC = () => {
  const INITIAL_TRANSFORM = { x: window.innerWidth / 4, y: window.innerHeight / 4, scale: 0.8 };
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);

  const [categoryModels, setCategoryModels] = useState<Record<PluginCategory, string>>({
    [PluginCategory.VISUAL]: 'nano-banana-2',
    [PluginCategory.VIDEO]: 'luma-dream-machine',
    [PluginCategory.LOGIC]: 'gpt-4o',
    [PluginCategory.INTERACT]: 'whisper-1',
  });

  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem('apiConfig');
    return saved ? JSON.parse(saved) : { providers: [], defaultProviderId: null, defaultImageProviderId: null };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Subscribe to logs for AI Chat
  useEffect(() => {
    const unsubscribe = logger.subscribe((entry) => {
      setLogs(prev => [...prev.slice(-50), entry]); // Keep last 50 logs
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    localStorage.setItem('apiConfig', JSON.stringify(apiConfig));
  }, [apiConfig]);

  useEffect(() => {
    logger.info("Infinite Canvas 系统已启动。");

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const addNode = (plugin: PluginMetadata, pos?: { x: number, y: number }) => {
    const newNode: AppNode = {
      id: Math.random().toString(36).substr(2, 9),
      type: plugin.type,
      position: pos || {
        x: (window.innerWidth / 2 - transform.x) / transform.scale - 150,
        y: (window.innerHeight / 2 - transform.y) / transform.scale - 100
      },
      data: {
        model: SUGGESTED_MODELS[plugin.category][0].id,
        sourceNodeId: null
      },
      title: plugin.title,
      titleZh: plugin.titleZh
    };
    setNodes(prev => [...prev, newNode]);
    setContextMenu(null);
    logger.info(`节点已生成: ${plugin.titleZh}`);
  };

  const updateNode = (id: string, data: any) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data } : n));
  };

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    logger.warn(`节点已移除。`);
  };

  const handleLoadWorkflow = (workflow: Workflow) => {
    setNodes(workflow.nodes);
    setTransform(workflow.transform);
    if (workflow.categoryModels) setCategoryModels(workflow.categoryModels);
    logger.success(`工作流加载成功: ${workflow.name}`);
  };

  const handleClearCanvas = () => {
    setNodes([]);
    logger.warn("画布已清空。");
  };

  const handleResetTransform = () => {
    setTransform(INITIAL_TRANSFORM);
    logger.info("视图已重置。");
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
      return;
    }
    setContextMenu(null);

    // 逻辑：左键点击背景、中键、或按住空格时触发平移
    if (e.button === 0 || e.button === 1 || isSpacePressed) {
      setIsPanning(true);
    }
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const lastMousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    if (isPanning) {
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (draggingNodeId) {
      setNodes(prev => prev.map(n => n.id === draggingNodeId ? {
        ...n,
        position: { x: n.position.x + dx / transform.scale, y: n.position.y + dy / transform.scale }
      } : n));
    }

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // 缩放逻辑
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const newScale = Math.min(Math.max(transform.scale * factor, 0.1), 3);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - transform.x) / transform.scale;
      const worldY = (mouseY - transform.y) / transform.scale;

      setTransform({
        scale: newScale,
        x: mouseX - worldX * newScale,
        y: mouseY - worldY * newScale,
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-screen h-screen bg-[#020617] overflow-hidden select-none transition-colors duration-300 
        ${isPanning ? 'cursor-grabbing' : (isSpacePressed ? 'cursor-grab' : 'cursor-default')}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0 canvas-grid opacity-30"></div>

      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          transition: isPanning || draggingNodeId ? 'none' : 'transform 0.1s cubic-bezier(0.2, 0.0, 0, 1.0)'
        }}
      >
        <ConnectionLines nodes={nodes} />
        {(() => {
          const seenIds = new Set<string>();
          return nodes.filter(n => {
            if (seenIds.has(n.id)) return false;
            seenIds.add(n.id);
            return true;
          }).map(node => {
            const plugin = PLUGINS.find(p => p.type === node.type);
            const categoryModel = plugin ? categoryModels[plugin.category] : undefined;

            return (
              <div
                key={node.id}
                className="absolute pointer-events-auto"
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  zIndex: draggingNodeId === node.id ? 100 : 1
                }}
                onMouseDown={(e) => {
                  // 仅左键且非空格键按下时，阻止背景平移并触发节点拖拽
                  if (e.button === 0 && !isSpacePressed) {
                    e.stopPropagation();
                    setDraggingNodeId(node.id);
                  }
                }}
              >
                {node.type === NodeType.AUDIO_LIVE ? (
                  <LiveAudioUI node={node} onUpdate={updateNode} onDelete={deleteNode} />
                ) : (
                  <NodeUI
                    node={node}
                    allNodes={nodes}
                    onUpdate={updateNode}
                    onDelete={deleteNode}
                    globalCategoryModel={categoryModel}
                    apiConfig={apiConfig}
                    onImageClick={setLightboxImage}
                    isPaused={isPaused}
                  />
                )}
              </div>
            );
          })
        })()}
      </div>

      <PluginLibrary
        onAddNode={addNode}
        categoryModels={categoryModels}
        setCategoryModels={setCategoryModels}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="fixed top-6 right-[220px] z-[210] flex gap-3">
        {/* 暂停按钮 */}
        <button
          onClick={() => {
            setIsPaused(!isPaused);
            logger.warn(isPaused ? '已恢复所有任务' : '已暂停所有任务');
          }}
          className={`backdrop-blur-2xl px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 transition-all group ${isPaused
            ? 'bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30'
            : 'bg-slate-900/40 border-white/10 hover:border-white/20 hover:bg-slate-800/60'
            }`}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${isPaused ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/10 text-slate-400'
            }`}>
            {isPaused ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            )}
          </div>
          <div className="flex flex-col items-start">
            <span className={`font-black text-[9px] uppercase tracking-widest ${isPaused ? 'text-amber-400' : 'text-white/80'}`}>
              {isPaused ? '已暂停' : '暂停'}
            </span>
            <span className="text-slate-500 text-[8px] font-mono font-bold uppercase">
              {isPaused ? 'Paused' : 'Pause'}
            </span>
          </div>
        </button>
        {/* 历史记录按钮 */}
        <button
          onClick={() => setShowHistory(true)}
          className="bg-slate-900/40 backdrop-blur-2xl px-4 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-3 transition-all hover:border-white/20 hover:bg-slate-800/60 group"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-white/80 font-black text-[9px] uppercase tracking-widest">历史记录</span>
            <span className="text-slate-500 text-[8px] font-mono font-bold uppercase">History</span>
          </div>
        </button>
      </div>

      {showSettings && (
        <ApiSettingsPanel
          config={apiConfig}
          onUpdate={setApiConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHistory && (
        <HistoryPanel
          onClose={() => setShowHistory(false)}
          onImageClick={setLightboxImage}
        />
      )}

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}

      <WorkflowPanel
        currentNodes={nodes}
        currentTransform={transform}
        categoryModels={categoryModels}
        onLoadWorkflow={handleLoadWorkflow}
        onClearCanvas={handleClearCanvas}
        onResetTransform={handleResetTransform}
      />

      <LogPanel />

      {/* AI Chat Toggle Button */}
      <button
        onClick={() => setShowAIChat(true)}
        className="fixed left-6 bottom-24 z-50 backdrop-blur-2xl px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 transition-all group bg-slate-900/60 border-white/10 hover:border-blue-500/50 hover:bg-slate-800/80"
        title="打开 AI 助手"
      >
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-white/80 font-black text-[9px] uppercase tracking-widest">AI 助手</span>
          <span className="text-slate-500 text-[8px] font-mono font-bold uppercase">Chat</span>
        </div>
      </button>

      {/* AI Chat Sidebar */}
      <AIChatSidebar
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        theme="dark"
        apiConfig={apiConfig}
        globalApiKey={apiConfig.providers[0]?.apiKey || ''}
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        onAddNode={(type: string) => {
          const plugin = PLUGINS.find(p => p.type === type);
          if (plugin) addNode(plugin);
        }}
        onUpdateNode={(id: string, data: any) => {
          updateNode(id, data);
        }}
        logs={logs}
      />

      {contextMenu?.visible && (
        <div
          className="fixed bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl py-2 w-52 z-[200] animate-in fade-in zoom-in-95 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()} // 防止点击菜单触发平移
        >
          <div className="px-4 py-1.5 mb-1 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-white/5">右键快捷菜单</div>
          {PLUGINS.map(p => (
            <button
              key={p.type}
              className="w-full text-left px-4 py-2 hover:bg-white/5 text-slate-300 text-[11px] flex items-center gap-3 transition-colors group"
              onClick={() => {
                const worldX = (contextMenu.x - transform.x) / transform.scale;
                const worldY = (contextMenu.y - transform.y) / transform.scale;
                addNode(p, { x: worldX, y: worldY });
              }}
            >
              <span className="group-hover:scale-125 transition-transform">{p.icon}</span>
              <span className="font-medium group-hover:text-blue-400">{p.titleZh}</span>
            </button>
          ))}
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
        <div className="bg-slate-900/40 backdrop-blur-2xl px-5 py-3 rounded-2xl border border-white/10 shadow-2xl pointer-events-auto flex items-center gap-6 transition-all hover:border-white/20">
          <div className="flex flex-col">
            <span className="text-white/80 font-black text-[9px] uppercase tracking-widest">视图缩放</span>
            <span className="text-slate-500 text-[10px] font-mono leading-tight mt-0.5">{Math.round(transform.scale * 100)}%</span>
          </div>
          <div className="h-6 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setTransform(p => ({ ...p, scale: Math.max(0.1, p.scale - 0.1) }))} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-xs transition-all">-</button>
            <button onClick={() => setTransform(p => ({ ...p, scale: Math.min(3, p.scale + 0.1) }))} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-xs transition-all">+</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
