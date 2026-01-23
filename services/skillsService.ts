
import { logger } from './loggerService';

export interface Skill {
    name: string;
    description: string;
    content: string;
}

// Embedded skills content (since dev server can't serve .claude directory directly)
const EMBEDDED_SKILLS: Skill[] = [
    {
        name: 'prompt-system-engineering',
        description: '用于设计和调试系统级提示词工程。当需要构建多阶段AI工作流、调试模型输出不稳定、设计认知架构时使用。',
        content: `# 系统级提示词工程框架

## 核心理念
提示词工程 = 自然语言编程
- 不是"聊天"，是在写**结构化代码**
- 目的：让概率性模型输出**确定性**结果
- 方法论：收敛概率空间，堵死错误路径

## Prompt 架构模板（四层结构）
# ROLE (类定义) - 你是___（身份/专业背景/能力边界）
# CONTEXT (上下文变量) - 输入/场景/约束
# RULES (函数逻辑) - 感知层→决策层→执行层
# OUTPUT (返回格式) - 严格的JSON格式

## 概率收敛技术
- **Negative Constraint**: 堵死错误路径，"绝对不要输出XX"
- **Few-Shot Example**: 给2-3个正确示例锚定输出模式
- **Chain of Thought**: 强制推理过程，"先分析...再判断...最后输出"
- **Format Locking**: 锁死输出结构，"必须是JSON"
- **Self-Check**: 输出前校验

## 调试方法论
1. 定位问题层：输出格式错→Output层，策略选错→决策层，识别不准→感知层
2. 精准修改：每次只动一个变量，用Negative Constraint堵漏洞
3. 验证收敛：同一输入跑5次，结果一致率应>90%`
    },
    {
        name: 'prompt-plugin-orchestration',
        description: '用于设计提示词与插件/工具的交互逻辑。当需要调用外部API、构建多插件工作流时使用。',
        content: `# 提示词-插件编排框架

## 核心角色转变
以前（纯对话）：提示词 = 创作者（直接干活）
现在（带插件）：提示词 = 产品经理 + 翻译官 + 调度器

## 三层交互模式

### Layer 1: 翻译层 (The Translator)
自然语言 ↔ 机器语言
- 清洗意图：把模糊人话翻译成精确需求
- 格式强制：拆解成插件需要的JSON

### Layer 2: 增强层 (The Context Injector)
知识库/RAG/联网搜索
- 前置判断：需不需要查外部？
- 后置融合：把冷数据用自然语言重述

### Layer 3: 编排层 (The Orchestrator)
多阶段工作流 / 链式调用
- 状态保持：A插件输出 → 无损传递给B插件
- 路由分发：IF/ELSE条件判断
- 错误自愈：失败时换策略重试`
    }
];

class SkillsService {
    private static instance: SkillsService;
    private skills: Skill[] = EMBEDDED_SKILLS;
    private loaded = true;

    private constructor() {
        logger.info(`已加载 ${this.skills.length} 个内置 Skills`);
    }

    static getInstance() {
        if (!SkillsService.instance) {
            SkillsService.instance = new SkillsService();
        }
        return SkillsService.instance;
    }

    async loadSkills(): Promise<Skill[]> {
        return this.skills;
    }

    getSkills(): Skill[] {
        return this.skills;
    }

    getSkillByName(name: string): Skill | null {
        return this.skills.find(s => s.name === name) || null;
    }

    buildSystemPrompt(userQuery: string): string {
        const relevantSkills = this.findRelevantSkills(userQuery);

        if (relevantSkills.length === 0) {
            return '';
        }

        let systemPrompt = `你是一个专业的 AI 助手，拥有以下专业知识：\n\n`;

        for (const skill of relevantSkills) {
            systemPrompt += `## ${skill.name}\n${skill.content}\n\n`;
        }

        systemPrompt += `【重要】请严格区分：
- "提示词工程" = 系统架构设计（Role/Context/Rules/Output四层结构，概率收敛技术）
- "提示词" = 具体的文字内容（如图像生成的描述词）

如果用户问"提示词工程"，请用上述框架帮他设计系统架构，而不是直接写一段提示词文本。`;

        return systemPrompt;
    }

    private findRelevantSkills(query: string): Skill[] {
        const queryLower = query.toLowerCase();

        // 优先匹配：提示词工程 vs 提示词
        // 如果只说"提示词"但没说"工程/架构/系统"，可能只是想写普通提示词
        const isPromptEngineering =
            queryLower.includes('提示词工程') ||
            queryLower.includes('prompt engineering') ||
            (queryLower.includes('提示词') && (
                queryLower.includes('工程') ||
                queryLower.includes('架构') ||
                queryLower.includes('系统') ||
                queryLower.includes('设计') ||
                queryLower.includes('框架') ||
                queryLower.includes('role') ||
                queryLower.includes('rules')
            ));

        const isPluginOrchestration =
            queryLower.includes('插件') ||
            queryLower.includes('编排') ||
            queryLower.includes('工作流') ||
            queryLower.includes('多阶段') ||
            queryLower.includes('调度');

        const relevantSkills: Skill[] = [];

        if (isPromptEngineering) {
            const skill = this.getSkillByName('prompt-system-engineering');
            if (skill) relevantSkills.push(skill);
        }

        if (isPluginOrchestration) {
            const skill = this.getSkillByName('prompt-plugin-orchestration');
            if (skill) relevantSkills.push(skill);
        }

        return relevantSkills;
    }
}

export const skillsService = SkillsService.getInstance();
