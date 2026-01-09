import React, { useState, useRef, useEffect } from 'react';

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
            <div className="absolute top-6 right-6 z-10 flex gap-4">
                <div className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest">
                    {Math.round(scale * 100)}%
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 flex items-center justify-center transition-all border border-white/10"
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
                滚轮缩放 · 左键拖拽 · 双击复位
            </div>
        </div>
    );
};
