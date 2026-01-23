import React, { useState, useRef, useEffect } from 'react';
import { logger } from '../services/loggerService';

interface ImageLightboxProps {
    src: string;
    onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, onClose }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // 阻止背景滚动
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, []);

    // 复制图片到剪贴板
    const handleCopyImage = async () => {
        try {
            let blob: Blob;

            if (src.startsWith('data:')) {
                // Base64 图片
                const response = await fetch(src);
                blob = await response.blob();
            } else {
                // URL 图片 - 需要先加载
                const response = await fetch(src);
                blob = await response.blob();
            }

            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            logger.success('图片已复制到剪贴板');
        } catch (err) {
            logger.error('复制失败: ' + (err as Error).message);
        }
    };

    // 下载图片
    const handleDownloadImage = async () => {
        try {
            let dataUrl = src;

            // 如果是 URL，先转换为 base64
            if (!src.startsWith('data:')) {
                const response = await fetch(src);
                const blob = await response.blob();
                dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }

            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `image_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            logger.success('图片下载已开始');
        } catch (err) {
            logger.error('下载失败: ' + (err as Error).message);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = -e.deltaY;
        const factor = Math.pow(1.1, delta / 200);
        const newScale = Math.min(Math.max(scale * factor, 0.5), 10);
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) { // 左键拖拽
            setIsDragging(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleDoubleClick = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    return (
        <div
            className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-md flex items-center justify-center overflow-hidden cursor-default"
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="absolute top-6 right-6 z-10 flex gap-3">
                {/* 复制按钮 */}
                <button
                    onClick={handleCopyImage}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-blue-500/20 text-white hover:text-blue-400 flex items-center justify-center transition-all border border-white/10"
                    title="复制图片"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                    </svg>
                </button>
                {/* 下载按钮 */}
                <button
                    onClick={handleDownloadImage}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-green-500/20 text-white hover:text-green-400 flex items-center justify-center transition-all border border-white/10"
                    title="下载图片"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                </button>
                {/* 缩放显示 */}
                <div className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest flex items-center">
                    {Math.round(scale * 100)}%
                </div>
                {/* 关闭按钮 */}
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 flex items-center justify-center transition-all border border-white/10"
                    title="关闭"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <div
                ref={containerRef}
                className={`relative transition-transform duration-75 ease-out ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                }}
                onMouseDown={handleMouseDown}
                onDoubleClick={handleDoubleClick}
            >
                <img
                    src={src}
                    alt="Lightbox"
                    className="max-w-[90vw] max-h-[90vh] object-contain shadow-2xl select-none pointer-events-none"
                    draggable={false}
                />
            </div>

            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-white/40 text-[9px] font-black uppercase tracking-[0.2em] pointer-events-none">
                滚轮缩放 · 左键拖拽 · 双击复位 · 点击外部关闭
            </div>
        </div>
    );
};
