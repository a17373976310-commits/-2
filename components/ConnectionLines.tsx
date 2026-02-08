
import React, { useMemo } from 'react';
import { AppNode } from '../types';

interface ConnectionLinesProps {
    nodes: AppNode[];
}

// 默认节点尺寸
const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 200; // 默认估算高度
const HEADER_HEIGHT = 56; // 标题栏高度

export const ConnectionLines: React.FC<ConnectionLinesProps> = React.memo(({ nodes }) => {
    const connections = useMemo(() => {
        // 获取节点宽度：优先从 node.data.width 读取，否则使用默认值
        const getNodeWidth = (node: AppNode): number => {
            const width = node.data?.width;
            if (typeof width === 'number' && width > 0) {
                return width;
            }
            return DEFAULT_NODE_WIDTH;
        };

        // 获取节点高度：优先从 node.data.height 读取，否则使用估算值
        const getNodeHeight = (node: AppNode): number => {
            const height = node.data?.height;
            if (typeof height === 'number' && height > 0) {
                return height;
            }
            // 根据宽度估算高度（保持与 NodeUI 相似的比例）
            const width = getNodeWidth(node);
            return Math.max(DEFAULT_NODE_HEIGHT, width * 0.6);
        };

        return nodes
            .filter(node => node.data.sourceNodeId)
            .map(node => {
                const sourceNode = nodes.find(n => n.id === node.data.sourceNodeId);
                if (!sourceNode) return null;

                const sourceWidth = getNodeWidth(sourceNode);
                const sourceHeight = getNodeHeight(sourceNode);
                const targetWidth = getNodeWidth(node);
                const targetHeight = getNodeHeight(node);

                // 起点：来源节点的右侧中心
                const startX = sourceNode.position.x + sourceWidth;
                const startY = sourceNode.position.y + sourceHeight / 2;

                // 终点：目标节点的左侧数据源位置
                // 数据源下拉框位于标题栏下方，约在整体高度的 25% 处
                const endX = node.position.x;
                const endY = node.position.y + HEADER_HEIGHT + 20;

                return {
                    id: `${sourceNode.id}-${node.id}`,
                    startX,
                    startY,
                    endX,
                    endY
                };
            })
            .filter(Boolean) as { id: string; startX: number; startY: number; endX: number; endY: number }[];
    }, [nodes]);

    return (
        <svg className="absolute inset-0 pointer-events-none overflow-visible z-0">
            <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#6366f1" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
                </linearGradient>

                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {connections.map(conn => {
                const dx = Math.abs(conn.endX - conn.startX);
                const controlPointOffset = Math.min(dx * 0.5, 200);

                // 贝塞尔曲线路径
                const path = `M ${conn.startX} ${conn.startY} 
                      C ${conn.startX + controlPointOffset} ${conn.startY}, 
                        ${conn.endX - controlPointOffset} ${conn.endY}, 
                        ${conn.endX} ${conn.endY}`;

                return (
                    <g key={conn.id}>
                        {/* 底层阴影/发光 */}
                        <path
                            d={path}
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="4"
                            strokeOpacity="0.1"
                            filter="url(#glow)"
                        />

                        {/* 主线条 */}
                        <path
                            d={path}
                            fill="none"
                            stroke="url(#lineGradient)"
                            strokeWidth="2"
                            strokeDasharray="8,8"
                            className="animate-connection-flow"
                        />

                        {/* 终点小圆点 */}
                        <circle
                            cx={conn.endX}
                            cy={conn.endY}
                            r="3"
                            fill="#3b82f6"
                            className="animate-pulse"
                        />
                    </g>
                );
            })}

            <style>{`
        @keyframes connection-flow {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
        .animate-connection-flow {
          animation: connection-flow 3s linear infinite;
        }
      `}</style>
        </svg>
    );
}, (prev, next) => {
    // 自定义比较函数：只在节点位置或关键属性变化时重新渲染
    if (prev.nodes === next.nodes) return true;
    if (prev.nodes.length !== next.nodes.length) return false;

    return prev.nodes.every((n, i) => {
        const m = next.nodes[i];
        return (
            n.id === m.id &&
            n.position.x === m.position.x &&
            n.position.y === m.position.y &&
            n.data?.sourceNodeId === m.data?.sourceNodeId &&
            n.data?.width === m.data?.width &&
            n.data?.height === m.data?.height
        );
    });
});
