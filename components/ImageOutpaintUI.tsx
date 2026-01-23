
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AppNode } from '../types';

interface ImageOutpaintUIProps {
    node: AppNode;
    onUpdate: (id: string, data: any) => void;
    imageUrl?: string;
    activeModel?: string;
}

const RATIOS = [
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:4', value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
    { label: '9:16', value: 9 / 16 },
    { label: '21:9', value: 21 / 9 },
];

export const ImageOutpaintUI: React.FC<ImageOutpaintUIProps> = ({ node, onUpdate, imageUrl, activeModel }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Internal state from node data or defaults
    const {
        x: initialX = 0.5,
        y: initialY = 0.5,
        ratio = '1:1',
        scale: initialScale = 0.8,
        resolution = '2k',
        isLocked = false
    } = node.data.outpaint || {};

    const [localX, setLocalX] = useState(initialX);
    const [localY, setLocalY] = useState(initialY);
    const [localScale, setLocalScale] = useState(initialScale);

    // Sync local state when node data changes (e.g. from other nodes)
    useEffect(() => {
        setLocalX(initialX);
        setLocalY(initialY);
        setLocalScale(initialScale);
    }, [initialX, initialY, initialScale]);

    const currentRatio = useMemo(() => RATIOS.find(r => r.label === ratio)?.value || 1, [ratio]);

    const imageRatio = useMemo(() => {
        if (imgObj) return imgObj.width / imgObj.height;
        return 1;
    }, [imgObj]);

    const effectiveRatioValue = useMemo(() => {
        if (isLocked && imgObj) return imageRatio;
        return currentRatio;
    }, [isLocked, imgObj, imageRatio, currentRatio]);

    // Auto-sync resolution with model
    const autoResolution = useMemo(() => {
        if (activeModel?.toLowerCase().includes('4k')) return '4k';
        return '2k';
    }, [activeModel]);

    useEffect(() => {
        if (autoResolution !== resolution) {
            onUpdate(node.id, {
                ...node.data,
                outpaint: { ...node.data.outpaint, resolution: autoResolution }
            });
        }
    }, [autoResolution, resolution]);

    useEffect(() => {
        if (imageUrl) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => setImgObj(img);
            img.src = imageUrl;
        } else {
            setImgObj(null);
        }
    }, [imageUrl]);

    const handleWheel = (e: React.WheelEvent) => {
        if (!isFullscreen) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const nextScale = Math.max(0.1, Math.min(2.0, localScale + delta));
        setLocalScale(nextScale);

        // For wheel, we can debounce or just update after a short delay
        // But for now, let's just update global state to keep it simple but less frequent than mousemove
        onUpdate(node.id, {
            ...node.data,
            outpaint: { ...node.data.outpaint, scale: nextScale, imageRatio }
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current || !imgObj) return;
        const rect = containerRef.current.getBoundingClientRect();

        const startX = e.clientX;
        const startY = e.clientY;
        const startPosX = localX;
        const startPosY = localY;

        let lastX = startPosX;
        let lastY = startPosY;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = (moveEvent.clientX - startX) / rect.width;
            const dy = (moveEvent.clientY - startY) / rect.height;

            lastX = Math.max(-0.2, Math.min(1.2, startPosX + dx));
            lastY = Math.max(-0.2, Math.min(1.2, startPosY + dy));

            setLocalX(lastX);
            setLocalY(lastY);
        };

        const onMouseUp = () => {
            onUpdate(node.id, {
                ...node.data,
                outpaint: { ...node.data.outpaint, x: lastX, y: lastY, ratio, scale: localScale, resolution, isLocked, imageRatio }
            });
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const align = (dir: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
        let nextX = localX;
        let nextY = localY;

        // Calculate the image's height fraction relative to the canvas height
        // Image width (as fraction of canvas width) = localScale
        // Image height (as fraction of canvas height) = localScale * effectiveRatioValue / imageRatio
        const imageHeightFraction = localScale * effectiveRatioValue / imageRatio;

        // For "snap to edge":
        // Left: image center X = localScale / 2 (so left edge is at 0)
        // Right: image center X = 1 - localScale / 2 (so right edge is at 1)
        // Top: image center Y = imageHeightFraction / 2
        // Bottom: image center Y = 1 - imageHeightFraction / 2
        if (dir === 'left') nextX = localScale / 2;
        if (dir === 'right') nextX = 1 - localScale / 2;
        if (dir === 'top') nextY = imageHeightFraction / 2;
        if (dir === 'bottom') nextY = 1 - imageHeightFraction / 2;
        if (dir === 'center') { nextX = 0.5; nextY = 0.5; }

        onUpdate(node.id, {
            ...node.data,
            outpaint: { ...node.data.outpaint, x: nextX, y: nextY, ratio, scale: localScale, resolution, isLocked, imageRatio }
        });
    };

    const renderCanvas = (isLarge: boolean = false) => (
        <div
            ref={isLarge ? null : containerRef}
            className={`relative bg-slate-950 rounded-xl overflow-hidden border border-white/5 shadow-inner cursor-move ${isLarge ? 'w-full h-full' : 'w-full'}`}
            style={isLarge ? {} : { aspectRatio: `${effectiveRatioValue}` }}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
        >
            {/* AI Mask Visualization (Hatching Pattern for empty areas) */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #3b82f6 0, #3b82f6 1px, transparent 0, transparent 50%)',
                backgroundSize: '10px 10px'
            }} />

            {/* Grid Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
                backgroundSize: '20px 20px'
            }} />

            {imgObj ? (
                <div
                    className="absolute transition-transform duration-75 ease-out"
                    style={{
                        left: `${localX * 100}%`,
                        top: `${localY * 100}%`,
                        width: `${localScale * 100}%`,
                        height: 'auto',
                        transform: 'translate(-50%, -50%)',
                        boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1)'
                    }}
                >
                    <img src={imageUrl} alt="Preview" className="w-full h-auto block pointer-events-none" />
                    {/* Selection Border */}
                    <div className="absolute inset-0 border-2 border-blue-500/50 pointer-events-none" />
                </div>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2">
                    <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <span className="text-[10px] uppercase font-black tracking-widest">请先上传原图</span>
                </div>
            )}

            {/* Mask Overlay */}
            <div className="absolute inset-0 pointer-events-none border-4 border-blue-500/10" />
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Ratio Selector */}
            <div className="flex flex-wrap gap-2">
                {RATIOS.map(r => (
                    <button
                        key={r.label}
                        onClick={() => onUpdate(node.id, { ...node.data, outpaint: { ...node.data.outpaint, ratio: r.label, x: localX, y: localY, scale: localScale, resolution, isLocked, imageRatio } })}
                        className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all border ${ratio === r.label
                            ? 'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {/* Canvas Preview Container */}
            <div className="relative group">
                {renderCanvas()}

                {/* Fullscreen Button */}
                <button
                    onClick={() => setIsFullscreen(true)}
                    className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md border border-white/10"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path></svg>
                </button>
            </div>

            {/* Alignment Controls */}
            <div className="flex justify-between items-center bg-slate-900/50 p-2 rounded-xl border border-white/5">
                <div className="flex gap-1">
                    <button onClick={() => align('left')} className="p-1.5 hover:bg-white/5 rounded text-slate-400" title="靠左"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM2 2h2v20H2V2z" /></svg></button>
                    <button onClick={() => align('center')} className="p-1.5 hover:bg-white/5 rounded text-slate-400" title="居中"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11 19h2v-2h-2v2zm0-14h2V3h-2v2zm0 9h2v-2h-2v2zm-4 0h2v-2H7v2zm8 0h2v-2h-2v2zm-4-4h2V8h-2v2zm-4 0h2V8H7v2zm8 0h2V8h-2v2zM3 3v18h18V3H3zm16 16H5V5h14v14z" /></svg></button>
                    <button onClick={() => align('right')} className="p-1.5 hover:bg-white/5 rounded text-slate-400" title="靠右"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM20 2h2v20h-2V2z" /></svg></button>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => align('top')} className="p-1.5 hover:bg-white/5 rounded text-slate-400" title="靠上"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(90deg)' }}><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM2 2h2v20H2V2z" /></svg></button>
                    <button onClick={() => align('bottom')} className="p-1.5 hover:bg-white/5 rounded text-slate-400" title="靠下"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM2 2h2v20H2V2z" /></svg></button>
                </div>
            </div>

            {/* Prompt Input */}
            <div className="space-y-1.5">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">扩展内容描述 (可选)</label>
                <input
                    type="text"
                    placeholder="例如：延伸的沙滩，更多的办公用品..."
                    className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2 text-[10px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    value={node.data.outpaint?.prompt || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, outpaint: { ...node.data.outpaint, prompt: e.target.value, x: localX, y: localY, scale: localScale, resolution, isLocked, imageRatio } })}
                />
            </div>

            {/* Fullscreen Modal */}
            {isFullscreen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl p-8">
                    <div className="relative w-full max-w-6xl h-[85vh] bg-slate-900 rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center text-teal-400">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path></svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">智能扩图编辑器</h3>
                                    <p className="text-sm text-slate-400">自由调整构图，AI 自动补全边界</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Auto-Resolution Indicator */}
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-xl border border-white/5">
                                    <div className={`w-2 h-2 rounded-full ${resolution === '4k' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]'}`} />
                                    <span className="text-xs font-black text-slate-300 uppercase tracking-widest">
                                        {resolution.toUpperCase()} 输出
                                    </span>
                                </div>

                                <button
                                    onClick={() => setIsFullscreen(false)}
                                    className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left: Canvas */}
                            <div className="flex-1 p-8 flex items-center justify-center bg-black/20 overflow-hidden">
                                <div
                                    ref={containerRef}
                                    className="relative shadow-2xl bg-slate-950 rounded-xl overflow-hidden border border-white/5 cursor-move"
                                    style={{
                                        aspectRatio: `${effectiveRatioValue}`,
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        width: effectiveRatioValue > 1 ? '100%' : 'auto',
                                        height: effectiveRatioValue > 1 ? 'auto' : '100%',
                                    }}
                                    onMouseDown={handleMouseDown}
                                    onWheel={handleWheel}
                                >
                                    {/* AI Mask Visualization (Hatching Pattern for empty areas) */}
                                    <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                                        backgroundImage: 'repeating-linear-gradient(45deg, #3b82f6 0, #3b82f6 1px, transparent 0, transparent 50%)',
                                        backgroundSize: '10px 10px'
                                    }} />

                                    {/* Grid Background */}
                                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                                        backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
                                        backgroundSize: '20px 20px'
                                    }} />

                                    {imgObj ? (
                                        <div
                                            className="absolute transition-transform duration-75 ease-out"
                                            style={{
                                                left: `${localX * 100}%`,
                                                top: `${localY * 100}%`,
                                                width: `${localScale * 100}%`,
                                                height: 'auto',
                                                transform: 'translate(-50%, -50%)',
                                                boxShadow: '0 0 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)'
                                            }}
                                        >
                                            <img src={imageUrl} alt="Preview" className="w-full h-auto block pointer-events-none" />
                                            <div className="absolute inset-0 border-2 border-blue-500/50 pointer-events-none" />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2">
                                            <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                            <span className="text-[10px] uppercase font-black tracking-widest">请先上传原图</span>
                                        </div>
                                    )}

                                    {/* Mask Overlay */}
                                    <div className="absolute inset-0 pointer-events-none border-4 border-blue-500/10" />
                                </div>
                            </div>

                            {/* Right: Controls */}
                            <div className="w-80 border-l border-white/5 p-6 space-y-8 overflow-y-auto bg-slate-900/50">
                                {/* Ratio Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">目标比例</label>
                                        {isLocked && (
                                            <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                                已锁定原图比例
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {RATIOS.map(r => (
                                            <button
                                                key={r.label}
                                                disabled={isLocked}
                                                onClick={() => onUpdate(node.id, { ...node.data, outpaint: { ...node.data.outpaint, ratio: r.label, x: localX, y: localY, scale: localScale, resolution, isLocked, imageRatio } })}
                                                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${ratio === r.label && !isLocked
                                                    ? 'bg-blue-500 border-blue-400 text-white'
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                                                    } ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Alignment Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">快速对齐</label>
                                        <button
                                            onClick={() => onUpdate(node.id, { ...node.data, outpaint: { ...node.data.outpaint, isLocked: !isLocked, imageRatio } })}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all border ${isLocked ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-white/5 text-slate-500 hover:text-slate-300'}`}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                            <span className="text-[9px] font-bold">{isLocked ? '解锁比例' : '锁定原图比例'}</span>
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => align('left')} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM2 2h2v20H2V2z" /></svg></button>
                                        <button onClick={() => align('center')} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 19h2v-2h-2v2zm0-14h2V3h-2v2zm0 9h2v-2h-2v2zm-4 0h2v-2H7v2zm8 0h2v-2h-2v2zm-4-4h2V8h-2v2zm-4 0h2V8H7v2zm8 0h2V8h-2v2zM3 3v18h18V3H3zm16 16H5V5h14v14z" /></svg></button>
                                        <button onClick={() => align('right')} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM20 2h2v20h-2V2z" /></svg></button>
                                        <button onClick={() => align('top')} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(90deg)' }}><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM2 2h2v20H2V2z" /></svg></button>
                                        <div className="flex items-center justify-center text-[10px] font-black text-slate-700 uppercase tracking-tighter">Snap</div>
                                        <button onClick={() => align('bottom')} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}><path d="M4 19h16v2H4v-2zm0-14h16v2H4V5zm0 4.5h16v5H4v-5zM2 2h2v20H2V2z" /></svg></button>
                                    </div>
                                </div>

                                {/* Prompt Section */}
                                <div className="space-y-4">
                                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">扩展内容描述</label>
                                    <textarea
                                        rows={4}
                                        placeholder="例如：延伸的沙滩，更多的办公用品..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                        value={node.data.outpaint?.prompt || ''}
                                        onChange={(e) => onUpdate(node.id, { ...node.data, outpaint: { ...node.data.outpaint, prompt: e.target.value, x: localX, y: localY, scale: localScale, resolution, isLocked, imageRatio } })}
                                    />
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={() => setIsFullscreen(false)}
                                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                                    >
                                        确认并返回
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
