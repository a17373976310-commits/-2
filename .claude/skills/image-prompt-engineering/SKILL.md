---
name: image-prompt-engineering
description: 用于生成高质量图像提示词。当需要写图像生成提示词、优化提示词、或讨论如何让AI生成更好的图片时使用。
---

# 图像提示词工程规范

## 提示词结构（按顺序）
1. **主体描述**：who/what is the subject (具体、详细)
2. **场景/背景**：where, environment, setting
3. **光影**：lighting type (cinematic, soft, dramatic, golden hour)
4. **风格**：art style, medium (photography, illustration, 3D render)
5. **构图**：camera angle, framing (close-up, wide shot, bird's eye)
6. **质量修饰**：high detail, 8K, masterpiece, professional

## 必用技巧
- 用英文写（效果更好）
- 避免否定词（不要说"no blur"，改说"sharp focus"）
- 具体胜过抽象（不说"beautiful"，说"glowing skin, symmetrical face"）
- 权重语法：`(重要词:1.2)` 提高权重，`[不重要词:0.8]` 降低权重

## 常见场景模板

### 产品图
```
[product name], product photography, centered composition, 
soft studio lighting, gradient background, 
high-end commercial style, 8K, sharp focus
```

### 电商详情页
```
[product] in lifestyle setting, [使用场景描述], 
natural lighting, professional photography, 
aspirational mood, clean composition, high resolution
```

### 人物/模特
```
[描述], [服装], [表情/姿势], 
[场景], cinematic lighting, 
fashion photography style, shallow depth of field
```

## 调试思路
1. 效果不对 → 先检查主体描述是否足够具体
2. 风格不对 → 添加更多风格关键词（artist name, art movement）
3. 构图不对 → 明确指定camera angle和framing
4. 质量不好 → 添加质量修饰词
