
import React, { useState, useRef } from 'react';
import { AppNode, ApiConfig, ApiProvider } from '../types';
import { apiService } from '../services/ApiService';
import { logger } from '../services/loggerService';

interface BatchImageGenUIProps {
    node: AppNode;
    allNodes: AppNode[];
    onUpdate: (id: string, data: any) => void;
    apiConfig: ApiConfig;
    onImageClick: (src: string) => void;
    isPaused?: boolean;
    globalCategoryModel?: string;
}

export const BatchImageGenUI: React.FC<BatchImageGenUIProps> = ({
    node, allNodes, onUpdate, apiConfig, onImageClick, isPaused, globalCategoryModel
}) => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [currentPrompt, setCurrentPrompt] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const prompts = node.data.prompts || [];
    const quality = node.data.quality || '1k';
    const ratio = node.data.ratio || '16:9';
    const results = node.data.results || [];
    const images = node.data.images || [];

    const sourceNode = allNodes.find(n => n.id === node.data.sourceNodeId);
    const inheritedPrompts = sourceNode?.data.result || [];
    const finalPrompts = prompts.length > 0 ? prompts : (Array.isArray(inheritedPrompts) ? inheritedPrompts : []);

    const addPrompt = () => {
        if (!currentPrompt.trim()) return;
        const newPrompts = [...prompts, currentPrompt.trim()];
        onUpdate(node.id, { ...node.data, prompts: newPrompts });
        setCurrentPrompt('');
    };

    const removePrompt = (index: number) => {
        const newPrompts = prompts.filter((_: any, i: number) => i !== index);
        onUpdate(node.id, { ...node.data, prompts: newPrompts });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (prev) => {
                const base64 = prev.target?.result as string;
                const currentImages = node.data.images || [];
                onUpdate(node.id, { ...node.data, images: [...currentImages, base64] });
            };
            reader.readAsDataURL(file);
        });
    };

    const handleRunBatch = async () => {
        if (isPaused) {
            logger.warn('任务已暂停');
            return;
        }
        if (finalPrompts.length === 0) {
            logger.error('请至少输入一个提示词或连接意图解析节点');
            return;
        }

        setLoading(true);
        const providerId = apiConfig.defaultImageProviderId;
        const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];
        const model = node.data.modelOverride || globalCategoryModel;

        const newResults = [];
        for (let i = 0; i < finalPrompts.length; i++) {
            setStatus(`正在生成第 ${i + 1}/${finalPrompts.length} 张...`);
            try {
                const res = await apiService.generateImage(
                    finalPrompts[i],
                    { ratio, model },
                    provider,
                    images[0] // Use first image as reference if available
                );
                newResults.push(res);
            } catch (err: any) {
                logger.error(`生成失败 (${finalPrompts[i]}): ${err.message}`);
            }
        }

        onUpdate(node.id, { ...node.data, results: newResults });
        setLoading(false);
        setStatus('');
        logger.success(`批量生成完成，共 ${newResults.length} 张图片`);
    };

    return (
        <div className="space-y-4">
            {/* 数据来源 */}
            <div className="space-y-1.5">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">提示词来源</label>
                <select
                    value={node.data.sourceNodeId || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, sourceNodeId: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-blue-500/50"
                >
                    <option value="">手动输入</option>
                    {allNodes.filter(n => n.id !== node.id && n.data.result).map(n => (
                        <option key={n.id} value={n.id}>{n.titleZh} ({n.id.slice(0, 4)})</option>
                    ))}
                </select>
            </div>

            {/* 提示词输入 */}
            {!node.data.sourceNodeId && (
                <div className="space-y-2">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">提示词队列</label>
                    <div className="flex flex-wrap gap-2 p-2 bg-slate-950/50 rounded-xl border border-white/5 min-h-[60px]">
                        {prompts.map((p: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 px-2 py-1 rounded-lg group">
                                <span className="text-[10px] text-blue-300 max-w-[150px] truncate">{p}</span>
                                <button onClick={() => removePrompt(i)} className="text-blue-500 hover:text-red-400 transition-colors">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        ))}
                        <input
                            type="text"
                            value={currentPrompt}
                            onChange={(e) => setCurrentPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addPrompt()}
                            placeholder="输入提示词并回车..."
                            className="bg-transparent border-none outline-none text-[10px] text-slate-300 flex-1 min-w-[100px]"
                        />
                    </div>
                </div>
            )}

            {node.data.sourceNodeId && (
                <div className="space-y-2">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">继承自 {sourceNode?.titleZh}</label>
                    <div className="flex flex-wrap gap-2 p-2 bg-blue-500/5 rounded-xl border border-blue-500/20 min-h-[40px]">
                        {finalPrompts.map((p: string, i: number) => (
                            <div key={i} className="bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg">
                                <span className="text-[9px] text-blue-400/80">{p}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 参考图 */}
            <div className="space-y-2">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">参考图片</label>
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 transition-all bg-slate-900/30"
                >
                    {images.length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto w-full no-scrollbar">
                            {images.map((img: string, i: number) => (
                                <img key={i} src={img} className="w-16 h-16 object-cover rounded-lg border border-white/10" />
                            ))}
                        </div>
                    ) : (
                        <span className="text-[9px] text-slate-500 font-bold uppercase">点击上传参考图</span>
                    )}
                    <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileChange} />
                </div>
            </div>

            {/* 配置项 */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">画质</label>
                    <select
                        value={quality}
                        onChange={(e) => onUpdate(node.id, { ...node.data, quality: e.target.value })}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-blue-500/50"
                    >
                        <option value="1k">1K (Standard)</option>
                        <option value="2k">2K (High)</option>
                        <option value="4k">4K (Ultra)</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">比例</label>
                    <select
                        value={ratio}
                        onChange={(e) => onUpdate(node.id, { ...node.data, ratio: e.target.value })}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-blue-500/50"
                    >
                        {['1:1', '3:4', '4:3', '9:16', '16:9'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
            </div>

            {/* 执行按钮 */}
            <button
                onClick={handleRunBatch}
                disabled={loading}
                className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg
          ${loading ? 'bg-slate-700 text-slate-500' : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:scale-[1.02]'}
        `}
            >
                {loading ? status : '开始批量生成'}
            </button>

            {/* 结果展示 */}
            {results.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-slate-800">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">生成结果 ({results.length})</label>
                    <div className="grid grid-cols-2 gap-2">
                        {results.map((res: string, i: number) => (
                            <div key={i} className="relative group aspect-video rounded-xl overflow-hidden bg-slate-950 ring-1 ring-white/10">
                                <img
                                    src={res}
                                    className="w-full h-full object-cover cursor-zoom-in hover:opacity-80 transition-opacity"
                                    onClick={() => onImageClick(res)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
