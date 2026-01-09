
import React, { useState, useEffect } from 'react';
import { AppNode } from '../types';
import { logger } from '../services/loggerService';

interface CollageWorkshopUIProps {
    node: AppNode;
    allNodes: AppNode[];
    onUpdate: (id: string, data: any) => void;
    onImageClick: (src: string) => void;
}

export const CollageWorkshopUI: React.FC<CollageWorkshopUIProps> = ({
    node, allNodes, onUpdate, onImageClick
}) => {
    const [merging, setMerging] = useState(false);

    const sourceNode = allNodes.find(n => n.id === node.data.sourceNodeId);
    const availableImages = sourceNode?.data.results || sourceNode?.data.images || [];
    const selectedIndices = node.data.selectedIndices || []; // Indices from availableImages

    // Initialize selectedIndices if empty and source has images
    useEffect(() => {
        if (selectedIndices.length === 0 && availableImages.length > 0) {
            onUpdate(node.id, { ...node.data, selectedIndices: availableImages.map((_: any, i: number) => i) });
        }
    }, [availableImages.length]);

    const toggleSelect = (idx: number) => {
        const newIndices = selectedIndices.includes(idx)
            ? selectedIndices.filter((i: number) => i !== idx)
            : [...selectedIndices, idx];
        onUpdate(node.id, { ...node.data, selectedIndices: newIndices });
    };

    const moveItem = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= selectedIndices.length) return;
        const newIndices = [...selectedIndices];
        const [removed] = newIndices.splice(fromIndex, 1);
        newIndices.splice(toIndex, 0, removed);
        onUpdate(node.id, { ...node.data, selectedIndices: newIndices });
    };

    const generateCollage = async () => {
        if (selectedIndices.length === 0) {
            logger.error('请先选择要拼图的图片');
            return;
        }

        setMerging(true);
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 上下文');

            // Load all images
            const imgElements = await Promise.all(
                selectedIndices.map((idx: number) => {
                    return new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = availableImages[idx];
                    });
                })
            );

            // Simple grid logic (square-ish)
            const count = imgElements.length;
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);

            const itemSize = 1024; // Base size for each cell
            canvas.width = cols * itemSize;
            canvas.height = rows * itemSize;

            ctx.fillStyle = '#0f172a'; // slate-900
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            imgElements.forEach((img, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;

                // Draw image with "cover" logic
                const scale = Math.max(itemSize / img.width, itemSize / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = c * itemSize + (itemSize - w) / 2;
                const y = r * itemSize + (itemSize - h) / 2;

                ctx.drawImage(img, x, y, w, h);
            });

            const resultBase64 = canvas.toDataURL('image/png');
            onUpdate(node.id, { ...node.data, result: resultBase64 });
            logger.success('拼图合成成功！');
        } catch (err: any) {
            logger.error('拼图失败: ' + err.message);
        } finally {
            setMerging(false);
        }
    };

    const downloadResult = () => {
        if (!node.data.result) return;
        const link = document.createElement('a');
        link.href = node.data.result;
        link.download = `collage-${Date.now()}.png`;
        link.click();
    };

    return (
        <div className="space-y-4">
            {/* 来源选择 */}
            <div className="space-y-1.5">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">数据来源</label>
                <select
                    value={node.data.sourceNodeId || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, sourceNodeId: e.target.value, selectedIndices: [] })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-blue-500/50"
                >
                    <option value="">请选择来源节点...</option>
                    {allNodes.filter(n => n.id !== node.id && (n.data.results || n.data.images)).map(n => (
                        <option key={n.id} value={n.id}>{n.titleZh} ({n.id.slice(0, 4)})</option>
                    ))}
                </select>
            </div>

            {/* 图片选择与排序 */}
            {availableImages.length > 0 && (
                <div className="space-y-2">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">选择并排序 ({selectedIndices.length}/{availableImages.length})</label>
                    <div className="grid grid-cols-3 gap-2 p-2 bg-slate-950/50 rounded-xl border border-white/5 max-h-[200px] overflow-y-auto no-scrollbar">
                        {availableImages.map((img: string, idx: number) => {
                            const isSelected = selectedIndices.includes(idx);
                            const order = selectedIndices.indexOf(idx);

                            return (
                                <div
                                    key={idx}
                                    onClick={() => toggleSelect(idx)}
                                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all border-2 
                    ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-transparent opacity-50 hover:opacity-80'}
                  `}
                                >
                                    <img src={img} className="w-full h-full object-cover" />
                                    {isSelected && (
                                        <div className="absolute top-1 left-1 bg-blue-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
                                            {order + 1}
                                        </div>
                                    )}
                                    {isSelected && (
                                        <div className="absolute bottom-1 right-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => moveItem(order, order - 1)} className="bg-black/60 p-1 rounded hover:bg-blue-500 transition-colors">
                                                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" /></svg>
                                            </button>
                                            <button onClick={() => moveItem(order, order + 1)} className="bg-black/60 p-1 rounded hover:bg-blue-500 transition-colors">
                                                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
                <button
                    onClick={generateCollage}
                    disabled={merging || selectedIndices.length === 0}
                    className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg
            ${merging ? 'bg-slate-700 text-slate-500' : 'bg-gradient-to-br from-pink-600 to-orange-600 text-white hover:scale-[1.02]'}
          `}
                >
                    {merging ? '正在合成...' : '一键合成拼图'}
                </button>
                {node.data.result && (
                    <button
                        onClick={downloadResult}
                        className="px-4 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors shadow-lg"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    </button>
                )}
            </div>

            {/* 预览 */}
            {node.data.result && (
                <div className="space-y-2 pt-4 border-t border-slate-800">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">拼图预览</label>
                    <div className="relative group rounded-2xl overflow-hidden bg-slate-950 ring-1 ring-white/10 shadow-2xl">
                        <img
                            src={node.data.result}
                            className="w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                            onClick={() => onImageClick(node.data.result)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-4">
                            <span className="text-[10px] text-white/80 font-bold">点击查看大图</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
