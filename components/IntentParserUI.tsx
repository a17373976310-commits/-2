
import React, { useState } from 'react';
import { AppNode, ApiConfig } from '../types';
import { apiService } from '../services/ApiService';
import { logger } from '../services/loggerService';

interface IntentParserUIProps {
    node: AppNode;
    onUpdate: (id: string, data: any) => void;
    apiConfig: ApiConfig;
    isPaused?: boolean;
    globalCategoryModel?: string;
}

export const IntentParserUI: React.FC<IntentParserUIProps> = ({
    node, onUpdate, apiConfig, isPaused, globalCategoryModel
}) => {
    const [loading, setLoading] = useState(false);
    const [input, setInput] = useState(node.data.input || '');

    const intents = node.data.result || []; // Array of strings

    const handleParse = async () => {
        if (isPaused) {
            logger.warn('任务已暂停');
            return;
        }
        if (!input.trim()) {
            logger.error('请输入创作意图');
            return;
        }

        setLoading(true);
        try {
            const providerId = apiConfig.defaultProviderId;
            const provider = apiConfig.providers.find(p => p.id === providerId) || apiConfig.providers[0];

            // Fetch the prompt template from backend
            const template = await apiService.getPromptTemplate('INTENT_PARSER');
            if (!template) {
                throw new Error('无法从服务器获取提示词模板');
            }

            const prompt = template.replace('{input}', input);

            const response = await apiService.chatPro(
                prompt,
                globalCategoryModel || 'gemini-3-flash-preview',
                provider,
                [],
                node.data.promptEngineering
            );

            // Try to parse JSON from response
            let parsedIntents = [];
            try {
                const jsonMatch = response.match(/\[.*\]/s);
                if (jsonMatch) {
                    parsedIntents = JSON.parse(jsonMatch[0]);
                } else {
                    parsedIntents = [response]; // Fallback
                }
            } catch (e) {
                parsedIntents = response.split('\n').filter(s => s.trim());
            }

            onUpdate(node.id, { input, result: parsedIntents });
            logger.success(`解析完成，提取出 ${parsedIntents.length} 个意图`);
        } catch (err: any) {
            logger.error('解析失败: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const removeIntent = (idx: number) => {
        const newIntents = intents.filter((_: any, i: number) => i !== idx);
        onUpdate(node.id, { result: newIntents });
    };

    return (
        <div className="space-y-4">
            {/* 输入区 */}
            <div className="space-y-2">
                <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">原始意图输入</label>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="例如：帮我做3张海报：一个极简主义的手机展示，一个赛博朋克风格的街道，一个温馨的家庭聚会..."
                    className="w-full h-32 bg-slate-950/50 border border-white/5 rounded-2xl p-4 text-[11px] text-slate-300 outline-none focus:border-blue-500/30 transition-all resize-none leading-relaxed"
                />
            </div>

            {/* 解析按钮 */}
            <button
                onClick={handleParse}
                disabled={loading}
                className={`w-full py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg
          ${loading ? 'bg-slate-700 text-slate-500' : 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white hover:scale-[1.02]'}
        `}
            >
                {loading ? '正在解析意图...' : 'AI 智能拆解意图'}
            </button>

            {/* 结果展示 (标签云) */}
            {intents.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-slate-800">
                    <label className="text-slate-500 text-[8px] uppercase font-black tracking-widest px-1">解析出的提示词 ({intents.length})</label>
                    <div className="flex flex-wrap gap-2">
                        {intents.map((intent: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 bg-slate-900 border border-white/10 px-3 py-2 rounded-xl group hover:border-blue-500/30 transition-all">
                                <span className="text-[10px] text-slate-300 max-w-[200px] leading-tight">{intent}</span>
                                <button onClick={() => removeIntent(i)} className="text-slate-600 hover:text-red-400 transition-colors">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
