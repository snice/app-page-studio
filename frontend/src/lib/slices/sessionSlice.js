/**
 * 编辑会话：sessionId、editorName、isCurrentEditor、心跳
 */
const STORAGE_KEY_SESSION_ID = 'appPageStudio_sessionId';
const STORAGE_KEY_EDITOR_NAME = 'appPageStudio_editorName';

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

export function createSessionSlice(set, get) {
  return {
    session: {
      sessionId: null, editorName: null, isCurrentEditor: true,
      currentEditor: null, heartbeatTimer: null,
    },

    getSessionId() {
      const s = get().session;
      if (s.sessionId) return s.sessionId;
      let sessionId = sessionStorage.getItem(STORAGE_KEY_SESSION_ID);
      if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem(STORAGE_KEY_SESSION_ID, sessionId);
      }
      set((st) => ({ session: { ...st.session, sessionId } }));
      return sessionId;
    },

    getEditorName() {
      const s = get().session;
      if (s.editorName) return s.editorName;
      const name = localStorage.getItem(STORAGE_KEY_EDITOR_NAME);
      set((st) => ({ session: { ...st.session, editorName: name } }));
      return name;
    },

    setEditorName(name) {
      if (name) localStorage.setItem(STORAGE_KEY_EDITOR_NAME, name);
      else localStorage.removeItem(STORAGE_KEY_EDITOR_NAME);
      set((st) => ({ session: { ...st.session, editorName: name } }));
    },

    updateSessionStatus(status) {
      set((st) => ({
        session: {
          ...st.session,
          isCurrentEditor: status.isCurrentEditor,
          currentEditor: status.currentEditor,
        },
      }));
    },

    startHeartbeat(apiRef) {
      const st = get();
      st.stopHeartbeat();
      const timer = setInterval(() => {
        const projectId = get().getCurrentProjectId();
        if (projectId) apiRef.sessionHeartbeat(projectId, get().getSessionId());
      }, 2 * 60 * 1000);
      set((s) => ({ session: { ...s.session, heartbeatTimer: timer } }));
    },

    stopHeartbeat() {
      const timer = get().session.heartbeatTimer;
      if (timer) {
        clearInterval(timer);
        set((s) => ({ session: { ...s.session, heartbeatTimer: null } }));
      }
    },
  };
}
