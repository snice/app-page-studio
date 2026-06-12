/**
 * 项目写权限状态。
 * isCurrentEditor 作为历史字段名保留，含义已变为“当前用户是否可编辑当前项目”。
 */

export function createSessionSlice(set, get) {
  return {
    session: {
      isCurrentEditor: true,
      wsSessionId: null,
      wsConnectionId: null,
      presenceUsers: [],
    },

    updateSessionStatus(status) {
      set((st) => ({
        session: {
          ...st.session,
          isCurrentEditor: !!status.isCurrentEditor,
        },
      }));
    },

    setRealtimeSession(info = {}) {
      set((st) => ({
        session: {
          ...st.session,
          wsSessionId: info.sessionId ?? st.session.wsSessionId,
          wsConnectionId: info.connectionId ?? st.session.wsConnectionId,
        },
      }));
    },

    setPresenceUsers(users = []) {
      set((st) => ({
        session: {
          ...st.session,
          presenceUsers: Array.isArray(users) ? users : [],
        },
      }));
    },
  };
}
