/**
 * pagesConfig & pagesMeta + 文件级编辑（交互/切图/功能/数据源/分组/主状态）。
 * 注意：currentFile 也在这里维护，因其与 pagesConfig.htmlFiles 紧耦合。
 */

export function createPagesSlice(set, get) {
  const canEditPages = () => get().session?.isCurrentEditor !== false;

  return {
    pagesConfig: {
      projectName: '', targetPlatform: ['flutter'], designSystem: {},
      sharedComponents: [], htmlFiles: [], pageGroups: [],
    },
    pagesMeta: {
      revision: 0, updatedAt: null, updatedBy: null, updatedBySession: null, projectId: null,
    },
    pagesEntityHashes: { files: {}, groups: null },
    dirtyFiles: {},
    dirtyGroups: false,

    currentFile: null,

    setPagesConfig(newPagesConfig, meta = null) {
      const wrapped = newPagesConfig?.pagesConfig ? newPagesConfig : null;
      const pagesConfig = wrapped ? wrapped.pagesConfig : newPagesConfig;
      const nextMeta = meta || (wrapped ? {
        revision: wrapped.revision || 0,
        updatedAt: wrapped.updatedAt || null,
        updatedBy: wrapped.updatedBy || null,
        updatedBySession: wrapped.updatedBySession || null,
        projectId: wrapped.projectId || null,
      } : null);

      const nextState = {
        pagesConfig: {
          projectName: pagesConfig?.projectName || 'My App',
          targetPlatform: pagesConfig?.targetPlatform || ['flutter'],
          designSystem: pagesConfig?.designSystem || {},
          sharedComponents: pagesConfig?.sharedComponents || [],
          htmlFiles: pagesConfig?.htmlFiles || [],
          pageGroups: pagesConfig?.pageGroups || [],
        },
        ...(nextMeta ? { pagesMeta: nextMeta } : {}),
      };
      if (wrapped?.entityHashes || meta?.entityHashes) {
        nextState.pagesEntityHashes = wrapped?.entityHashes || meta.entityHashes;
      }
      if (wrapped || meta) {
        nextState.dirtyFiles = {};
        nextState.dirtyGroups = false;
      }
      set(nextState);
    },

    setPagesMeta(meta) {
      set((s) => ({
        pagesMeta: {
          ...s.pagesMeta,
          revision: meta?.revision ?? s.pagesMeta.revision,
          updatedAt: meta?.updatedAt ?? s.pagesMeta.updatedAt,
          updatedBy: meta?.updatedBy ?? s.pagesMeta.updatedBy,
          updatedBySession: meta?.updatedBySession ?? s.pagesMeta.updatedBySession,
          projectId: meta?.projectId ?? s.pagesMeta.projectId,
        },
        ...(meta?.entityHashes ? { pagesEntityHashes: meta.entityHashes } : {}),
      }));
    },

    setPagesEntityHashes(entityHashes) {
      set({ pagesEntityHashes: entityHashes || { files: {}, groups: null } });
    },

    markFileDirty(path) {
      if (!path) return;
      set((s) => ({ dirtyFiles: { ...s.dirtyFiles, [path]: true } }));
    },

    clearDirtyFile(path) {
      if (!path) return;
      set((s) => {
        const next = { ...s.dirtyFiles };
        delete next[path];
        return { dirtyFiles: next };
      });
    },

    clearDirtyGroups() {
      set({ dirtyGroups: false });
    },

    clearAllDirty() {
      set({ dirtyFiles: {}, dirtyGroups: false });
    },

    mergeRemoteFile(fileConfig, meta = {}) {
      if (!fileConfig?.path) return;
      set((s) => {
        const htmlFiles = [...(s.pagesConfig.htmlFiles || [])];
        const index = htmlFiles.findIndex((file) => file.path === fileConfig.path);
        const existing = index >= 0 ? htmlFiles[index] : null;
        const nextFile = s.dirtyGroups && existing
          ? {
              ...fileConfig,
              groupId: existing.groupId ?? null,
              isPrimaryState: !!existing.isPrimaryState,
            }
          : fileConfig;
        if (index >= 0) htmlFiles[index] = nextFile;
        else htmlFiles.push(nextFile);
        return {
          pagesConfig: { ...s.pagesConfig, htmlFiles },
          currentFile: s.currentFile?.path === nextFile.path ? nextFile : s.currentFile,
          pagesMeta: {
            ...s.pagesMeta,
            revision: meta.revision ?? s.pagesMeta.revision,
            updatedAt: meta.updatedAt ?? s.pagesMeta.updatedAt,
          },
          pagesEntityHashes: meta.entityHashes || {
            ...s.pagesEntityHashes,
            files: {
              ...(s.pagesEntityHashes.files || {}),
              ...(meta.fileHash ? { [nextFile.path]: meta.fileHash } : {}),
            },
          },
        };
      });
    },

    mergeRemoteGroups(pageGroups, assignments = [], meta = {}) {
      set((s) => {
        const assignmentMap = new Map(
          (assignments || []).filter((item) => item?.path).map((item) => [item.path, item])
        );
        const htmlFiles = (s.pagesConfig.htmlFiles || []).map((file) => {
          const item = assignmentMap.get(file.path);
          if (!item) return file;
          return {
            ...file,
            groupId: item.groupId ?? null,
            isPrimaryState: !!item.isPrimaryState,
          };
        });
        const currentFile = s.currentFile
          ? htmlFiles.find((file) => file.path === s.currentFile.path) || s.currentFile
          : null;
        return {
          pagesConfig: {
            ...s.pagesConfig,
            pageGroups: Array.isArray(pageGroups) ? pageGroups : [],
            htmlFiles,
          },
          currentFile,
          pagesMeta: {
            ...s.pagesMeta,
            revision: meta.revision ?? s.pagesMeta.revision,
            updatedAt: meta.updatedAt ?? s.pagesMeta.updatedAt,
          },
          pagesEntityHashes: meta.entityHashes || {
            ...s.pagesEntityHashes,
            ...(meta.groupsHash ? { groups: meta.groupsHash } : {}),
          },
        };
      });
    },

    syncFilesToConfig() {
      set((s) => {
        const existingFilesMap = new Map((s.pagesConfig.htmlFiles || []).map((f) => [f.path, f]));
        const updatedFiles = [];
        for (const file of s.htmlFiles) {
          const existing = existingFilesMap.get(file.path);
          if (existing) {
            if (!existing.sourceType && file.sourceType) existing.sourceType = file.sourceType;
            if (file.sourceType === 'image' && !existing.imagePath) existing.imagePath = file.path;
            updatedFiles.push(existing);
          } else {
            updatedFiles.push({
              path: file.path, name: file.name,
              sourceType: file.sourceType || 'html',
              imagePath: file.sourceType === 'image' ? file.path : null,
              previewPath: file.sourceType === 'psd' ? file.previewPath : null,
              stateName: '', description: '', groupId: null,
              devStatus: 'pending', interactions: [],
            });
          }
        }
        return { pagesConfig: { ...s.pagesConfig, htmlFiles: updatedFiles } };
      });
    },

    setCurrentFile(path) {
      if (!path) { set({ currentFile: null }); return; }
      set((s) => {
        const file = s.pagesConfig.htmlFiles.find((f) => f.path === path);
        if (!file) return {};
        const next = { currentFile: file };
        if (s.zoomLockBySourceType && file.sourceType) {
          const saved = s.zoomBySourceType[file.sourceType];
          if (typeof saved === 'number') next.zoom = Math.max(25, Math.min(200, saved));
        }
        return next;
      });
    },

    updateCurrentFile(updates) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile) return {};
        Object.assign(s.currentFile, updates);
        return {
          pagesConfig: { ...s.pagesConfig },
          dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true },
        };
      });
    },

    setPrimaryState(isPrimary) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile) return {};
        const currentPath = s.currentFile.path;
        const groupId = s.currentFile.groupId;
        for (const f of s.pagesConfig.htmlFiles || []) {
          if (f.path === currentPath) f.isPrimaryState = !!isPrimary;
          else if (isPrimary && groupId && f.groupId === groupId) f.isPrimaryState = false;
        }
        return { pagesConfig: { ...s.pagesConfig }, dirtyGroups: true };
      });
    },

    // ====== 分组 ======
    addGroup(group) {
      if (!canEditPages()) return;
      set((s) => ({
        pagesConfig: { ...s.pagesConfig, pageGroups: [...(s.pagesConfig.pageGroups || []), group] },
        dirtyGroups: true,
      }));
    },
    updateGroup(groupId, updates) {
      if (!canEditPages()) return;
      set((s) => ({
        pagesConfig: {
          ...s.pagesConfig,
          pageGroups: s.pagesConfig.pageGroups.map((g) => g.id === groupId ? { ...g, ...updates } : g),
        },
        dirtyGroups: true,
      }));
    },
    deleteGroup(groupId) {
      if (!canEditPages()) return;
      set((s) => ({
        pagesConfig: {
          ...s.pagesConfig,
          pageGroups: s.pagesConfig.pageGroups.filter((g) => g.id !== groupId),
          htmlFiles: s.pagesConfig.htmlFiles.map((f) => f.groupId === groupId ? { ...f, groupId: null } : f),
        },
        dirtyGroups: true,
      }));
    },
    assignSelectedFilesToGroup(groupId) {
      if (!canEditPages()) return;
      set((s) => {
        const htmlFiles = s.pagesConfig.htmlFiles.map((f) =>
          s.selectedFiles.has(f.path) ? { ...f, groupId } : f
        );
        return { pagesConfig: { ...s.pagesConfig, htmlFiles }, selectedFiles: new Set(), dirtyGroups: true };
      });
    },
    moveFileToGroup(filePaths, targetGroupId) {
      if (!canEditPages()) return;
      set((s) => ({
        pagesConfig: {
          ...s.pagesConfig,
          htmlFiles: s.pagesConfig.htmlFiles.map((f) =>
            filePaths.includes(f.path) ? { ...f, groupId: targetGroupId } : f
          ),
        },
        dirtyGroups: true,
      }));
    },

    // ====== currentFile 子集合：交互 / 切图 / 功能 / 数据源 ======
    addInteraction(interaction) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile) return {};
        if (!s.currentFile.interactions) s.currentFile.interactions = [];
        s.currentFile.interactions.push(interaction);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    updateInteraction(index, field, value) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.interactions) return {};
        s.currentFile.interactions[index][field] = value;
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    removeInteraction(index) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.interactions) return {};
        s.currentFile.interactions.splice(index, 1);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },

    addImageReplacement(imageReplacement) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile) return {};
        if (!s.currentFile.imageReplacements) s.currentFile.imageReplacements = [];
        s.currentFile.imageReplacements.push(imageReplacement);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    updateImageReplacement(index, field, value) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.imageReplacements) return {};
        s.currentFile.imageReplacements[index][field] = value;
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    removeImageReplacement(index) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.imageReplacements) return {};
        s.currentFile.imageReplacements.splice(index, 1);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },

    addFunctionDescription(fd) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile) return {};
        if (!s.currentFile.functionDescriptions) s.currentFile.functionDescriptions = [];
        s.currentFile.functionDescriptions.push(fd);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    updateFunctionDescription(index, field, value) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.functionDescriptions) return {};
        s.currentFile.functionDescriptions[index][field] = value;
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    removeFunctionDescription(index) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.functionDescriptions) return {};
        s.currentFile.functionDescriptions.splice(index, 1);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },

    addDataSource(dataSource) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile) return {};
        if (!s.currentFile.dataSources) s.currentFile.dataSources = [];
        s.currentFile.dataSources.push(dataSource);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    updateDataSource(index, field, value) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.dataSources) return {};
        s.currentFile.dataSources[index][field] = value;
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
    removeDataSource(index) {
      if (!canEditPages()) return;
      set((s) => {
        if (!s.currentFile?.dataSources) return {};
        s.currentFile.dataSources.splice(index, 1);
        return { pagesConfig: { ...s.pagesConfig }, dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true } };
      });
    },
  };
}
