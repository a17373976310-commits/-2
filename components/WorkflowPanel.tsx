
import React, { useState, useEffect, useRef } from 'react';
import { Workflow, AppNode, PluginCategory } from '../types';
import { logger } from '../services/loggerService';

interface WorkflowPanelProps {
  currentNodes: AppNode[];
  currentTransform: { x: number; y: number; scale: number };
  categoryModels: Record<PluginCategory, string>;
  onLoadWorkflow: (workflow: Workflow) => void;
  onClearCanvas: () => void;
  onResetTransform: () => void; // 新增：复位视口
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({ 
  currentNodes, 
  currentTransform, 
  categoryModels,
  onLoadWorkflow,
  onClearCanvas,
  onResetTransform
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('gemini_workflows');
    if (saved) {
      try {
        setWorkflows(JSON.parse(saved));
      } catch (e) {
        console.error("无法解析保存的工作流", e);
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveWorkflows = (list: Workflow[]) => {
    setWorkflows(list);
    localStorage.setItem('gemini_workflows', JSON.stringify(list));
  };

  const handleSave = () => {
    // 自动命名逻辑
    const name = newWorkflowName.trim() || `未命名工作流_${new Date().toLocaleTimeString([], { hour12: false })}`;
    
    const newWorkflow: Workflow = {
      id: Math.random().toString(36).substr(2, 9),
      name: name,
      nodes: JSON.parse(JSON.stringify(currentNodes)), // 深拷贝确保数据隔离
      transform: { ...currentTransform },
      categoryModels: { ...categoryModels },
      createdAt: Date.now()
    };
    
    const updated = [newWorkflow, ...workflows];
    saveWorkflows(updated);
    setNewWorkflowName('');
    logger.success(`工作流已保存: ${newWorkflow.name}`);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个工作流吗？')) {
      const updated = workflows.filter(w => w.id !== id);
      saveWorkflows(updated);
      logger.warn(`工作流已删除。`);
    }
  };

  const handleExport = () => {
    if (workflows.length === 0) {
      logger.error("没有可导出的工作流。");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workflows, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `gemini_workflows_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    logger.info("工作流已导出至本地文件。");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          // 合并并去重
          const existingIds = new Set(workflows.map(w => w.id));
          const uniqueImported = imported.filter(w => !existingIds.has(w.id));
          saveWorkflows([...uniqueImported, ...workflows]);
          logger.success(`成功导入 ${uniqueImported.length} 个新工作流。`);
        } else {
          throw new Error("格式错误");
        }
      } catch (err) {
        logger.error("导入失败：文件格式无效。");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // 重置 input
  };

  return (
    <div className="fixed top-6 right-6 z-[200]" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all shadow-2xl backdrop-blur-xl ${isOpen ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/80'}`}
      >
        <span className="text-lg">📦</span>
        <div className="flex flex-col items-start">
           <span className="text-[10px] font-black uppercase tracking-[0.2em]">工作流中心</span>
           <span className="text-[8px] font-bold opacity-60 uppercase">{workflows.length} 个已保存配置</span>
        </div>
        <svg className={`w-3 h-3 ml-2 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
      </button>

      {isOpen && (
        <div className="absolute top-16 right-0 w-80 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-in zoom-in-95 fade-in duration-200 ring-1 ring-white/10">
          <div className="p-6 border-b border-white/5 bg-white/5">
             <h3 className="text-white text-[11px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                配置注册表管理
             </h3>
             
             <div className="flex gap-2 mb-2">
                <input 
                  type="text"
                  placeholder="输入工作流名称..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <button 
                  onClick={handleSave}
                  title="保存当前快照"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-all active:scale-90 font-bold"
                >
                  保存
                </button>
             </div>
          </div>

          <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-1">
             {workflows.length === 0 && (
               <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-2">
                  <span className="text-2xl">📁</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">暂无保存的工作流</span>
               </div>
             )}
             {workflows.map(w => (
               <div 
                 key={w.id} 
                 onClick={() => { onLoadWorkflow(w); setIsOpen(false); }}
                 className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 group cursor-pointer transition-all border border-transparent hover:border-white/5"
               >
                 <div className="flex flex-col min-w-0">
                    <span className="text-slate-200 text-xs font-bold truncate group-hover:text-blue-400 transition-colors">{w.name}</span>
                    <span className="text-slate-500 text-[8px] font-mono">{new Date(w.createdAt).toLocaleString()}</span>
                 </div>
                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={(e) => handleDelete(w.id, e)}
                      className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all rounded-lg"
                      title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                 </div>
               </div>
             ))}
          </div>

          <div className="p-4 bg-white/[0.02] border-t border-white/5 grid grid-cols-2 gap-2">
             <button 
               onClick={handleExport}
               className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all border border-white/5"
             >
                导出 JSON
             </button>
             <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer">
                导入 JSON
                <input type="file" className="hidden" accept=".json" onChange={handleImport} />
             </label>
             <button 
               onClick={onResetTransform}
               className="col-span-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[9px] font-black uppercase tracking-widest text-slate-300 transition-all border border-white/5"
             >
                视口复位
             </button>
             <button 
               onClick={() => { if(confirm('确定要清空当前所有节点吗？')) { onClearCanvas(); setIsOpen(false); } }}
               className="col-span-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-[9px] font-black uppercase tracking-widest text-red-400 transition-all border border-red-500/20"
             >
                清空画布
             </button>
          </div>
        </div>
      )}
    </div>
  );
};
