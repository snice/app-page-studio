/**
 * 数据库模块
 * 使用 SQLite 存储项目信息
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'studio.db');

// 初始化数据库
const db = new Database(DB_PATH);

// 创建表（is_current 字段保留以兼容现有数据，但不再使用）
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    design_system TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_current INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS project_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    pages_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS edit_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    editor_name TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// 添加 design_system 字段（如果不存在）
try {
  db.exec(`ALTER TABLE projects ADD COLUMN design_system TEXT`);
} catch (e) {
  // 字段已存在，忽略错误
}

/**
 * 项目管理
 */
const Projects = {
  /**
   * 获取所有项目
   */
  getAll() {
    const rows = db.prepare(`
      SELECT id, name, description, design_system, created_at, updated_at
      FROM projects
      ORDER BY updated_at DESC
    `).all();

    return rows.map(row => ({
      ...row,
      designSystem: row.design_system ? JSON.parse(row.design_system) : null
    }));
  },

  /**
   * 根据 ID 获取项目
   */
  getById(id) {
    const row = db.prepare(`
      SELECT id, name, description, design_system, created_at, updated_at
      FROM projects
      WHERE id = ?
    `).get(id);

    if (row) {
      return {
        ...row,
        designSystem: row.design_system ? JSON.parse(row.design_system) : null
      };
    }
    return null;
  },

  /**
   * 创建项目
   */
  create(name, description = '') {
    const result = db.prepare(`
      INSERT INTO projects (name, description)
      VALUES (?, ?)
    `).run(name, description);

    // 初始化空的 pages_json
    db.prepare(`
      INSERT INTO project_pages (project_id, pages_json)
      VALUES (?, ?)
    `).run(result.lastInsertRowid, JSON.stringify({
      projectName: name,
      targetPlatform: ['flutter'],
      designSystem: {},
      sharedComponents: [],
      htmlFiles: [],
      pageGroups: []
    }));

    return result.lastInsertRowid;
  },

  /**
   * 更新项目
   */
  update(id, name, description, designSystem = null) {
    return db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, design_system = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description, designSystem ? JSON.stringify(designSystem) : null, id);
  },

  /**
   * 删除项目
   */
  delete(id) {
    return db.prepare(`
      DELETE FROM projects
      WHERE id = ?
    `).run(id);
  },

  /**
   * 获取项目的 pages.json
   */
  getPagesJson(projectId) {
    const row = db.prepare(`
      SELECT pages_json
      FROM project_pages
      WHERE project_id = ?
    `).get(projectId);

    if (row && row.pages_json) {
      try {
        return JSON.parse(row.pages_json);
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  /**
   * 保存项目的 pages.json
   */
  savePagesJson(projectId, pagesConfig) {
    const exists = db.prepare(`
      SELECT 1 FROM project_pages WHERE project_id = ?
    `).get(projectId);

    if (exists) {
      return db.prepare(`
        UPDATE project_pages
        SET pages_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
      `).run(JSON.stringify(pagesConfig), projectId);
    } else {
      return db.prepare(`
        INSERT INTO project_pages (project_id, pages_json)
        VALUES (?, ?)
      `).run(projectId, JSON.stringify(pagesConfig));
    }
  }
};

// 会话过期时间（毫秒）
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 编辑会话管理
 */
const EditSessions = {
  /**
   * 获取项目的活跃编辑会话
   * @param {number} projectId
   * @returns {Object|null} 活跃的编辑会话
   */
  getActiveSession(projectId) {
    // 清理过期会话
    this.cleanExpired();

    return db.prepare(`
      SELECT session_id, editor_name, started_at, last_heartbeat
      FROM edit_sessions
      WHERE project_id = ?
      ORDER BY last_heartbeat DESC
      LIMIT 1
    `).get(projectId);
  },

  /**
   * 注册或更新编辑会话
   * @param {number} projectId
   * @param {string} sessionId
   * @param {string} editorName
   * @returns {Object} { success, isNewEditor, currentEditor }
   */
  registerSession(projectId, sessionId, editorName) {
    // 清理过期会话
    this.cleanExpired();

    const existing = this.getActiveSession(projectId);

    if (existing && existing.session_id !== sessionId) {
      // 有其他人在编辑
      return {
        success: true,
        isNewEditor: false,
        currentEditor: existing.editor_name || '其他用户',
        startedAt: existing.started_at
      };
    }

    // 更新或插入会话
    const existingOwn = db.prepare(`
      SELECT 1 FROM edit_sessions WHERE project_id = ? AND session_id = ?
    `).get(projectId, sessionId);

    if (existingOwn) {
      db.prepare(`
        UPDATE edit_sessions
        SET editor_name = ?, last_heartbeat = CURRENT_TIMESTAMP
        WHERE project_id = ? AND session_id = ?
      `).run(editorName, projectId, sessionId);
    } else {
      // 清除该项目的其他会话，插入新会话
      db.prepare(`DELETE FROM edit_sessions WHERE project_id = ?`).run(projectId);
      db.prepare(`
        INSERT INTO edit_sessions (project_id, session_id, editor_name)
        VALUES (?, ?, ?)
      `).run(projectId, sessionId, editorName);
    }

    return { success: true, isNewEditor: true, currentEditor: editorName };
  },

  /**
   * 更新心跳
   * @param {number} projectId
   * @param {string} sessionId
   */
  heartbeat(projectId, sessionId) {
    db.prepare(`
      UPDATE edit_sessions
      SET last_heartbeat = CURRENT_TIMESTAMP
      WHERE project_id = ? AND session_id = ?
    `).run(projectId, sessionId);
  },

  /**
   * 检查是否是当前编辑者
   * @param {number} projectId
   * @param {string} sessionId
   * @returns {Object} { isCurrentEditor, currentEditor }
   */
  checkSession(projectId, sessionId) {
    this.cleanExpired();
    const active = this.getActiveSession(projectId);

    if (!active) {
      return { isCurrentEditor: true, currentEditor: null };
    }

    return {
      isCurrentEditor: active.session_id === sessionId,
      currentEditor: active.editor_name || '其他用户'
    };
  },

  /**
   * 释放编辑会话
   * @param {number} projectId
   * @param {string} sessionId
   */
  releaseSession(projectId, sessionId) {
    db.prepare(`
      DELETE FROM edit_sessions
      WHERE project_id = ? AND session_id = ?
    `).run(projectId, sessionId);
  },

  /**
   * 清理过期会话
   */
  cleanExpired() {
    const timeoutSeconds = SESSION_TIMEOUT_MS / 1000;
    db.prepare(`
      DELETE FROM edit_sessions
      WHERE datetime(last_heartbeat, '+' || ? || ' seconds') < datetime('now')
    `).run(timeoutSeconds);
  },

  /**
   * 强制接管编辑会话
   * @param {number} projectId
   * @param {string} sessionId
   * @param {string} editorName
   */
  forceAcquire(projectId, sessionId, editorName) {
    db.prepare(`DELETE FROM edit_sessions WHERE project_id = ?`).run(projectId);
    db.prepare(`
      INSERT INTO edit_sessions (project_id, session_id, editor_name)
      VALUES (?, ?, ?)
    `).run(projectId, sessionId, editorName);
    return { success: true, isNewEditor: true, currentEditor: editorName };
  }
};

module.exports = {
  db,
  Projects,
  EditSessions
};
