import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppNode, ApiConfig } from '../types';
import { logger } from '../services/loggerService';
import { apiService } from '../services/ApiService';
import JSZip from 'jszip';

interface ImageSlicerUIProps {
    node: AppNode;
    allNodes: AppNode[];
    onUpdate: (id: string, data: any) => void;
    apiConfig: ApiConfig;
    onImageClick: (src: string) => void;
    globalCategoryModel?: string;
}

interface SliceResult {
    id: number;
    url: string;
    blob: Blob;
    width: number;
    height: number;
    ext: string;
}

interface Region {
    id: number;
    x: number;      // %
    y: number;      // %
    width: number;  // %
    height: number; // %
}

// =============================================================================
// 核心算法：内容岛检测 (Content Island Detection 4.3 紧凑适配版)
// =============================================================================

const detectContentIslands = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    sensitivity: number = 30,
    rows: number = 3,
    cols: number = 3,
    mode: 'grid' | 'tight' = 'tight'
): Region[] => {
    // 1. 自动识别背景色
    const samples = [
        [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
        [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
        [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)]
    ];
    let r = 0, g = 0, b = 0;
    samples.forEach(([x, y]) => {
        const idx = (y * width + x) * 4;
        r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
    });
    const bg = { r: r / samples.length, g: g / samples.length, b: b / samples.length };

    // 2. 生成内容遮罩
    const scale = 4;
    const sw = Math.floor(width / scale);
    const sh = Math.floor(height / scale);
    const mask = new Uint8Array(sw * sh);

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const idx = (y * scale * width + x * scale) * 4;
            const dist = Math.sqrt(
                Math.pow(data[idx] - bg.r, 2) +
                Math.pow(data[idx + 1] - bg.g, 2) +
                Math.pow(data[idx + 2] - bg.b, 2)
            );
            if (dist > sensitivity) mask[y * sw + x] = 1;
        }
    }

    // 3. 寻找连通域
    const visited = new Uint8Array(sw * sh);
    const islands: { minX: number, minY: number, maxX: number, maxY: number }[] = [];

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            if (mask[y * sw + x] === 1 && visited[y * sw + x] === 0) {
                let minX = x, maxX = x, minY = y, maxY = y;
                const stack = [[x, y]];
                visited[y * sw + x] = 1;
                while (stack.length > 0) {
                    const [cx, cy] = stack.pop()!;
                    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                    const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < sw && ny >= 0 && ny < sh && mask[ny * sw + nx] === 1 && visited[ny * sw + nx] === 0) {
                            visited[ny * sw + nx] = 1;
                            stack.push([nx, ny]);
                        }
                    }
                }
                islands.push({ minX, minY, maxX, maxY });
            }
        }
    }

    // 4. 智能归并 (极低阈值)
    let merged = true;
    while (merged) {
        merged = false;
        for (let i = 0; i < islands.length; i++) {
            for (let j = i + 1; j < islands.length; j++) {
                const a = islands[i], b = islands[j];
                const gapX = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
                const gapY = Math.max(0, b.minY - a.maxY, a.minY - b.maxY);
                if (gapX < sw * 0.01 && gapY < sh * 0.01) {
                    islands[i] = {
                        minX: Math.min(a.minX, b.minX),
                        minY: Math.min(a.minY, b.minY),
                        maxX: Math.max(a.maxX, b.maxX),
                        maxY: Math.max(a.maxY, b.maxY)
                    };
                    islands.splice(j, 1);
                    merged = true;
                    break;
                }
            }
            if (merged) break;
        }
    }

    // 5. 转换为 Region
    const finalRegions: Region[] = [];
    let idCounter = 0;

    islands.forEach(is => {
        const iw = is.maxX - is.minX + 1;
        const ih = is.maxY - is.minY + 1;
        if (iw * ih < (sw * sh * 0.001)) return; // 过滤杂点

        if (mode === 'grid') {
            // 网格模式：按比例切分
            const idealCellW = sw / cols;
            const idealCellH = sh / rows;
            const nCols = Math.max(1, Math.round(iw / idealCellW));
            const nRows = Math.max(1, Math.round(ih / idealCellH));
            for (let r = 0; r < nRows; r++) {
                for (let c = 0; c < nCols; c++) {
                    finalRegions.push({
                        id: idCounter++,
                        x: ((is.minX + (iw / nCols) * c) / sw) * 100,
                        y: ((is.minY + (ih / nRows) * r) / sh) * 100,
                        width: ((iw / nCols) / sw) * 100,
                        height: ((ih / nRows) / sh) * 100
                    });
                }
            }
        } else {
            // 紧凑模式：直接使用孤岛包围框
            finalRegions.push({
                id: idCounter++,
                x: (is.minX / sw) * 100,
                y: (is.minY / sh) * 100,
                width: (iw / sw) * 100,
                height: (ih / sh) * 100
            });
        }
    });

    return finalRegions.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
        return a.y - b.y;
    }).map((r, i) => ({ ...r, id: i }));
};

