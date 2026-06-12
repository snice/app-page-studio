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
const V_NODE_GAP_X = 20;
const V_GROUP_GAP_X = 40;
const V_CANVAS_PADDING = 60;

function estimateFileNodeHeight(description) {
  if (!description) return V_NODE_HEIGHT;
  const CHARS_PER_LINE = 18;
  const LINE_HEIGHT = 16;
  const DESC_OVERHEAD = 14; // margin-top + padding-top + border
  const lines = Math.ceil(description.length / CHARS_PER_LINE);
  return V_NODE_HEIGHT + DESC_OVERHEAD + lines * LINE_HEIGHT;
}

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
      // 上下树形布局: root居顶, 分组水平展开, 文件在各分组下方
      return buildVerticalTreeLayout(groups, files, filesByGroup, ungroupedFiles, projectName, collapsedGroups);
    } else {
      // 左右经典布局 (default): root居左, 分组垂直堆叠, 文件在右
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
    let h = H_NODE_HEIGHT;
    if (!isCollapsed) {
      h = 0;
      groupFiles.forEach((file) => {
        h += estimateFileNodeHeight(file.description) + H_NODE_GAP_Y;
      });
      h = Math.max(H_NODE_HEIGHT, h);
    }
    groupHeights.push(h);
    totalHeight += h + H_GROUP_GAP_Y;
  }

  const ungroupedCollapsed = collapsedGroups.has('__ungrouped__');
  let ungroupedH = 0;
  if (ungroupedFiles.length > 0) {
    if (ungroupedCollapsed) {
      ungroupedH = H_NODE_HEIGHT;
    } else {
      ungroupedFiles.forEach((file) => {
        ungroupedH += estimateFileNodeHeight(file.description) + H_NODE_GAP_Y;
      });
      ungroupedH = Math.max(H_NODE_HEIGHT, ungroupedH);
    }
  }
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
      let fileAccY = currentY;
      groupFiles.forEach((file) => {
        const nodeH = estimateFileNodeHeight(file.description);
        const fileY = fileAccY + nodeH / 2;
        nodesList.push({
          id: `file-${file.path}`, type: 'file', path: file.path,
          label: file.stateName || file.name || file.path.split('/').pop(),
          description: file.description,
          devStatus: file.devStatus || 'pending',
          sourceType: file.sourceType || 'html',
          groupId: group.id,
          estimatedHeight: nodeH,
          x: H_FILE_X, y: fileY,
        });
        fileAccY += nodeH + H_NODE_GAP_Y;

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
      let ugFileAccY = currentY;
      ungroupedFiles.forEach((file) => {
        const nodeH = estimateFileNodeHeight(file.description);
        const fileY = ugFileAccY + nodeH / 2;
        nodesList.push({
          id: `file-${file.path}`, type: 'file', path: file.path,
          label: file.stateName || file.name || file.path.split('/').pop(),
          description: file.description,
          devStatus: file.devStatus || 'pending',
          sourceType: file.sourceType || 'html',
          groupId: null,
          estimatedHeight: nodeH,
          x: H_FILE_X, y: fileY,
        });
        ugFileAccY += nodeH + H_NODE_GAP_Y;

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
    bounds: { width: H_FILE_X + 300, height: Math.max(currentY + H_CANVAS_PADDING, 400) },
  };
}

/**
 * 树形布局 (上下): root居中顶部, 分组水平展开, 文件在各分组下方垂直堆叠
 * 对应 direction === 'horizontal' (UI显示为"左右")
 */
function buildVerticalTreeLayout(groups, files, filesByGroup, ungroupedFiles, projectName, collapsedGroups) {
  const nodesList = [];
  const connectionsList = [];

  // 收集所有分组(含未分组)
  const allGroups = [...groups];
  if (ungroupedFiles.length > 0) {
    allGroups.push({ id: '__ungrouped__', name: '未分组', color: '#6b7280' });
  }

  const groupNodeWidth = V_NODE_WIDTH; // 分组节点宽度 (160)
  const fileNodeWidth = 230; // 文件节点宽度 (accounts for description text)
  const trunkGap = 18; // trunk line gap left of file nodes
  const fileLeftMargin = trunkGap + 4; // extra space for bracket trunk
  const fileXOffset = fileLeftMargin; // files start after trunk gap, left-aligned under group

  // 计算分组的实际跨度, accounting for wider file area
  const effectiveGroupWidth = Math.max(groupNodeWidth, fileXOffset + fileNodeWidth);
  const groupsSpan = V_CANVAS_PADDING + allGroups.length * effectiveGroupWidth + (allGroups.length - 1) * V_GROUP_GAP_X + V_CANVAS_PADDING;
  const groupsLeftEdge = V_CANVAS_PADDING;
  const groupsRightEdge = V_CANVAS_PADDING + (allGroups.length - 1) * (effectiveGroupWidth + V_GROUP_GAP_X) + effectiveGroupWidth;
  const groupsCenterX = (groupsLeftEdge + groupsRightEdge) / 2;

  // Root节点水平居中于所有分组跨度上方
  const rootWidth = 160;
  const rootX = groupsCenterX - rootWidth / 2;

  nodesList.push({
    id: 'root', type: 'project', label: projectName,
    x: rootX, y: V_ROOT_Y,
  });

  // 分组水平排列
  let currentX = V_CANVAS_PADDING;

  allGroups.forEach((group) => {
    const isUngrouped = group.id === '__ungrouped__';
    const groupFiles = isUngrouped ? ungroupedFiles : (filesByGroup[group.id] || []);
    const isCollapsed = collapsedGroups.has(isUngrouped ? '__ungrouped__' : group.id);

    const groupX = currentX;

    // 分组节点
    nodesList.push({
      id: `group-${group.id}`, type: 'group', groupId: isUngrouped ? null : group.id,
      label: group.name, color: group.color, description: group.description,
      fileCount: groupFiles.length, isCollapsed,
      x: groupX, y: V_GROUP_Y,
    });

    // 连接: root底部中心 -> 分组顶部中心
    connectionsList.push({
      id: isUngrouped ? 'conn-root-ungrouped' : `conn-root-${group.id}`,
      from: { nodeId: 'root', side: 'bottom' },
      to: { nodeId: `group-${group.id}`, side: 'top' },
      color: group.color || '#6b7280',
    });

    // 文件节点在分组下方垂直堆叠, 居中对齐
    if (!isCollapsed) {
      let currentFileY = V_FILE_Y;
      groupFiles.forEach((file) => {
        const nodeH = estimateFileNodeHeight(file.description);

        nodesList.push({
          id: `file-${file.path}`, type: 'file', path: file.path,
          label: file.stateName || file.name || file.path.split('/').pop(),
          description: file.description,
          devStatus: file.devStatus || 'pending',
          sourceType: file.sourceType || 'html',
          groupId: isUngrouped ? null : group.id,
          x: groupX + fileXOffset,
          y: currentFileY,
          estimatedHeight: nodeH,
        });

        connectionsList.push({
          id: isUngrouped ? `conn-ungrouped-${file.path}` : `conn-${group.id}-${file.path}`,
          from: { nodeId: `group-${group.id}`, side: 'bottom' },
          to: { nodeId: `file-${file.path}`, side: 'top' },
          color: group.color || '#6b7280',
        });

        currentFileY += nodeH + V_NODE_GAP_X;
      });
    }

    currentX += effectiveGroupWidth + V_GROUP_GAP_X;
  });

  // 计算画布边界
  const totalWidth = Math.max(groupsSpan, groupsRightEdge + V_CANVAS_PADDING);

  let maxY = V_GROUP_Y + V_NODE_HEIGHT + 60;
  nodesList.forEach((n) => {
    if (n.type === 'file') {
      const h = n.estimatedHeight || estimateFileNodeHeight(n.description);
      maxY = Math.max(maxY, n.y + h + V_CANVAS_PADDING);
    }
  });

  return {
    nodes: nodesList,
    connections: connectionsList,
    bounds: { width: Math.max(totalWidth, 600), height: Math.max(maxY, 500) },
  };
}
