import React, { useState, useRef, useMemo } from 'react';
import { AppNode, ApiConfig } from '../types';
import { apiService } from '../services/ApiService';
import { logger } from '../services/loggerService';

interface SVGTextOverlayUIProps {
    node: AppNode;
    allNodes: AppNode[];
    onUpdate: (id: string, data: any) => void;
    apiConfig: ApiConfig;
    onImageClick: (src: string) => void;
    isPaused?: boolean;
    globalCategoryModel?: string;
}

export const SVGTextOverlayUI: React.FC<SVGTextOverlayUIProps> = ({
    node, allNodes, onUpdate, apiConfig, onImageClick, isPaused, globalCategoryModel
}) => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const referenceInputRef = useRef<HTMLInputElement>(null);
    const backgroundInputRef = useRef<HTMLInputElement>(null);

    // Node data
    const referenceImage = node.data.referenceImage || ''; // Image with text (for layout reference)
    const backgroundImage = node.data.backgroundImage || ''; // Clean image (no text)
    const textContent = node.data.textContent || ''; // Text content from prompt optimizer
    const svgCode = node.data.svgCode || '';
    const svgPreview = node.data.svgPreview || '';

    // Get inherited data from source node
    const sourceNode = useMemo(() => {
        return allNodes.find(n => n.id === node.data.sourceNodeId);
    }, [allNodes, node.data.sourceNodeId]);

    // Get text content from text source node (Prompt Optimizer result)
    const inheritedTextContent = useMemo(() => {
        if (!node.data.textSourceNodeId) return '';
        const findText = (nodeId: string | undefined, visited = new Set<string>()): string => {
            if (!nodeId || visited.has(nodeId)) return '';
            visited.add(nodeId);
            const n = allNodes.find(item => item.id === nodeId);
            if (!n) return '';
            // Check for result (prompt optimizer output)
            if (n.data.result && typeof n.data.result === 'string' && !n.data.result.startsWith('data:image')) {
                return n.data.result;
            }
            return findText(n.data.sourceNodeId, visited);
        };
        return findText(node.data.textSourceNodeId);
    }, [node.data.textSourceNodeId, allNodes]);

    // Get background image from image source node (Multi-Image Gen result)
    const inheritedBackgroundImage = useMemo(() => {
        if (!node.data.imageSourceNodeId) return '';
        const findImage = (nodeId: string | undefined, visited = new Set<string>()): string => {
            if (!nodeId || visited.has(nodeId)) return '';
            visited.add(nodeId);
            const n = allNodes.find(item => item.id === nodeId);
            if (!n) return '';
            if (n.data.result && typeof n.data.result === 'string' && n.data.result.startsWith('data:image')) {
                return n.data.result;
            }
            return findImage(n.data.sourceNodeId, visited);
        };
        return findImage(node.data.imageSourceNodeId);
    }, [node.data.imageSourceNodeId, allNodes]);

    const finalTextContent = textContent || inheritedTextContent;
    const finalBackgroundImage = backgroundImage || inheritedBackgroundImage;

    // Available source nodes for connection
    const availableSources = useMemo(() => {
        return allNodes.filter(n => n.id !== node.id);
    }, [allNodes, node.id]);

    // Handle file upload for reference image
    const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            onUpdate(node.id, { ...node.data, referenceImage: base64 });
        };
        reader.readAsDataURL(file);
    };

    // Handle file upload for background image
    const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            onUpdate(node.id, { ...node.data, backgroundImage: base64 });
        };
        reader.readAsDataURL(file);
    };

    // Generate SVG with AI
    const handleGenerateSVG = async () => {
        if (isPaused) {
            logger.warn('任务已暂停');
            return;
        }
        if (!referenceImage) {
            logger.error('请上传参考图（有文字的图片）');
            return;
        }
        if (!finalBackgroundImage) {
            logger.error('请上传或连接背景图（无文字的图片）');
            return;
        }

        setLoading(true);
        setStatus('分析参考图排版...');

        try {
            const providerId = apiConfig.defaultProviderId;
            const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];

            if (!provider) {
                throw new Error('请先配置 API 提供商');
            }

            // Fetch the prompt template from backend
            const template = await apiService.getPromptTemplate('SVG_TEXT_OVERLAY');
            if (!template) {
                throw new Error('无法从服务器获取提示词模板');
            }

            const textContentPart = finalTextContent ? `用户提供的文案内容（请使用这些文案替换图片中识别的文字）：\n${finalTextContent}` : '';
            const prompt = template.replace('{textContent_part}', textContentPart);

            setStatus('调用 AI 生成 SVG...');

            // Call API with both images
            const response = await apiService.chatPro(
                prompt,
                globalCategoryModel || 'gemini-3-flash-preview',
                provider,
                [referenceImage, finalBackgroundImage]
            );

            if (!response) {
                throw new Error('AI 未返回有效内容');
            }

            // Extract SVG code from response
            let extractedSvg = response;
            const svgMatch = response.match(/<svg[\s\S]*<\/svg>/i);
            if (svgMatch) {
                extractedSvg = svgMatch[0];
            }

            // Replace placeholder with actual background image
            const finalSvg = extractedSvg.replace(
                'BACKGROUND_IMAGE_PLACEHOLDER',
                finalBackgroundImage
            );

            // Create preview by converting SVG to data URL
            const svgBlob = new Blob([finalSvg], { type: 'image/svg+xml' });
            const svgUrl = URL.createObjectURL(svgBlob);

            onUpdate(node.id, {
                ...node.data,
                svgCode: finalSvg,
                svgPreview: svgUrl,
                result: finalSvg
            });

            logger.success('SVG 生成完成');
        } catch (err: any) {
            logger.error(`生成失败: ${err.message}`);
        } finally {
            setLoading(false);
            setStatus('');
        }
    };

    // Export SVG as PNG
    const handleExportPNG = async () => {
        if (!svgCode) {
            logger.error('请先生成 SVG');
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1080;
            canvas.height = 1920;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas');

            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                const pngUrl = canvas.toDataURL('image/png');

                // Download the PNG
                const link = document.createElement('a');
                link.download = 'svg_text_overlay.png';
                link.href = pngUrl;
                link.click();

                logger.success('PNG 导出成功');
            };

            const svgBlob = new Blob([svgCode], { type: 'image/svg+xml' });
            img.src = URL.createObjectURL(svgBlob);
        } catch (err: any) {
            logger.error(`导出失败: ${err.message}`);
        }
    };

    // Copy SVG code
    const handleCopySVG = () => {
        if (!svgCode) {
            logger.error('请先生成 SVG');
            return;
        }
        navigator.clipboard.writeText(svgCode);
        logger.success('SVG 代码已复制到剪贴板');
    };

    return (
        <div className="p-3 space-y-3 text-sm">
            {/* Text Source Node Selector */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs">📝 文案来源</span>
                </div>
                <select
                    value={node.data.textSourceNodeId || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, textSourceNodeId: e.target.value || undefined })}
                    className="w-full bg-slate-800 border border-cyan-700 rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">无连接 / 自动识别</option>
                    {availableSources.map(n => (
                        <option key={n.id} value={n.id}>
                            {n.titleZh || n.title}
                        </option>
                    ))}
                </select>
                {inheritedTextContent && (
                    <div className="mt-1 text-xs text-cyan-400">
                        ✓ 已获取文案内容
                    </div>
                )}
            </div>

            {/* Image Source Node Selector */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs">🖼️ 背景图来源</span>
                </div>
                <select
                    value={node.data.imageSourceNodeId || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, imageSourceNodeId: e.target.value || undefined })}
                    className="w-full bg-slate-800 border border-green-700 rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">无连接 / 手动上传</option>
                    {availableSources.map(n => (
                        <option key={n.id} value={n.id}>
                            {n.titleZh || n.title}
                        </option>
                    ))}
                </select>
                {inheritedBackgroundImage && (
                    <div className="mt-1 text-xs text-green-400">
                        ✓ 已获取背景图
                    </div>
                )}
            </div>

            {/* Reference Image Upload */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs">参考图（有文字）</span>
                    {referenceImage && (
                        <button
                            onClick={() => onUpdate(node.id, { ...node.data, referenceImage: '' })}
                            className="text-red-400 text-xs hover:text-red-300"
                        >
                            清除
                        </button>
                    )}
                </div>
                <input
                    ref={referenceInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceUpload}
                    className="hidden"
                />
                {referenceImage ? (
                    <img
                        src={referenceImage}
                        alt="Reference"
                        className="w-full h-32 object-contain bg-slate-800 rounded-lg cursor-pointer"
                        onClick={() => onImageClick(referenceImage)}
                    />
                ) : (
                    <button
                        onClick={() => referenceInputRef.current?.click()}
                        className="w-full h-24 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-cyan-500 hover:text-cyan-400 transition-all"
                    >
                        <span className="text-2xl mb-1">📄</span>
                        <span className="text-xs">上传参考图（分析排版）</span>
                    </button>
                )}
            </div>

            {/* Background Image Upload */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs">背景图（无文字）</span>
                    {backgroundImage && !inheritedBackgroundImage && (
                        <button
                            onClick={() => onUpdate(node.id, { ...node.data, backgroundImage: '' })}
                            className="text-red-400 text-xs hover:text-red-300"
                        >
                            清除
                        </button>
                    )}
                </div>
                <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundUpload}
                    className="hidden"
                />
                {finalBackgroundImage ? (
                    <img
                        src={finalBackgroundImage}
                        alt="Background"
                        className="w-full h-32 object-contain bg-slate-800 rounded-lg cursor-pointer"
                        onClick={() => onImageClick(finalBackgroundImage)}
                    />
                ) : (
                    <button
                        onClick={() => backgroundInputRef.current?.click()}
                        className="w-full h-24 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-green-500 hover:text-green-400 transition-all"
                    >
                        <span className="text-2xl mb-1">🖼️</span>
                        <span className="text-xs">上传背景图 或 连接上游</span>
                    </button>
                )}
            </div>

            {/* Text Content Override */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs">自定义文案（可选）</span>
                </div>
                <textarea
                    value={textContent}
                    onChange={(e) => onUpdate(node.id, { ...node.data, textContent: e.target.value })}
                    placeholder={inheritedTextContent ? '使用上游文案...' : '留空则自动识别参考图文字...'}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                />
            </div>

            {/* Generate Button */}
            <button
                onClick={handleGenerateSVG}
                disabled={loading || isPaused || !referenceImage || !finalBackgroundImage}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${loading || isPaused || !referenceImage || !finalBackgroundImage
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg'
                    }`}
            >
                {loading ? status : '🎨 生成 SVG'}
            </button>

            {/* SVG Preview */}
            {svgCode && (
                <div className="space-y-2">
                    <div className="text-slate-400 text-xs">输出预览</div>
                    <div
                        className="bg-slate-800 rounded-lg overflow-hidden cursor-pointer"
                        onClick={() => svgPreview && onImageClick(svgPreview)}
                        dangerouslySetInnerHTML={{ __html: svgCode }}
                        style={{ maxHeight: '300px', overflow: 'auto' }}
                    />

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleCopySVG}
                            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs"
                        >
                            📋 复制 SVG
                        </button>
                        <button
                            onClick={handleExportPNG}
                            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs"
                        >
                            💾 导出 PNG
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
