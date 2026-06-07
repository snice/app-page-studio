import React from 'react';

/**
 * MindMapConnections - SVG layer that draws bezier curves between nodes.
 * Supports both horizontal (left→right) and vertical (top→bottom) directions.
 */
export function MindMapConnections({ connections, nodePositions, width, height, direction }) {
  if (!connections || !nodePositions || !width || !height) return null;

  // 'horizontal' mode = groups spread horizontally, top-to-bottom connections
  const isHorizontalGroups = direction === 'horizontal';

  return (
    <svg
      className="mindmap-connections"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {connections.map((conn) => {
        const fromPos = nodePositions[conn.from.nodeId];
        const toPos = nodePositions[conn.to.nodeId];
        if (!fromPos || !toPos) return null;

        let fromX, fromY, toX, toY, d;

        if (isHorizontalGroups && conn.from.side === 'bottom' && conn.to.side === 'top') {
          // Vertical connection: parent bottom → child top
          fromX = fromPos.cx;
          fromY = fromPos.bottom;
          toX = toPos.cx;
          toY = toPos.top;

          const dy = toY - fromY;
          const offsetY = Math.max(dy * 0.45, 30);
          d = `M ${fromX},${fromY} C ${fromX},${fromY + offsetY} ${toX},${toY - offsetY} ${toX},${toY}`;
        } else {
          // Horizontal connection: parent right → child left
          fromX = fromPos.right;
          fromY = fromPos.cy;
          toX = toPos.left;
          toY = toPos.cy;

          const dx = toX - fromX;
          const offsetX = Math.max(dx * 0.45, 40);
          d = `M ${fromX},${fromY} C ${fromX + offsetX},${fromY} ${toX - offsetX},${toY} ${toX},${toY}`;
        }

        return (
          <path
            key={conn.id}
            d={d}
            stroke={conn.color}
            strokeWidth={2}
            fill="none"
            opacity={0.55}
          />
        );
      })}
    </svg>
  );
}
