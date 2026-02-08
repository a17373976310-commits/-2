
import React, { useState } from 'react';
import { ApiProvider, ApiConfig, ApiFormat } from '../types';

interface ApiSettingsPanelProps {
    config: ApiConfig;
    onUpdate: (config: ApiConfig) => void;
    onClose: () => void;
}

// 解析模型输入为数组
const parseModelsInput = (input: string | string[] | undefined): string[] => {
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') return input.split(',').map(m => m.trim()).filter(Boolean);
    return [];
};

// 验证 API Key 格式
const validateApiKey = (apiKey: string): { valid: boolean; message?: string } => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
        return { valid: false, message: 'API Key 不能为空' };
    }
    // 检查常见的 API Key 前缀（不同服务商有不同的前缀）
    const validPrefixes = ['sk-', 'sk-proj-', 'sk-ant-', 'sk-or-', 'hf_'];
    const hasValidPrefix = validPrefixes.some(prefix => trimmedKey.toLowerCase().startsWith(prefix));
    if (!hasValidPrefix && trimmedKey.length < 10) {
        return { valid: false, message: 'API Key 格式不正确，应以 sk- 等有效前缀开头' };
    }
    return { valid: true };
};

// 验证 URL 格式并自动补全 /v1
const validateAndNormalizeUrl = (url: string, format: ApiFormat): { valid: boolean; normalizedUrl?: string; message?: string } => {
    let baseUrl = url.trim();
    
    // 自动补全协议头
    if (!baseUrl.match(/^https?:\/\//i)) {
        baseUrl = 'https://' + baseUrl;
    }
    
    try {
        const urlObj = new URL(baseUrl);
        // 确保是 http 或 https 协议
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            return { valid: false, message: 'URL 协议必须是 http 或 https' };
        }
    } catch {
        return { valid: false, message: 'API 基础地址格式不正确，请输入有效的 URL（如：https://api.openai.com/v1）' };
    }
    
    // 自动补全 /v1 结尾（如果不是 stability 格式且不以 /v1 结尾）
    if (format !== 'stability' && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/v1/')) {
        // 移除末尾的斜杠，然后添加 /v1
        baseUrl = baseUrl.replace(/\/+$/, '') + '/v1';
    }
    
    return { valid: true, normalizedUrl: baseUrl };
};

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
        // 基础非空验证
        if (!formData.name || !formData.baseUrl || !formData.apiKey) {
            alert("请填写完整信息");
            return;
        }

        const trimmedName = formData.name.trim();
        
        // 名称去重检查
        const existingProvider = config.providers.find(
            p => p.name.toLowerCase() === trimmedName.toLowerCase() && p.id !== editingId && editingId !== 'new'
        );
        if (existingProvider && editingId === 'new') {
            alert(`已存在名称为 "${trimmedName}" 的提供商，请使用其他名称`);
            return;
        }

        // API Key 格式验证
        const apiKeyValidation = validateApiKey(formData.apiKey);
        if (!apiKeyValidation.valid) {
            alert(apiKeyValidation.message);
            return;
        }

        // URL 格式验证和自动补全
        const urlValidation = validateAndNormalizeUrl(
            formData.baseUrl, 
            (formData.format as ApiFormat) || 'openai'
        );
        if (!urlValidation.valid) {
            alert(urlValidation.message);
            return;
        }

        const provider: ApiProvider = {
            id: editingId === 'new' ? Math.random().toString(36).substr(2, 9) : editingId!,
            name: trimmedName,
            baseUrl: urlValidation.normalizedUrl!,
            apiKey: formData.apiKey.trim(),
            format: (formData.format as ApiFormat) || 'openai',
            models: parseModelsInput(formData.models),
            imageModels: parseModelsInput(formData.imageModels),
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
        <div
            onWheel={(e) => e.stopPropagation()}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
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
                                <p className="text-slate-600 text-[10px] px-1">
                                    支持自动补全协议头 (https://) 和 /v1 路径（Stability 格式除外）
                                </p>
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
                                <p className="text-slate-600 text-[10px] px-1">
                                    常见的 API Key 前缀：sk-、sk-proj-、sk-ant-、sk-or-、hf_
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">支持的模型 (常规 - 逗号分隔)</label>
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none min-h-[60px]"
                                    placeholder="gpt-4o, claude-3-opus..."
                                    value={Array.isArray(formData.models) ? formData.models.join(', ') : formData.models}
                                    onChange={e => setFormData({ ...formData, models: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-slate-500 text-[10px] uppercase font-black tracking-widest px-1">图像模型 (逗号分隔)</label>
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none min-h-[60px]"
                                    placeholder="nano-banana-2, nano-banana-2-2k, nano-banana-2-4k..."
                                    value={Array.isArray(formData.imageModels) ? formData.imageModels.join(', ') : formData.imageModels}
                                    onChange={e => setFormData({ ...formData, imageModels: e.target.value })}
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
