/**
 * 项目写权限状态。
 * isCurrentEditor 作为历史字段名保留，含义已变为“当前用户是否可编辑当前项目”。
 */

export function createSessionSlice(set, get) {
  return {
    session: {
      isCurrentEditor: true,
    },

    updateSessionStatus(status) {
      set((st) => ({
        session: {
          ...st.session,
          isCurrentEditor: !!status.isCurrentEditor,
        },
      }));
    },
  };
}