// =============================================================================
// 主组件
// =============================================================================

export const ImageSlicerUI: React.FC<ImageSlicerUIProps> = ({
    node, allNodes, onUpdate, apiConfig, onImageClick, globalCategoryModel,
}) => {
    const [regions, setRegions] = useState<Region[]>(node.data.regions || []);
    const [margin, setMargin] = useState<number>(node.data.margin || 0);
    const [sensitivity, setSensitivity] = useState<number>(node.data.sensitivity || 30);
    const [rows, setRows] = useState<number>(node.data.rows || 3);
    const [cols, setCols] = useState<number>(node.data.cols || 3);
    const [detectMode, setDetectMode] = useState<'grid' | 'tight'>(node.data.detectMode || 'tight');

    const [slices, setSlices] = useState<SliceResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

    const [activeRegionId, setActiveRegionId] = useState<number | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null);
    const [dragMode, setDragMode] = useState<'move' | 'resize' | null>(null);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentImage = useMemo(() => {
        const localImage = node.data.image;
        const sourceNode = allNodes.find((n) => n.id === node.data.sourceNodeId);
        if (localImage) return localImage;
        if (!sourceNode) return null;
        if (sourceNode.data.result?.startsWith?.('data:image')) return sourceNode.data.result;
        if (sourceNode.data.image) return sourceNode.data.image;
        if (sourceNode.data.images?.length > 0) return sourceNode.data.images[0];
        return null;
    }, [node.data.image, node.data.sourceNodeId, allNodes]);

    useEffect(() => {
        onUpdate(node.id, { regions, margin, slices, sensitivity, rows, cols, detectMode });
    }, [regions, margin, slices, sensitivity, rows, cols, detectMode]);

    useEffect(() => {
        if (currentImage) {
            const img = new Image();
            img.onload = () => setImageSize({ width: img.width, height: img.height });
            img.src = currentImage;
        }
    }, [currentImage]);

    const getMousePos = (e: React.MouseEvent | MouseEvent) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const pos = getMousePos(e);
        for (const r of regions) {
            const handleSize = 3;
            const handles = [{ id: 'br', x: r.x + r.width, y: r.y + r.height }, { id: 'tl', x: r.x, y: r.y }];
            for (const h of handles) {
                if (Math.abs(pos.x - h.x) < handleSize && Math.abs(pos.y - h.y) < handleSize) {
                    setActiveRegionId(r.id); setDragMode('resize'); setResizeHandle(h.id); return;
                }
            }
            if (pos.x > r.x && pos.x < r.x + r.width && pos.y > r.y && pos.y < r.y + r.height) {
                setActiveRegionId(r.id); setDragMode('move'); setDrawStart(pos); return;
            }
        }
        setIsDrawing(true); setDrawStart(pos);
        const newId = regions.length > 0 ? Math.max(...regions.map(r => r.id)) + 1 : 0;
        setRegions([...regions, { id: newId, x: pos.x, y: pos.y, width: 0, height: 0 }]);
        setActiveRegionId(newId);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!activeRegionId && !isDrawing) return;
        const pos = getMousePos(e);
        setRegions(prev => prev.map(r => {
            if (r.id !== activeRegionId) return r;
            if (isDrawing && drawStart) {
                return { ...r, x: Math.min(pos.x, drawStart.x), y: Math.min(pos.y, drawStart.y), width: Math.abs(pos.x - drawStart.x), height: Math.abs(pos.y - drawStart.y) };
            }
            if (dragMode === 'move' && drawStart) {
                const dx = pos.x - drawStart.x, dy = pos.y - drawStart.y;
                setDrawStart(pos); return { ...r, x: r.x + dx, y: r.y + dy };
            }
            if (dragMode === 'resize' && resizeHandle) {
                if (resizeHandle === 'br') return { ...r, width: Math.max(1, pos.x - r.x), height: Math.max(1, pos.y - r.y) };
                if (resizeHandle === 'tl') return { ...r, x: pos.x, y: pos.y, width: Math.max(1, r.x + r.width - pos.x), height: Math.max(1, r.y + r.height - pos.y) };
            }
            return r;
        }));
    };

    const handleMouseUp = () => {
        setIsDrawing(false); setDragMode(null); setResizeHandle(null); setDrawStart(null);
        setRegions(prev => prev.filter(r => r.width > 1 && r.height > 1));
    };

    const detectSmart = async () => {
        if (!currentImage || !imageSize) return;
        setIsDetecting(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imageSize.width; canvas.height = imageSize.height;
            const ctx = canvas.getContext('2d');
            const img = new Image(); img.crossOrigin = 'Anonymous'; img.src = currentImage;
            await new Promise(res => img.onload = res);
            ctx?.drawImage(img, 0, 0);
            const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);

            if (imageData) {
                const newRegions = detectContentIslands(imageData.data, imageSize.width, imageSize.height, sensitivity, rows, cols, detectMode);
                setRegions(newRegions);
                logger.success(`识别完成: 找到 ${newRegions.length} 个区域`);
            }
        } catch (err: any) { logger.error('识别失败: ' + err.message); } finally { setIsDetecting(false); }
    };

    const handleSlice = async () => {
        if (!currentImage || isProcessing || regions.length === 0) return;
        setIsProcessing(true); setSlices([]);
        try {
            const img = new Image(); img.crossOrigin = 'Anonymous';
            img.onload = async () => {
                const results: SliceResult[] = [];
                for (let i = 0; i < regions.length; i++) {
                    const r = regions[i];
                    let x = Math.round(img.width * r.x / 100), y = Math.round(img.height * r.y / 100);
                    let w = Math.round(img.width * r.width / 100), h = Math.round(img.height * r.height / 100);
                    const mx = Math.round(w * margin / 100), my = Math.round(h * margin / 100);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, w - mx * 2); canvas.height = Math.max(1, h - my * 2);
                    canvas.getContext('2d')?.drawImage(img, x + mx, y + my, w - mx * 2, h - my * 2, 0, 0, canvas.width, canvas.height);
                    await new Promise<void>(res => canvas.toBlob(b => { if (b) results.push({ id: i, url: URL.createObjectURL(b), blob: b, width: canvas.width, height: canvas.height, ext: 'jpg' }); res(); }, 'image/jpeg', 0.95));
                }
                setSlices(results); logger.success(`切割完成: ${results.length} 张`);
            };
            img.src = currentImage;
        } catch (err: any) { logger.error('切割失败'); } finally { setIsProcessing(false); }
    };

    const downloadAllAsZip = async () => {
        setIsExporting(true);
        const zip = new JSZip();
        slices.forEach((s, i) => zip.file(`slice_${i + 1}.jpg`, s.blob));
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `slices_${Date.now()}.zip`;
        link.click();
        setIsExporting(false);
    };

    const colors = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

    return (
        <div className="space-y-4 select-none">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        onUpdate(node.id, { image: ev.target?.result as string, sourceNodeId: null });
                        setSlices([]);
                        setRegions([]);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = ''; // 重置以允许重复上传
                }}
            />
            <div className="flex items-center justify-between px-1">
                <div className="flex flex-col">
                    <span className="text-slate-500 text-[8px] uppercase font-black tracking-widest">交互模式</span>
                    <span className="text-slate-300 text-[10px] font-bold">内容岛检测 (4.3 紧凑版)</span>
                </div>
                <div className="flex items-center gap-2">
                    {currentImage && (
                        <>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="text-[9px] text-amber-500 hover:text-amber-400 font-bold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 transition-colors"
                            >
                                更换图片
                            </button>
                            <button
                                onClick={() => {
                                    onUpdate(node.id, { image: null, sourceNodeId: null, regions: [], slices: [] });
                                    setRegions([]);
                                    setSlices([]);
                                }}
                                className="text-[9px] text-red-400 hover:text-red-300 font-bold px-2 py-1 rounded bg-red-400/10 border border-red-400/20 transition-colors"
                            >
                                移除图片
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => {
                            setRegions([]);
                            setSlices([]);
                            onUpdate(node.id, { regions: [], slices: [] });
                        }}
                        className="text-[9px] text-slate-400 hover:text-slate-300 font-bold"
                    >
                        清空选区
                    </button>
                </div>
            </div>

            {currentImage ? (
                <div className="space-y-2">
                    <div
                        ref={containerRef}
                        className="relative rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900 cursor-crosshair touch-none"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        <img src={currentImage} alt="Slicer" className="w-full h-auto pointer-events-none" draggable={false} />

                        {regions.map((r, i) => (
                            <div
                                key={r.id}
                                className={`absolute border-2 transition-shadow ${activeRegionId === r.id ? 'shadow-[0_0_10px_rgba(255,255,255,0.5)] z-10' : 'z-0'}`}
                                style={{
                                    left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%`,
                                    borderColor: colors[i % colors.length],
                                    backgroundColor: activeRegionId === r.id ? `${colors[i % colors.length]}11` : 'transparent'
                                }}
                            >
                                <div className="absolute -top-4 left-0 text-[8px] text-white font-bold px-1 rounded" style={{ backgroundColor: colors[i % colors.length] }}>#{i + 1}</div>
                                <div className="absolute -right-1 -bottom-1 w-2 h-2 bg-white border border-slate-900 rounded-full cursor-nwse-resize pointer-events-auto" />
                                <div className="absolute -left-1 -top-1 w-2 h-2 bg-white border border-slate-900 rounded-full cursor-nwse-resize pointer-events-auto" />
                            </div>
                        ))}

                        {(isProcessing || isDetecting) && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-white text-[10px] font-bold tracking-widest uppercase">{isDetecting ? 'Analyzing...' : 'Slicing...'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center cursor-pointer hover:border-amber-500/50 transition-all group">
                    <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🖼️</div>
                    <div className="text-slate-400 text-xs font-bold">点击上传详情页</div>
                </div>
            )}

            {currentImage && (
                <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-700/50 space-y-4 shadow-xl">
                    <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                        <button
                            onClick={() => setDetectMode('tight')}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${detectMode === 'tight' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            🎯 紧凑模式 (按内容画框)
                        </button>
                        <button
                            onClick={() => setDetectMode('grid')}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${detectMode === 'grid' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            📏 网格模式 (按比例切分)
                        </button>
                    </div>

                    {detectMode === 'grid' && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[8px] text-slate-500 uppercase font-black">行数</span>
                                <input type="number" value={rows} onChange={e => setRows(parseInt(e.target.value))} className="w-10 bg-slate-800 text-white text-[10px] text-center rounded border border-slate-700" />
                            </div>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[8px] text-slate-500 uppercase font-black">列数</span>
                                <input type="number" value={cols} onChange={e => setCols(parseInt(e.target.value))} className="w-10 bg-slate-800 text-white text-[10px] text-center rounded border border-slate-700" />
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-[8px] uppercase font-black tracking-widest">识别灵敏度 (Sensitivity)</span>
                            <span className="text-amber-500 text-[10px] font-bold font-mono">{sensitivity}</span>
                        </div>
                        <input type="range" min="5" max="100" value={sensitivity} onChange={e => setSensitivity(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-amber-500" />
                    </div>

                    <button onClick={detectSmart} disabled={isDetecting} className="w-full py-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white text-[11px] font-black tracking-widest uppercase hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/20 transition-all">
                        🚀 一键识别画面 (4.3)
                    </button>

                    <div className="h-px bg-slate-800" />

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-[8px] uppercase font-black tracking-widest">边距修剪 (Margin)</span>
                            <span className="text-amber-500 text-[10px] font-bold font-mono">{margin}%</span>
                        </div>
                        <input type="range" min="0" max="10" value={margin} onChange={e => setMargin(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-amber-500" />
                    </div>

                    <button
                        onClick={handleSlice}
                        disabled={isProcessing || regions.length === 0}
                        className={`w-full py-4 rounded-2xl text-[12px] font-black tracking-widest uppercase transition-all ${isProcessing || regions.length === 0
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-orange-500/20'
                            }`}
                    >
                        {isProcessing ? 'Processing...' : `Execute Slicing (${regions.length})`}
                    </button>
                </div>
            )}

            {slices.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-slate-500 text-[8px] uppercase font-black tracking-widest">Results</span>
                        <button onClick={downloadAllAsZip} disabled={isExporting} className="text-[10px] text-amber-500 font-bold hover:underline">Download All (ZIP)</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1 scrollbar-hide">
                        {slices.map((s, i) => (
                            <div key={i} className="group relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900 cursor-pointer hover:border-amber-500 transition-all shadow-lg">
                                <img src={s.url} alt={`Slice ${i}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold" style={{ backgroundColor: colors[i % colors.length] }}>{i + 1}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
