import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppNode, ApiConfig } from '../types';
import { apiService } from '../services/ApiService';
import { logger } from '../services/loggerService';
import { historyService } from '../services/historyService';

// Annotation interface for visual point labeling
interface ImageAnnotation {
    x: number;      // Percentage (0-100)
    y: number;      // Percentage (0-100)
    label: string;
}

interface MultiImageGenUIProps {
    node: AppNode;
    allNodes: AppNode[];
    onUpdate: (id: string, data: any) => void;
    apiConfig: ApiConfig;
    onImageClick: (src: string) => void;
    isPaused?: boolean;
    globalCategoryModel?: string;
}

export const MultiImageGenUI: React.FC<MultiImageGenUIProps> = ({
    node, allNodes, onUpdate, apiConfig, onImageClick, isPaused, globalCategoryModel
}) => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isUploadAreaHovered, setIsUploadAreaHovered] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Annotation state
    const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);
    const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number, y: number } | null>(null);
    const [annotationInput, setAnnotationInput] = useState('');

    const localImages: string[] = node.data.images || [];
    const annotations: Record<number, ImageAnnotation[]> = node.data.annotations || {};
    const ratio = node.data.ratio || '1:1';
    const result = node.data.result;
    const MAX_IMAGES = 14;

    // Available source nodes
    const availableSources = useMemo(() => {
        return allNodes.filter(n => n.id !== node.id);
    }, [allNodes, node.id]);

    // Source node
    const sourceNode = useMemo(() => {
        return allNodes.find(n => n.id === node.data.sourceNodeId);
    }, [allNodes, node.data.sourceNodeId]);

    // Recursive helper to find inherited images
    const findInheritedImages = (nodeId: string | undefined, visited = new Set<string>()): string[] => {
        if (!nodeId || visited.has(nodeId)) return [];
        visited.add(nodeId);
        const n = allNodes.find(item => item.id === nodeId);
        if (!n) return [];

        const nodeImages = n.data.images || (n.data.image ? [n.data.image] : []);
        if (nodeImages.length > 0) return nodeImages;

        return findInheritedImages(n.data.sourceNodeId, visited);
    };

    // Recursive helper to find inherited prompt
    const findInheritedPrompt = (nodeId: string | undefined, visited = new Set<string>()): string => {
        if (!nodeId || visited.has(nodeId)) return '';
        visited.add(nodeId);
        const n = allNodes.find(item => item.id === nodeId);
        if (!n) return '';

        // Check result first (for optimized prompts), then prompt
        const nodePrompt = n.data.result || n.data.prompt || '';
        if (nodePrompt) return nodePrompt;

        return findInheritedPrompt(n.data.sourceNodeId, visited);
    };

    // Get inherited images from source node chain
    const inheritedImages = useMemo(() => {
        if (localImages.length > 0) return [];
        return findInheritedImages(node.data.sourceNodeId);
    }, [localImages, node.data.sourceNodeId, allNodes]);

    // Get inherited prompt
    const inheritedPrompt = useMemo(() => {
        return findInheritedPrompt(node.data.sourceNodeId);
    }, [node.data.sourceNodeId, allNodes]);

    const finalPrompt = node.data.prompt || inheritedPrompt;
    const isPromptInherited = !node.data.prompt && !!inheritedPrompt;

    // Combine local and inherited images (local takes priority, but both can coexist for multi-image)
    const allImages = useMemo(() => {
        const combined = [...localImages];
        // Add inherited images that aren't already in local
        inheritedImages.forEach(img => {
            if (!combined.includes(img) && combined.length < MAX_IMAGES) {
                combined.push(img);
            }
        });
        return combined;
    }, [localImages, inheritedImages]);

    const hasInheritedImages = inheritedImages.length > 0 && localImages.length === 0;

    // Paste image from clipboard
    const handlePasteImage = async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const base64 = e.target?.result as string;
                            const currentImages = node.data.images || [];
                            if (currentImages.length < MAX_IMAGES) {
                                onUpdate(node.id, { ...node.data, images: [...currentImages, base64] });
                                logger.success('图片已粘贴');
                            } else {
                                logger.warn(`已达到最大图片数量 (${MAX_IMAGES})`);
                            }
                        };
                        reader.readAsDataURL(blob);
                        return;
                    }
                }
            }
            logger.warn('剪贴板中没有图片');
        } catch (err) {
            logger.error('粘贴失败: ' + (err as Error).message);
        }
    };

    // Keyboard shortcut for paste
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && isUploadAreaHovered) {
                e.preventDefault();
                handlePasteImage();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isUploadAreaHovered, node.data.images]);

    // Handle file upload
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const remaining = MAX_IMAGES - localImages.length;
        const filesToProcess = Array.from(files).slice(0, remaining);

        filesToProcess.forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target?.result as string;
                const currentImages = node.data.images || [];
                if (currentImages.length < MAX_IMAGES) {
                    onUpdate(node.id, { ...node.data, images: [...currentImages, base64] });
                }
            };
            reader.readAsDataURL(file);
        });
    };

    // Drag and drop handlers
    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const newImages = [...allImages];
        const [draggedItem] = newImages.splice(draggedIndex, 1);
        newImages.splice(dropIndex, 0, draggedItem);

        onUpdate(node.id, { ...node.data, images: newImages });
        setDraggedIndex(null);
        setDragOverIndex(null);
        logger.info(`图片顺序已调整: #${draggedIndex + 1} → #${dropIndex + 1}`);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const removeImage = (index: number) => {
        const newImages = allImages.filter((_, i) => i !== index);
        onUpdate(node.id, { ...node.data, images: newImages });
    };

    // Import inherited images to local
    const importInheritedImages = () => {
        if (inheritedImages.length > 0) {
            const combined = [...localImages, ...inheritedImages].slice(0, MAX_IMAGES);
            onUpdate(node.id, { ...node.data, images: combined });
            logger.success(`已导入 ${inheritedImages.length} 张继承图片`);
        }
    };

    // Annotation handlers
    const handleImageClickForAnnotation = (e: React.MouseEvent<HTMLImageElement>, idx: number) => {
        e.stopPropagation();
        setAnnotatingImageIndex(idx);
    };

    const handleAnnotationClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setPendingAnnotation({ x, y });
        setAnnotationInput('');
    };

    const confirmAnnotation = () => {
        if (!pendingAnnotation || !annotationInput.trim() || annotatingImageIndex === null) return;
        const newAnnotation: ImageAnnotation = {
            x: pendingAnnotation.x,
            y: pendingAnnotation.y,
            label: annotationInput.trim()
        };
        const currentAnnotations = annotations[annotatingImageIndex] || [];
        const updatedAnnotations = {
            ...annotations,
            [annotatingImageIndex]: [...currentAnnotations, newAnnotation]
        };
        onUpdate(node.id, { ...node.data, annotations: updatedAnnotations });
        setPendingAnnotation(null);
        setAnnotationInput('');
        logger.success(`标注已添加: "${newAnnotation.label}"`);
    };

    const removeAnnotation = (imgIndex: number, annIndex: number) => {
        const currentAnnotations = annotations[imgIndex] || [];
        const updatedAnnotations = {
            ...annotations,
            [imgIndex]: currentAnnotations.filter((_, i) => i !== annIndex)
        };
        onUpdate(node.id, { ...node.data, annotations: updatedAnnotations });
    };

    const closeAnnotationModal = () => {
        setAnnotatingImageIndex(null);
        setPendingAnnotation(null);
        setAnnotationInput('');
    };

    // Generate enhanced prompt from annotations
    const generateAnnotationPrompt = (): string => {
        const lines: string[] = [];
        Object.entries(annotations).forEach(([imgIdxStr, anns]) => {
            const imgIdx = parseInt(imgIdxStr);
            (anns as ImageAnnotation[]).forEach((ann) => {
                lines.push(`- 参考图 #${imgIdx + 1} 的 (${Math.round(ann.x)}%, ${Math.round(ann.y)}%) 位置: "${ann.label}"`);
            });
        });
        if (lines.length === 0) return '';
        return `\n[\u89c6\u89c9\u6807\u6ce8]\n${lines.join('\n')}\n请在生成图中保留上述标注的特征。`;
    };

    const handleGenerate = async () => {
        if (isPaused) {
            logger.warn('任务已暂停');
            return;
        }
        if (allImages.length === 0) {
            logger.error('请至少上传一张参考图片');
            return;
        }

        setLoading(true);
        setStatus('正在生成...');

        try {
            const providerId = apiConfig.defaultImageProviderId;
            const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];
            const model = node.data.modelOverride || globalCategoryModel;

            if (!provider) {
                throw new Error('请先配置 API 提供商');
            }

            if (!finalPrompt) {
                throw new Error('提示词不能为空');
            }

            // Enhance prompt with annotations
            const annotationPrompt = generateAnnotationPrompt();
            const enhancedPrompt = finalPrompt + annotationPrompt;

            if (annotationPrompt) {
                logger.info(`已添加视觉标注增强提示词`);
            }

            // Extract labels for each image to pass to ApiService
            const labelsArray = allImages.map((_, i) =>
                (annotations[i] || []).map(ann => ann.label).join(', ')
            );

            // Call API with ordered images array and labels
            const generatedImage = await apiService.generateImage(
                enhancedPrompt,
                { ratio, model },
                provider,
                allImages, // Pass entire ordered array (local + inherited)
                labelsArray
            );

            // Save to history
            setStatus('保存历史记录...');
            await historyService.saveRecord({
                originalImage: allImages[0],
                generatedImage,
                originalPrompt: finalPrompt,
                optimizedPrompt: `使用了 ${allImages.length} 张有序参考图`,
                model: model || '',
                ratio,
                nodeType: node.type,
            });

            onUpdate(node.id, { ...node.data, result: generatedImage });
            logger.success(`多图生成完成，使用了 ${allImages.length} 张参考图`);
        } catch (err: any) {
            logger.error(`生成失败: ${err.message}`);
        } finally {
            setLoading(false);
            setStatus('');
        }
    };

    return (
        <div className="space-y-4">
            {/* Source Node Selector */}
            <div className="space-y-1.5">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 flex items-center gap-2">
                    接入数据源
                    {hasInheritedImages && <span className="text-blue-500 italic lowercase">(已继承 {inheritedImages.length} 张图片)</span>}
                </label>
                <select
                    className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-bold focus:outline-none focus:ring-1 focus:ring-violet-500/50 appearance-none cursor-pointer"
                    value={node.data.sourceNodeId || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, sourceNodeId: e.target.value })}
                >
                    <option value="">无 / 使用本地图片</option>
                    {availableSources.map(s => <option key={`${node.id}-src-${s.id}`} value={s.id}>{s.titleZh} ({s.id.substring(0, 4)})</option>)}
                </select>
                {hasInheritedImages && (
                    <button
                        onClick={importInheritedImages}
                        className="w-full text-[8px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-2 py-1.5 rounded-lg border border-blue-500/20 transition-all uppercase font-bold"
                    >
                        导入继承图片到本地 (可编辑顺序)
                    </button>
                )}
            </div>

            {/* Image Grid with Ordering */}
            <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest">
                        参考图片 ({allImages.length}/{MAX_IMAGES})
                    </label>
                    {allImages.length > 0 && (
                        <button
                            onClick={() => onUpdate(node.id, { ...node.data, images: [] })}
                            className="text-[7px] text-red-400 hover:text-red-300 font-bold uppercase"
                        >
                            清空本地图片
                        </button>
                    )}
                </div>

                <div className="text-[8px] text-slate-600 px-1 italic">
                    💡 拖拽图片可调整顺序，顺序会影响生成结果
                </div>


                <div
                    onClick={() => allImages.length < MAX_IMAGES && fileInputRef.current?.click()}
                    onMouseEnter={() => setIsUploadAreaHovered(true)}
                    onMouseLeave={() => setIsUploadAreaHovered(false)}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsUploadAreaHovered(true);
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsUploadAreaHovered(false);
                        const imageUrl = e.dataTransfer.getData('text/plain');
                        if (imageUrl && imageUrl.startsWith('data:image')) {
                            const currentImages = node.data.images || [];
                            if (currentImages.length < MAX_IMAGES) {
                                onUpdate(node.id, { ...node.data, images: [...currentImages, imageUrl] });
                                logger.success('图片已添加');
                            } else {
                                logger.warn(`已达到最大图片数量 (${MAX_IMAGES})`);
                            }
                        }
                    }}
                    className={`border-2 border-dashed rounded-2xl p-3 transition-all min-h-[140px] ${allImages.length < MAX_IMAGES
                        ? 'border-slate-700 hover:border-violet-500/50 cursor-pointer'
                        : 'border-slate-800 cursor-not-allowed opacity-60'
                        } ${isUploadAreaHovered ? 'ring-2 ring-emerald-500/30' : ''}`}
                >
                    {allImages.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2" onClick={(e) => e.stopPropagation()}>
                            {allImages.map((img, idx) => (
                                <div
                                    key={idx}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={(e) => handleDrop(e, idx)}
                                    onDragEnd={handleDragEnd}
                                    className={`relative group aspect-square rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all ${draggedIndex === idx ? 'opacity-50 scale-95' : ''
                                        } ${dragOverIndex === idx && draggedIndex !== idx ? 'ring-2 ring-violet-500 scale-105' : ''}`}
                                >
                                    {/* Order Badge */}
                                    <div className="absolute top-1 left-1 z-10 w-5 h-5 bg-violet-600 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-lg">
                                        {idx + 1}
                                    </div>

                                    <img
                                        src={img}
                                        alt={`Ref ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                        onClick={(e) => handleImageClickForAnnotation(e, idx)}
                                    />

                                    {/* Annotation Points on Thumbnail */}
                                    {(annotations[idx] || []).map((ann, annIdx) => (
                                        <div
                                            key={annIdx}
                                            className="absolute w-3 h-3 bg-yellow-400 border-2 border-white rounded-full shadow-lg z-10 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                            style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
                                            title={ann.label}
                                        />
                                    ))}                                    {/* Annotation Badge */}
                                    {(annotations[idx] || []).length > 0 && (
                                        <div className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 bg-yellow-500 text-black text-[7px] font-black rounded-full shadow-lg">
                                            {(annotations[idx] || []).length} 标注
                                        </div>
                                    )}

                                    {/* Annotation Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAnnotatingImageIndex(idx);
                                        }}
                                        className="absolute top-1 right-1 bg-yellow-500 text-black rounded-lg px-1.5 py-0.5 text-[7px] font-black opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-20 hover:bg-yellow-400"
                                    >
                                        🎯 标注
                                    </button>

                                    {/* Remove Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeImage(idx);
                                        }}
                                        className="absolute -bottom-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-20"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}

                            {/* Add More Button */}
                            {allImages.length < MAX_IMAGES && (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-square border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 hover:border-violet-500/50 hover:text-violet-400 transition-all cursor-pointer"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 gap-2">
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                            </div>
                            <span className="text-[9px] text-slate-500 font-bold uppercase">点击上传参考图 (最多14张)</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePasteImage();
                                }}
                                className="text-[8px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/30 transition-all uppercase font-bold"
                            >
                                粘贴图片 (Ctrl+V)
                            </button>
                        </div>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                />
            </div>

            {/* Prompt */}
            <div className="space-y-1.5">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1 flex items-center justify-between">
                    <span>生成提示词</span>
                    {isPromptInherited && <span className="text-blue-500 italic lowercase">已继承自上游</span>}
                </label>
                <textarea
                    className={`w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl p-4 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50 min-h-[100px] transition-all resize-none shadow-inner ${isPromptInherited ? 'opacity-70 italic' : ''}`}
                    placeholder={isPromptInherited ? inheritedPrompt : "描述你想生成的图像..."}
                    value={node.data.prompt || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, prompt: e.target.value })}
                />
                {isPromptInherited && (
                    <div className="px-1">
                        <button
                            onClick={() => onUpdate(node.id, { ...node.data, prompt: inheritedPrompt })}
                            className="text-[7px] text-blue-400 hover:text-blue-300 font-bold uppercase"
                        >
                            复制继承提示词到本地编辑
                        </button>
                    </div>
                )}
            </div>

            {/* Ratio */}
            <div className="space-y-1.5">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">比例</label>
                <select
                    value={ratio}
                    onChange={(e) => onUpdate(node.id, { ...node.data, ratio: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-bold focus:outline-none focus:ring-1 focus:ring-violet-500/50 appearance-none cursor-pointer"
                >
                    {['1:1', '3:4', '4:3', '9:16', '16:9', '5:4', '4:5', '2:3', '3:2', '21:9'].map(r => (
                        <option key={r} value={r}>{r}</option>
                    ))}
                </select>
            </div>

            {/* Generate Button */}
            <button
                onClick={handleGenerate}
                disabled={loading || allImages.length === 0}
                className={`relative w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all overflow-hidden shadow-lg hover:scale-[1.02] active:scale-[0.98] ${loading || allImages.length === 0
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white'
                    }`}
            >
                {loading ? '生成中...' : `使用 ${allImages.length} 张参考图生成`}
                {loading && status && (
                    <div className="absolute bottom-1 left-0 right-0 text-[7px] text-center opacity-60 animate-pulse">
                        {status}
                    </div>
                )}
            </button>

            {/* Annotation Modal */}
            {annotatingImageIndex !== null && allImages[annotatingImageIndex] && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={closeAnnotationModal}>
                    <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
                            <div className="text-white text-sm font-bold">
                                🎯 标注模式 - 参考图 #{annotatingImageIndex + 1}
                            </div>
                            <button onClick={closeAnnotationModal} className="text-white/70 hover:text-white p-2">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Image with annotations */}
                        <div className="relative cursor-crosshair" onClick={handleAnnotationClick}>
                            <img
                                src={allImages[annotatingImageIndex]}
                                alt="Annotating"
                                className="w-full h-auto max-h-[70vh] object-contain rounded-xl"
                            />
                            {/* Existing annotations */}
                            {(annotations[annotatingImageIndex] || []).map((ann, annIdx) => (
                                <div
                                    key={annIdx}
                                    className="absolute group"
                                    style={{ left: `${ann.x}%`, top: `${ann.y}%`, transform: 'translate(-50%, -50%)' }}
                                >
                                    <div className="w-4 h-4 bg-yellow-400 border-2 border-white rounded-full shadow-lg animate-pulse" />
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 bg-yellow-400 text-black text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap">
                                        {ann.label}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeAnnotation(annotatingImageIndex, annIdx); }}
                                            className="ml-2 text-red-600 hover:text-red-800 font-black"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {/* Pending annotation */}
                            {pendingAnnotation && (
                                <div
                                    className="absolute"
                                    style={{ left: `${pendingAnnotation.x}%`, top: `${pendingAnnotation.y}%`, transform: 'translate(-50%, -50%)' }}
                                >
                                    <div className="w-5 h-5 bg-blue-500 border-2 border-white rounded-full shadow-lg ring-4 ring-blue-500/30" />
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={annotationInput}
                                            onChange={(e) => setAnnotationInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') confirmAnnotation(); if (e.key === 'Escape') setPendingAnnotation(null); }}
                                            placeholder="输入标签..."
                                            className="bg-white text-black text-xs px-2 py-1 rounded-lg shadow-xl w-32 outline-none"
                                        />
                                        <button
                                            onClick={confirmAnnotation}
                                            className="bg-blue-500 text-white text-xs px-2 py-1 rounded-lg shadow-xl hover:bg-blue-400"
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={() => setPendingAnnotation(null)}
                                            className="bg-slate-600 text-white text-xs px-2 py-1 rounded-lg shadow-xl hover:bg-slate-500"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Instructions */}
                        <div className="text-center text-slate-400 text-[10px] mt-3">
                            👆 点击图片添加标注点 • 标注会自动增强提示词
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
