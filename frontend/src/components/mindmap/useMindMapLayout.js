import { useMemo, useState, useCallback } from 'react';
import { useAppStore } from '../../lib/state';

// Horizontal layout constants (左右): left → right
const H_ROOT_X = 80;
const H_GROUP_X = 340;
const H_FILE_X = 620;
const H_NODE_HEIGHT = 44;
const H_NODE_GAP_Y = 14;
const H_GROUP_GAP_Y = 36;
const H_CANVAS_PADDING = 80;

// Vertical layout constants (上下): top → bottom
const V_ROOT_Y = 60;
const V_GROUP_Y = 200;
const V_FILE_Y = 340;
const V_NODE_WIDTH = 160;
const V_NODE_HEIGHT = 44;
const V_NODE_HEIGHT_DESC = 68;
const V_NODE_GAP_X = 20;
const V_GROUP_GAP_X = 40;
const V_CANVAS_PADDING = 60;

/**
 * Build tree data from pagesConfig for mind map rendering.
 * @param {string} direction - 'vertical' (上下: groups stacked vertically, classic mindmap) or 'horizontal' (左右: groups spread horizontally)
 * Returns { nodes, connections, bounds, direction }
 */
export function useMindMapLayout(direction = 'vertical') {
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const toggleGroup = useCallback((groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedGroups(new Set()), []);
  const collapseAll = useCallback(() => {
    setCollapsedGroups(new Set((pagesConfig.pageGroups || []).map((g) => g.id)));
  }, [pagesConfig.pageGroups]);

  const { nodes, connections, bounds } = useMemo(() => {
    const groups = pagesConfig.pageGroups || [];
    const files = pagesConfig.htmlFiles || [];
    const projectName = pagesConfig.projectName || 'My App';

    // Group files by groupId
    const filesByGroup = {};
    const ungroupedFiles = [];
    for (const file of files) {
      if (file.groupId && groups.find((g) => g.id === file.groupId)) {
        if (!filesByGroup[file.groupId]) filesByGroup[file.groupId] = [];
        filesByGroup[file.groupId].push(file);
      } else {
        ungroupedFiles.push(file);
      }
    }

    if (direction === 'horizontal') {
      // 左右: groups spread horizontally, files below each group
      return buildHorizontalGroupsLayout(groups, files, filesByGroup, ungroupedFiles, projectName, collapsedGroups);
    } else {
      // 上下 (default): classic mindmap - root left, groups stacked vertically, files right
      return buildClassicLayout(groups, files, filesByGroup, ungroupedFiles, projectName, collapsedGroups);
    }
  }, [pagesConfig, collapsedGroups, direction]);

  return {
    nodes,
    connections,
    bounds,
    direction,
    collapsedGroups,
    toggleGroup,
    expandAll,
    collapseAll,
  };
}

/**
 * Classic mindmap layout (上下): root → groups → files, left to right
 * Groups stacked vertically, files to the right of each group
 */
function buildClassicLayout(groups, files, filesByGroup, ungroupedFiles, projectName, collapsedGroups) {
  const nodesList = [];
  const connectionsList = [];

  // Compute total height
  let totalHeight = 0;
  const groupHeights = [];

  for (const group of groups) {
    const groupFiles = filesByGroup[group.id] || [];
    const isCollapsed = collapsedGroups.has(group.id);
    const visibleCount = isCollapsed ? 0 : groupFiles.length;
    const h = Math.max(H_NODE_HEIGHT, visibleCount * (H_NODE_HEIGHT + H_NODE_GAP_Y));
    groupHeights.push(h);
    totalHeight += h + H_GROUP_GAP_Y;
  }

  const ungroupedCollapsed = collapsedGroups.has('__ungrouped__');
  const ungroupedVisible = ungroupedCollapsed ? 0 : ungroupedFiles.length;
  const ungroupedH = ungroupedFiles.length > 0
    ? Math.max(H_NODE_HEIGHT, ungroupedVisible * (H_NODE_HEIGHT + H_NODE_GAP_Y))
    : 0;
  if (ungroupedFiles.length > 0) {
    totalHeight += ungroupedH + H_GROUP_GAP_Y;
  }

  const startY = H_CANVAS_PADDING;
  const rootY = startY + totalHeight / 2;

  nodesList.push({
    id: 'root', type: 'project', label: projectName,
    x: H_ROOT_X, y: rootY,
  });

  let currentY = startY;

  groups.forEach((group, idx) => {
    const isCollapsed = collapsedGroups.has(group.id);
    const groupFiles = filesByGroup[group.id] || [];
    const h = groupHeights[idx];
    const groupNodeY = currentY + h / 2;

    nodesList.push({
      id: `group-${group.id}`, type: 'group', groupId: group.id,
      label: group.name, color: group.color, description: group.description,
      fileCount: groupFiles.length, isCollapsed,
      x: H_GROUP_X, y: groupNodeY,
    });

    connectionsList.push({
      id: `conn-root-${group.id}`,
      from: { nodeId: 'root', side: 'right' },
      to: { nodeId: `group-${group.id}`, side: 'left' },
      color: group.color || 'var(--text-muted)',
    });

    if (!isCollapsed) {
      groupFiles.forEach((file, fIdx) => {
        const fileY = currentY + fIdx * (H_NODE_HEIGHT + H_NODE_GAP_Y) + H_NODE_HEIGHT / 2;
        nodesList.push({
          id: `file-${file.path}`, type: 'file', path: file.path,
          label: file.stateName || file.name || file.path.split('/').pop(),
          description: file.description,
          devStatus: file.devStatus || 'pending',
          sourceType: file.sourceType || 'html',
          groupId: group.id,
          x: H_FILE_X, y: fileY,
        });

        connectionsList.push({
          id: `conn-${group.id}-${file.path}`,
          from: { nodeId: `group-${group.id}`, side: 'right' },
          to: { nodeId: `file-${file.path}`, side: 'left' },
          color: group.color || 'var(--text-muted)',
        });
      });
    }

    currentY += h + H_GROUP_GAP_Y;
  });

  // Ungrouped
  if (ungroupedFiles.length > 0) {
    const ugGroupY = currentY + ungroupedH / 2;
    nodesList.push({
      id: 'group-__ungrouped__', type: 'group', groupId: null,
      label: '未分组', color: '#6b7280',
      fileCount: ungroupedFiles.length, isCollapsed: ungroupedCollapsed,
      x: H_GROUP_X, y: ugGroupY,
    });

    connectionsList.push({
      id: 'conn-root-ungrouped',
      from: { nodeId: 'root', side: 'right' },
      to: { nodeId: 'group-__ungrouped__', side: 'left' },
      color: '#6b7280',
    });

    if (!ungroupedCollapsed) {
      ungroupedFiles.forEach((file, fIdx) => {
        const fileY = currentY + fIdx * (H_NODE_HEIGHT + H_NODE_GAP_Y) + H_NODE_HEIGHT / 2;
        nodesList.push({
          id: `file-${file.path}`, type: 'file', path: file.path,
          label: file.stateName || file.name || file.path.split('/').pop(),
          description: file.description,
          devStatus: file.devStatus || 'pending',
          sourceType: file.sourceType || 'html',
          groupId: null,
          x: H_FILE_X, y: fileY,
        });

        connectionsList.push({
          id: `conn-ungrouped-${file.path}`,
          from: { nodeId: 'group-__ungrouped__', side: 'right' },
          to: { nodeId: `file-${file.path}`, side: 'left' },
          color: '#6b7280',
        });
      });
    }

    currentY += ungroupedH + H_GROUP_GAP_Y;
  }

  return {
    nodes: nodesList,
    connections: connectionsList,
    bounds: { width: H_FILE_X + 240, height: Math.max(currentY + H_CANVAS_PADDING, 400) },
  };
}

/**
 * Horizontal groups layout (左右): root at top, groups spread horizontally, files below each group
 */
function buildHorizontalGroupsLayout(groups, files, filesByGroup, ungroupedFiles, projectName, collapsedGroups) {
  const nodesList = [];
  const connectionsList = [];

  // Root node at top-left area
  nodesList.push({
    id: 'root', type: 'project', label: projectName,
    x: V_CANVAS_PADDING, y: V_ROOT_Y,
  });

  let currentX = V_CANVAS_PADDING;

  // Group nodes in a horizontal row
  const allGroups = [...groups];
  if (ungroupedFiles.length > 0) {
    allGroups.push({ id: '__ungrouped__', name: '未分组', color: '#6b7280' });
  }

  const groupPositions = {}; // groupId -> { x, width }

  allGroups.forEach((group) => {
    const isUngrouped = group.id === '__ungrouped__';
    const groupFiles = isUngrouped ? ungroupedFiles : (filesByGroup[group.id] || []);
    const isCollapsed = collapsedGroups.has(isUngrouped ? '__ungrouped__' : group.id);
    const visibleCount = isCollapsed ? 0 : groupFiles.length;

    // Group node position
    const groupX = currentX;
    const groupW = V_NODE_WIDTH;

    nodesList.push({
      id: `group-${group.id}`, type: 'group', groupId: isUngrouped ? null : group.id,
      label: group.name, color: group.color, description: group.description,
      fileCount: groupFiles.length, isCollapsed,
      x: groupX, y: V_GROUP_Y,
    });

    // Connection: root bottom -> group top
    connectionsList.push({
      id: isUngrouped ? 'conn-root-ungrouped' : `conn-root-${group.id}`,
      from: { nodeId: 'root', side: 'bottom' },
      to: { nodeId: `group-${group.id}`, side: 'top' },
      color: group.color || '#6b7280',
    });

    groupPositions[group.id] = { x: groupX };

    // File nodes stacked vertically below the group
    if (!isCollapsed) {
      groupFiles.forEach((file, fIdx) => {
        const hasDesc = !!(file.description);
        const nodeH = hasDesc ? V_NODE_HEIGHT_DESC : V_NODE_HEIGHT;
        const fileY = V_FILE_Y + fIdx * (nodeH + V_NODE_GAP_X);

        nodesList.push({
          id: `file-${file.path}`, type: 'file', path: file.path,
          label: file.stateName || file.name || file.path.split('/').pop(),
          description: file.description,
          devStatus: file.devStatus || 'pending',
          sourceType: file.sourceType || 'html',
          groupId: isUngrouped ? null : group.id,
          x: groupX, y: fileY,
        });

        connectionsList.push({
          id: isUngrouped ? `conn-ungrouped-${file.path}` : `conn-${group.id}-${file.path}`,
          from: { nodeId: `group-${group.id}`, side: 'bottom' },
          to: { nodeId: `file-${file.path}`, side: 'top' },
          color: group.color || '#6b7280',
        });
      });
    }

    // Calculate column width for spacing
    const colHeight = isCollapsed ? 0 : visibleCount * ((groupFiles.some(f => f.description) ? V_NODE_HEIGHT_DESC : V_NODE_HEIGHT) + V_NODE_GAP_X);
    currentX += groupW + V_GROUP_GAP_X;
  });

  // Calculate bounds
  const totalWidth = currentX + V_CANVAS_PADDING;

  // Find max Y from file nodes
  let maxY = V_GROUP_Y + V_NODE_HEIGHT + 60;
  nodesList.forEach((n) => {
    if (n.type === 'file') {
      const hasDesc = !!(n.description);
      maxY = Math.max(maxY, n.y + (hasDesc ? V_NODE_HEIGHT_DESC : V_NODE_HEIGHT) + V_CANVAS_PADDING);
    }
  });

  return {
    nodes: nodesList,
    connections: connectionsList,
    bounds: { width: Math.max(totalWidth, 600), height: Math.max(maxY, 500) },
  };
}
