import React, { useMemo, useCallback } from 'react';
import { MindMapNode } from './MindMapNode';
import { MindMapConnections } from './MindMapConnections';

// Estimated node dimensions for connection endpoint calculation
const NODE_SIZES = {
  project: { w: 160, h: 48 },
  group: { w: 160, h: 44 },
  file: { w: 230, h: 44 },
  fileDesc: { w: 230, h: 68 }, // file node with description
};

/**
 * MindMapCanvas - Container that renders nodes and connections.
 * Computes connection positions directly from layout data.
 */
export function MindMapCanvas({ nodes, connections, bounds, direction, toggleGroup, onClose }) {
  // 'horizontal' mode = groups spread horizontally, files below (top-to-bottom connections, no translateY)
  // 'vertical' mode (default) = classic mindmap: root left, groups stacked vertically, files right
  const isHorizontalGroups = direction === 'horizontal';

  // Compute node positions synchronously from layout data
  const nodePositions = useMemo(() => {
    const positions = {};
    for (const node of nodes) {
      let w, h;
      if (node.type === 'file') {
        w = NODE_SIZES.file.w;
        h = node.estimatedHeight || NODE_SIZES.file.h;
      } else {
        const size = NODE_SIZES[node.type] || { w: 150, h: 44 };
        w = size.w;
        h = size.h;
      }

      if (isHorizontalGroups) {
        // Horizontal groups: x=left edge, y=top edge (files below groups)
        positions[node.id] = {
          cx: node.x + w / 2,
          cy: node.y + h / 2,
          left: node.x,
          right: node.x + w,
          top: node.y,
          bottom: node.y + h,
          width: w,
          height: h,
        };
      } else {
        // Classic mindmap: x=left edge, y=center (files to the right)
        positions[node.id] = {
          cx: node.x + w / 2,
          cy: node.y,
          left: node.x,
          right: node.x + w,
          top: node.y - h / 2,
          bottom: node.y + h / 2,
          width: w,
          height: h,
        };
      }
    }
    return positions;
  }, [nodes, isHorizontalGroups]);

  const handleNodeSelect = useCallback((path) => {}, []);

  return (
    <div
      className="mindmap-canvas-inner"
      style={{
        width: bounds.width,
        height: bounds.height,
        position: 'relative',
      }}
    >
      <MindMapConnections
        connections={connections}
        nodePositions={nodePositions}
        width={bounds.width}
        height={bounds.height}
        direction={direction}
      />

      {nodes.map((node) => (
        <MindMapNode
          key={node.id}
          node={node}
          direction={direction}
          onToggleCollapse={toggleGroup}
          onNodeSelect={handleNodeSelect}
        />
      ))}
    </div>
  );
}
