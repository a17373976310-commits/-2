
import React from 'react';
import { AppNode } from '../types';

interface ConnectionLinesProps {
    nodes: AppNode[];
}

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({ nodes }) => {
    // 节点估算尺寸 (NodeUI.tsx 中 w-80 = 320px)
    const NODE_WIDTH = 320;
    const NODE_HEADER_HEIGHT = 60; // 估算头部高度

    const connections = nodes
        .filter(node => node.data.sourceNodeId)
        .map(node => {
            const sourceNode = nodes.find(n => n.id === node.data.sourceNodeId);
            if (!sourceNode) return null;

            // 起点：来源节点的右侧中心 (稍微靠下一点，避开标题栏)
            const startX = sourceNode.position.x + NODE_WIDTH;
            const startY = sourceNode.position.y + 100; // 约在内容区顶部

            // 终点：目标节点的左侧中心 (接入数据源下拉框的位置)
            const endX = node.position.x;
            const endY = node.position.y + 140; // 约在下拉框位置

            return {
                id: `${sourceNode.id}-${node.id}`,
                startX,
                startY,
                endX,
                endY
            };
        })
        .filter(Boolean) as { id: string; startX: number; startY: number; endX: number; endY: number }[];

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
};
