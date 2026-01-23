---
name: canvas-ui-interaction
description: 用于设计无限画布2的UI交互。当讨论节点交互、用户体验、界面设计时使用。
---

# 无限画布2 UI交互规范

## 核心原则
1. **即时反馈**：任何操作都要有视觉反馈（loading、hover、active状态）
2. **渐进披露**：复杂功能分层展示，避免一次性显示过多选项
3. **防误操作**：危险操作需要二次确认，支持撤销
4. **性能优先**：大数据操作用本地状态，完成后再同步全局

## 节点交互模式
- **拖拽**：左键按住头部区域拖动
- **缩放**：右下角resize handle，仅松开时同步状态
- **连线**：通过"接入数据源"下拉选择，非拖线
- **删除**：hover时显示删除按钮，需确认
- **复制图片**：hover图片时显示复制按钮 + Ctrl+C

## 状态反馈规范
| 状态 | 视觉表现 |
|------|----------|
| Loading | 蓝色边框 + 脉冲动画 + 底部状态文字 |
| Error | 红色错误提示框 |
| Success | 绿色日志 + 结果区出现 |
| Pro模型 | 琥珀色边框 + 发光指示灯 |

## 常见问题解决模式
- **滚动冲突** → `onWheel={(e) => e.stopPropagation()}`
- **拖拽冲突** → `onMouseDown={(e) => e.stopPropagation()}`
- **文字选择** → 添加 `select-text` class
- **高频更新** → 用本地state，mouseUp时才onUpdate

## 样式规范
- 圆角：`rounded-xl`（小）, `rounded-2xl`（中）, `rounded-3xl`（大）
- 背景：`bg-slate-900` 系列
- 边框：`border-white/10` 或 `border-slate-700`
- 动画：`transition-all duration-300`
