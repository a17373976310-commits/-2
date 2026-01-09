import React, { useEffect, useState } from 'react';
import { historyService, HistoryRecord } from '../services/historyService';

interface HistoryPanelProps {
    onClose: () => void;
    onImageClick: (src: string) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onClose, onImageClick }) => {
    const [records, setRecords] = useState<HistoryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoading(true);
        const data = await historyService.getRecords();
        setRecords(data);
        setLoading(false);
    };

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300"
            onWheel={(e) => e.stopPropagation()}
        >
            <div className="bg-[#0f172a] border border-white/10 w-full max-w-5xl h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">生成历史记录</h2>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Generation History</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* List */}
                    <div className="w-1/3 border-r border-white/5 overflow-y-auto custom-scrollbar p-4 space-y-3">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">加载中...</span>
                            </div>
                        ) : records.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 italic text-sm">
                                暂无历史记录
                            </div>
                        ) : (
                            records.map((record) => (
                                <div
                                    key={record.folderName}
                                    onClick={() => setSelectedRecord(record)}
                                    className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedRecord?.folderName === record.folderName ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-transparent hover:border-white/10'}`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-mono text-blue-400 font-bold">{record.timestamp}</span>
                                        <span className="text-[8px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-white/5 uppercase font-bold">{record.model.split('/').pop()}</span>
                                    </div>
                                    <p className="text-slate-300 text-xs line-clamp-2 font-medium leading-relaxed">
                                        {record.originalPrompt}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Detail */}
                    <div className="flex-1 bg-slate-950/30 overflow-y-auto custom-scrollbar p-8">
                        {selectedRecord ? (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="grid grid-cols-2 gap-8">
                                    {selectedRecord.hasOriginalImage && (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">原始图片</label>
                                            <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl cursor-zoom-in hover:border-blue-500/50 transition-all bg-slate-900 flex items-center justify-center" onClick={() => onImageClick(historyService.getFileUrl(selectedRecord.folderName!, "original_image.png"))}>
                                                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                </div>
                                                <img
                                                    key={`${selectedRecord.folderName}-orig`}
                                                    src={historyService.getFileUrl(selectedRecord.folderName!, "original_image.png")}
                                                    className="relative z-10 w-full h-full object-contain hover:opacity-90 transition-opacity"
                                                    alt="Original"
                                                    loading="lazy"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">生成结果</label>
                                        <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl ring-2 ring-blue-500/20 cursor-zoom-in hover:ring-blue-500 transition-all bg-slate-900 flex items-center justify-center" onClick={() => onImageClick(historyService.getFileUrl(selectedRecord.folderName!, "generated_image.png"))}>
                                            <div className="absolute inset-0 flex items-center justify-center opacity-20">
                                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                            <img
                                                key={`${selectedRecord.folderName}-gen`}
                                                src={historyService.getFileUrl(selectedRecord.folderName!, "generated_image.png")}
                                                className="relative z-10 w-full h-full object-contain hover:opacity-90 transition-opacity"
                                                alt="Generated"
                                                loading="lazy"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">原始提示词</label>
                                        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 text-slate-300 text-sm leading-relaxed font-medium">
                                            {selectedRecord.originalPrompt}
                                        </div>
                                    </div>

                                    {selectedRecord.optimizedPrompt && (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-amber-500/70 uppercase tracking-[0.2em]">优化后提示词</label>
                                            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-6 text-amber-100/80 text-sm leading-relaxed font-medium italic">
                                                {selectedRecord.optimizedPrompt}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-6 border-t border-white/5 flex gap-4">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">本地路径</span>
                                        <span className="text-[10px] text-slate-400 font-mono">history/{selectedRecord.folderName}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                                <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center">
                                    <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                </div>
                                <p className="text-sm font-bold uppercase tracking-widest opacity-30">选择一条记录查看详情</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
