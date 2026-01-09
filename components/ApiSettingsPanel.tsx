
import React, { useState } from 'react';
import { ApiProvider, ApiConfig, ApiFormat } from '../types';

interface ApiSettingsPanelProps {
    config: ApiConfig;
    onUpdate: (config: ApiConfig) => void;
    onClose: () => void;
}

export const ApiSettingsPanel: React.FC<ApiSettingsPanelProps> = ({ config, onUpdate, onClose }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<ApiProvider>>({
        name: '',
        baseUrl: '',
        apiKey: '',
        format: 'openai',
        models: [],
        imageModels: []
    });

    const handleAdd = () => {
        setEditingId('new');
        setFormData({
            name: '',
            baseUrl: '',
            apiKey: '',
            format: 'openai',
            models: [],
            imageModels: []
        });
    };

    const handleEdit = (provider: ApiProvider) => {
        setEditingId(provider.id);
        setFormData({ ...provider });
    };

    const handleDelete = (id: string) => {
        const newProviders = config.providers.filter(p => p.id !== id);
        onUpdate({
            ...config,
            providers: newProviders,
            defaultProviderId: config.defaultProviderId === id ? null : config.defaultProviderId,
            defaultImageProviderId: config.defaultImageProviderId === id ? null : config.defaultImageProviderId
        });
    };

    const handleSave = () => {
        if (!formData.name || !formData.baseUrl || !formData.apiKey) {
            alert("请填写完整信息");
            return;
        }

        const provider: ApiProvider = {
            id: editingId === 'new' ? Math.random().toString(36).substr(2, 9) : editingId!,
            name: formData.name!,
            baseUrl: formData.baseUrl!,
            apiKey: formData.apiKey!,
            format: (formData.format as ApiFormat) || 'openai',
            models: typeof formData.models === 'string' ? (formData.models as string).split(',').map(m => m.trim()) : formData.models || [],
            imageModels: typeof formData.imageModels === 'string' ? (formData.imageModels as string).split(',').map(m => m.trim()) : formData.imageModels || [],
            isDefault: formData.isDefault
        };

        let newProviders;
        if (editingId === 'new') {
            newProviders = [...config.providers, provider];
        } else {
            newProviders = config.providers.map(p => p.id === editingId ? provider : p);
        }

        onUpdate({
            ...config,
            providers: newProviders,
            defaultProviderId: provider.isDefault ? provider.id : config.defaultProviderId
        });
        setEditingId(null);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-blue-600/10 to-purple-600/10">
                    <div>
                        <h2 className="text-white text-2xl font-black tracking-tight">API 提供商设置</h2>
                        <p className="text-slate-500 text-xs mt-1 font-medium">配置您的自定义 API 节点与密钥</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                    {editingId ? (
                        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">提供商名称</label>
                                    <input
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                        placeholder="例如: OpenRouter"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">API 格式</label>
                                    <select
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none appearance-none"
                                        value={formData.format}
                                        onChange={e => setFormData({ ...formData, format: e.target.value as ApiFormat })}
                                    >
                                        <option value="openai">OpenAI 兼容</option>
                                        <option value="stability">Stability AI</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">API 基础地址 (Base URL)</label>
                                <input
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                    placeholder="https://api.openai.com/v1"
                                    value={formData.baseUrl}
                                    onChange={e => setFormData({ ...formData, baseUrl: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">API 密钥 (Key)</label>
                                <input
                                    type="password"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                    placeholder="sk-..."
                                    value={formData.apiKey}
                                    onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">支持的模型 (逗号分隔)</label>
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none min-h-[80px]"
                                    placeholder="gpt-4o, claude-3-opus..."
                                    value={Array.isArray(formData.models) ? formData.models.join(', ') : formData.models}
                                    onChange={e => setFormData({ ...formData, models: e.target.value })}
                                />
                            </div>

                            <div className="flex items-center gap-2 px-1 pt-2">
                                <input
                                    type="checkbox"
                                    id="isDefault"
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500/50"
                                    checked={formData.isDefault}
                                    onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                                />
                                <label htmlFor="isDefault" className="text-slate-300 text-xs font-medium cursor-pointer">设为默认提供商</label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold text-sm transition-colors">保存配置</button>
                                <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-bold text-sm transition-colors">取消</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {config.providers.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-[24px]">
                                    <p className="text-slate-500 text-sm font-medium">暂无 API 提供商，请点击下方按钮添加</p>
                                </div>
                            ) : (
                                config.providers.map(p => (
                                    <div key={p.id} className="bg-slate-900/50 border border-white/5 p-5 rounded-2xl flex items-center justify-between group hover:border-blue-500/30 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${p.format === 'openai' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                                {p.format === 'openai' ? 'O' : 'S'}
                                            </div>
                                            <div>
                                                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                                                    {p.name}
                                                    {config.defaultProviderId === p.id && <span className="bg-blue-500/20 text-blue-400 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-tighter">默认</span>}
                                                </h3>
                                                <p className="text-slate-500 text-[10px] font-mono mt-0.5 truncate max-w-[200px]">{p.baseUrl}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => onUpdate({ ...config, defaultProviderId: p.id })}
                                                className={`p-2 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all border ${config.defaultProviderId === p.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                                                title="设为常规默认"
                                            >
                                                常规默认
                                            </button>
                                            <button
                                                onClick={() => onUpdate({ ...config, defaultImageProviderId: p.id })}
                                                className={`p-2 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all border ${config.defaultImageProviderId === p.id ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                                                title="设为图像默认"
                                            >
                                                图像默认
                                            </button>
                                            <button onClick={() => handleEdit(p)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-blue-400 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                            </button>
                                            <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                            <button
                                onClick={handleAdd}
                                className="w-full py-4 border-2 border-dashed border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-[24px] text-slate-500 hover:text-blue-400 font-bold text-sm transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                添加新提供商
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-8 bg-white/[0.02] border-t border-white/5 flex justify-end">
                    <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-xl font-bold text-sm transition-colors">完成</button>
                </div>
            </div>
        </div>
    );
};
