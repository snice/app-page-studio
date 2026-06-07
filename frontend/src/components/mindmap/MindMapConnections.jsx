import React from 'react';

export function MindMapConnections({ connections, nodePositions, width, height, direction }) {
  if (!connections || !nodePositions || !width || !height) return null;

  const isTreeLayout = direction === 'horizontal';

  if (!isTreeLayout) {
    return (
      <svg
        className="mindmap-connections"
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {connections.map((conn) => {
          const fromPos = nodePositions[conn.from.nodeId];
          const toPos = nodePositions[conn.to.nodeId];
          if (!fromPos || !toPos) return null;

          const fromX = fromPos.right;
          const fromY = fromPos.cy;
          const toX = toPos.left;
          const toY = toPos.cy;

          const dx = toX - fromX;
          const offsetX = Math.max(dx * 0.45, 40);
          const d = `M ${fromX},${fromY} C ${fromX + offsetX},${fromY} ${toX - offsetX},${toY} ${toX},${toY}`;

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

  // Tree layout: separate root→group (bezier) and group→file (bracket) connections
  const rootToGroup = [];
  const groupToFiles = {};

  for (const conn of connections) {
    const fromPos = nodePositions[conn.from.nodeId];
    const toPos = nodePositions[conn.to.nodeId];
    if (!fromPos || !toPos) continue;

    if (conn.from.nodeId === 'root') {
      rootToGroup.push(conn);
    } else {
      if (!groupToFiles[conn.from.nodeId]) {
        groupToFiles[conn.from.nodeId] = { color: conn.color, fromPos, children: [] };
      }
      groupToFiles[conn.from.nodeId].children.push({ conn, toPos });
    }
  }

  const paths = [];

  // Root → Group: bezier curves
  for (const conn of rootToGroup) {
    const fromPos = nodePositions[conn.from.nodeId];
    const toPos = nodePositions[conn.to.nodeId];
    const fromX = fromPos.cx;
    const fromY = fromPos.bottom;
    const toX = toPos.cx;
    const toY = toPos.top;

    const dy = toY - fromY;
    const offsetY = Math.max(dy * 0.45, 30);
    const d = `M ${fromX},${fromY} C ${fromX},${fromY + offsetY} ${toX},${toY - offsetY} ${toX},${toY}`;

    paths.push(
      <path
        key={conn.id}
        d={d}
        stroke={conn.color}
        strokeWidth={2}
        fill="none"
        opacity={0.55}
      />
    );
  }

  // Group → Files: bracket/elbow style
  // Trunk line on the left, horizontal branches to each file's left edge
  const TRUNK_GAP = 18;

  for (const [groupId, group] of Object.entries(groupToFiles)) {
    const { color, fromPos, children } = group;
    if (children.length === 0) continue;

    const parentCx = fromPos.cx;
    const parentBottom = fromPos.bottom;

    // Sort children by vertical position
    const sorted = [...children].sort((a, b) => a.toPos.cy - b.toPos.cy);

    if (sorted.length === 1) {
      // Single child: straight vertical line from parent bottom to child top
      const toPos = sorted[0].toPos;
      paths.push(
        <path
          key={`bracket-${groupId}-single`}
          d={`M ${parentCx},${parentBottom} L ${parentCx},${toPos.top}`}
          stroke={color}
          strokeWidth={2}
          fill="none"
          opacity={0.55}
        />
      );
    } else {
      // Multiple children: bracket style
      // Trunk x = left edge of leftmost child minus gap
      const trunkX = Math.min(...sorted.map(c => c.toPos.left)) - TRUNK_GAP;
      const firstChildCy = sorted[0].toPos.cy;
      const lastChildCy = sorted[sorted.length - 1].toPos.cy;

      // Vertical stem from parent bottom center down, then elbow to trunk x
      const elbowY = parentBottom + (firstChildCy - parentBottom) / 2;
      paths.push(
        <path
          key={`bracket-${groupId}-stem`}
          d={`M ${parentCx},${parentBottom} L ${parentCx},${elbowY} L ${trunkX},${elbowY} L ${trunkX},${firstChildCy}`}
          stroke={color}
          strokeWidth={2}
          fill="none"
          opacity={0.55}
        />
      );

      // Vertical trunk from first child to last child
      if (sorted.length > 1) {
        paths.push(
          <path
            key={`bracket-${groupId}-trunk`}
            d={`M ${trunkX},${firstChildCy} L ${trunkX},${lastChildCy}`}
            stroke={color}
            strokeWidth={2}
            fill="none"
            opacity={0.55}
          />
        );
      }

      // Horizontal branches from trunk to each child's left edge
      for (const child of sorted) {
        paths.push(
          <path
            key={`bracket-${groupId}-branch-${child.conn.id}`}
            d={`M ${trunkX},${child.toPos.cy} L ${child.toPos.left},${child.toPos.cy}`}
            stroke={color}
            strokeWidth={2}
            fill="none"
            opacity={0.55}
          />
        );
      }
    }
  }

  return (
    <svg
      className="mindmap-connections"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {paths}
    </svg>
  );
}
