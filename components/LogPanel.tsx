
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LogEntry } from '../types';
import { logger } from '../services/loggerService';

export const LogPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [position, setPosition] = useState({ x: 340, y: window.innerHeight - 344 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe((entry) => {
      setLogs(prev => [...prev, entry]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen, filter]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡到画布
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const filteredLogs = useMemo(() =>
    filter === 'all' ? logs : logs.filter(l => l.level === filter),
    [logs, filter]
  );

  const errorCount = useMemo(() =>
    logs.filter(l => l.level === 'error').length,
    [logs]
  );

  // 迷你触发器
  if (!isOpen) {
    return (
      <div className="fixed bottom-6 left-[340px] z-[100] animate-in fade-in slide-in-from-left-4 duration-500">
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 px-4 py-2.5 rounded-2xl hover:border-blue-500/50 hover:bg-slate-800/80 transition-all shadow-2xl"
        >
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
            {errorCount > 0 && (
              <div className="absolute -top-3 -right-3 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                {errorCount}
              </div>
            )}
          </div>
          <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.15em] group-hover:text-blue-400 transition-colors">
            System Console
          </span>
          <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 font-sans text-[9px] font-medium text-slate-500 bg-slate-800 border border-slate-700 rounded uppercase">
            Logs
          </kbd>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed w-[400px] h-[320px] bg-slate-950/40 backdrop-blur-2xl border border-white/10 rounded-3xl z-[150] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 
        ${isDragging ? 'duration-0' : 'duration-300'}`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        left: 0,
        top: 0
      }}
      onMouseDown={handleMouseDown}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-white/5 drag-handle cursor-move select-none">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40"></div>
          </div>
          <span className="text-white/80 text-[10px] font-black uppercase tracking-widest ml-1">Terminal Output</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto no-scrollbar">
        {(['all', 'info', 'success', 'warn', 'error'] as const).map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-tighter transition-all border ${filter === lvl ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            {lvl}
          </button>
        ))}
        <div className="flex-1"></div>
        <button
          onClick={() => { logger.clear(); setLogs([]); }}
          className="p-1 hover:text-red-400 text-slate-600 transition-colors"
          title="Clear Console"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>

      {/* Log List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar selection:bg-blue-500/30"
      >
        {filteredLogs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 opacity-50">
            <div className="text-2xl">⌨️</div>
            <p className="italic uppercase tracking-widest text-[9px]">No logs to display</p>
          </div>
        )}
        {filteredLogs.map((log) => (
          <div key={log.id} className="flex gap-3 group items-start">
            <span className="text-white/20 shrink-0 select-none">{log.timestamp.toLocaleTimeString([], { hour12: false })}</span>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 shadow-sm
                  ${log.level === 'info' ? 'bg-blue-500' : ''}
                  ${log.level === 'warn' ? 'bg-yellow-500' : ''}
                  ${log.level === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : ''}
                  ${log.level === 'success' ? 'bg-emerald-500' : ''}
                `}></div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    {log.nodeTitle && (
                      <span className="text-white/40 font-black text-[8px] uppercase tracking-tighter shrink-0 border border-white/10 px-1 rounded bg-white/5">
                        {log.nodeTitle}
                      </span>
                    )}
                    <span className={`break-words leading-relaxed
                      ${log.level === 'info' ? 'text-blue-300/80' : ''}
                      ${log.level === 'warn' ? 'text-yellow-200/80' : ''}
                      ${log.level === 'error' ? 'text-red-300 font-bold underline decoration-red-500/30' : ''}
                      ${log.level === 'success' ? 'text-emerald-300/80' : ''}
                    `}>
                      {log.message}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Branding */}
      <div className="px-5 py-2 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
        <span className="text-[8px] text-white/20 font-mono uppercase tracking-[0.3em]">Core Engine v2.5-flash</span>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
          <span className="text-[8px] text-white/30 uppercase font-bold">Encrypted Connection</span>
        </div>
      </div>
    </div>
  );
};
