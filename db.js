/**
 * 数据库模块
 * 使用 SQLite 存储项目信息
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'studio.db');

// 初始化数据库
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    design_system TEXT,
    owner_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS project_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    pages_json TEXT,
    revision INTEGER DEFAULT 1,
    updated_by TEXT,
    updated_by_session TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_page_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    pages_json TEXT,
    updated_by TEXT,
    updated_by_session TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, revision),
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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
`);

// 添加 design_system 字段（如果不存在）
try {
  db.exec(`ALTER TABLE projects ADD COLUMN design_system TEXT`);
} catch (e) {
  // 字段已存在，忽略错误
}

const migrations = [
  `ALTER TABLE projects ADD COLUMN owner_user_id INTEGER`,
  `ALTER TABLE project_pages ADD COLUMN revision INTEGER DEFAULT 1`,
  `ALTER TABLE project_pages ADD COLUMN updated_by TEXT`,
  `ALTER TABLE project_pages ADD COLUMN updated_by_session TEXT`,
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (e) {
    // 字段已存在，忽略错误
  }
}

function normalizeRevision(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function safeParsePagesJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function buildPagesRecord(row) {
  if (!row) return null;
  return {
    pagesConfig: safeParsePagesJson(row.pages_json),
    revision: normalizeRevision(row.revision),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || null,
    updatedBySession: row.updated_by_session || null
  };
}

function snapshotPagesRevision(projectId, row) {
  if (!row || !row.pages_json) return;
  db.prepare(`
    INSERT OR IGNORE INTO project_page_revisions
      (project_id, revision, pages_json, updated_by, updated_by_session, created_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
  `).run(
    projectId,
    normalizeRevision(row.revision),
    row.pages_json,
    row.updated_by || null,
    row.updated_by_session || null,
    row.updated_at || null
  );
}

function normalizeUserId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isAdminUser(user) {
  return user?.role === 'admin';
}

function buildProject(row) {
  if (!row) return null;
  return {
    ...row,
    ownerUserId: row.owner_user_id || null,
    memberRole: row.member_role || null,
    designSystem: row.design_system ? JSON.parse(row.design_system) : null
  };
}

/**
 * 项目管理
 */
const Projects = {
  /**
   * 获取所有项目
   */
  getAll(user = null) {
    if (user && !isAdminUser(user)) {
      const userId = normalizeUserId(user.id);
      if (!userId) return [];
      return db.prepare(`
        SELECT p.id, p.name, p.description, p.design_system, p.owner_user_id,
               p.created_at, p.updated_at, pm.role AS member_role
        FROM projects p
        INNER JOIN project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = ?
        ORDER BY p.updated_at DESC
      `).all(userId).map(buildProject);
    }

    return db.prepare(`
      SELECT id, name, description, design_system, owner_user_id, created_at, updated_at
      FROM projects
      ORDER BY updated_at DESC
    `).all().map(buildProject);
  },

  /**
   * 根据 ID 获取项目
   */
  getById(id, user = null) {
    if (user && !isAdminUser(user)) {
      const userId = normalizeUserId(user.id);
      if (!userId) return null;
      return buildProject(db.prepare(`
        SELECT p.id, p.name, p.description, p.design_system, p.owner_user_id,
               p.created_at, p.updated_at, pm.role AS member_role
        FROM projects p
        INNER JOIN project_members pm ON pm.project_id = p.id
        WHERE p.id = ? AND pm.user_id = ?
      `).get(id, userId));
    }

    return buildProject(db.prepare(`
      SELECT id, name, description, design_system, owner_user_id, created_at, updated_at
      FROM projects
      WHERE id = ?
    `).get(id));
  },

  /**
   * 创建项目
   */
  create(name, description = '', ownerUserId = null) {
    const ownerId = normalizeUserId(ownerUserId);
    const result = db.prepare(`
      INSERT INTO projects (name, description, owner_user_id)
      VALUES (?, ?, ?)
    `).run(name, description, ownerId);

    if (ownerId) {
      db.prepare(`
        INSERT OR IGNORE INTO project_members (project_id, user_id, role)
        VALUES (?, ?, 'owner')
      `).run(result.lastInsertRowid, ownerId);
    }

    // 初始化空的 pages_json
    db.prepare(`
      INSERT INTO project_pages (project_id, pages_json, revision)
      VALUES (?, ?, 1)
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
   * 检查用户是否可以读取项目
   */
  userCanAccess(projectId, user) {
    if (!user) return false;
    if (isAdminUser(user)) {
      return !!this.getById(projectId);
    }
    const userId = normalizeUserId(user.id);
    if (!userId) return false;
    return !!db.prepare(`
      SELECT 1
      FROM project_members
      WHERE project_id = ? AND user_id = ?
    `).get(projectId, userId);
  },

  /**
   * 检查用户是否可以修改项目
   */
  userCanWrite(projectId, user) {
    if (!user) return false;
    if (isAdminUser(user)) {
      return !!this.getById(projectId);
    }
    const userId = normalizeUserId(user.id);
    if (!userId) return false;
    return !!db.prepare(`
      SELECT 1
      FROM project_members
      WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'editor')
    `).get(projectId, userId);
  },

  /**
   * 升级旧数据：把未归属项目挂到指定用户名下，并补齐 owner 成员关系。
   */
  assignLegacyProjectsToUser(userId) {
    const ownerId = normalizeUserId(userId);
    if (!ownerId) return 0;

    const tx = db.transaction(() => {
      const result = db.prepare(`
        UPDATE projects
        SET owner_user_id = ?
        WHERE owner_user_id IS NULL
      `).run(ownerId);

      const rows = db.prepare(`
        SELECT id, owner_user_id
        FROM projects
        WHERE owner_user_id IS NOT NULL
      `).all();

      const insert = db.prepare(`
        INSERT OR IGNORE INTO project_members (project_id, user_id, role)
        VALUES (?, ?, 'owner')
      `);
      for (const row of rows) {
        insert.run(row.id, row.owner_user_id);
      }

      return result.changes;
    });

    return tx();
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
   * 仅刷新 updated_at（用于 HTML 替换等不改变元数据但应记录"被修改"的场景）
   */
  touch(id) {
    return db.prepare(`
      UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);
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
    const record = this.getPagesRecord(projectId);
    return record ? record.pagesConfig : null;
  },

  /**
   * 获取项目 pages.json 及版本信息
   */
  getPagesRecord(projectId) {
    const row = db.prepare(`
      SELECT pages_json, revision, updated_at, updated_by, updated_by_session
      FROM project_pages
      WHERE project_id = ?
    `).get(projectId);

    return buildPagesRecord(row);
  },

  /**
   * 保存项目的 pages.json
   */
  savePagesJson(projectId, pagesConfig, meta = {}) {
    const exists = db.prepare(`
      SELECT pages_json, revision, updated_at, updated_by, updated_by_session
      FROM project_pages
      WHERE project_id = ?
    `).get(projectId);

    if (exists) {
      snapshotPagesRevision(projectId, exists);
      return db.prepare(`
        UPDATE project_pages
        SET pages_json = ?,
            revision = COALESCE(revision, 1) + 1,
            updated_by = ?,
            updated_by_session = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
      `).run(
        JSON.stringify(pagesConfig),
        meta.editorName || null,
        meta.sessionId || null,
        projectId
      );
    } else {
      return db.prepare(`
        INSERT INTO project_pages (project_id, pages_json, revision, updated_by, updated_by_session)
        VALUES (?, ?, 1, ?, ?)
      `).run(
        projectId,
        JSON.stringify(pagesConfig),
        meta.editorName || null,
        meta.sessionId || null
      );
    }
  },

  /**
   * 按版本号保存 pages.json，防止旧数据覆盖新数据
   */
  savePagesJsonIfRevision(projectId, pagesConfig, expectedRevision, meta = {}) {
    const tx = db.transaction(() => {
      const current = db.prepare(`
        SELECT pages_json, revision, updated_at, updated_by, updated_by_session
        FROM project_pages
        WHERE project_id = ?
      `).get(projectId);
      const requestedRevision = Number.parseInt(expectedRevision, 10);

      if (!current) {
        if (requestedRevision !== 0) {
          return {
            ok: false,
            conflict: true,
            current: null
          };
        }
        db.prepare(`
          INSERT INTO project_pages (project_id, pages_json, revision, updated_by, updated_by_session)
          VALUES (?, ?, 1, ?, ?)
        `).run(
          projectId,
          JSON.stringify(pagesConfig),
          meta.editorName || null,
          meta.sessionId || null
        );
        return { ok: true, record: this.getPagesRecord(projectId) };
      }

      const currentRevision = normalizeRevision(current.revision);
      if (requestedRevision !== currentRevision) {
        return {
          ok: false,
          conflict: true,
          current: buildPagesRecord(current)
        };
      }

      snapshotPagesRevision(projectId, current);

      const result = db.prepare(`
        UPDATE project_pages
        SET pages_json = ?,
            revision = COALESCE(revision, 1) + 1,
            updated_by = ?,
            updated_by_session = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND revision = ?
      `).run(
        JSON.stringify(pagesConfig),
        meta.editorName || null,
        meta.sessionId || null,
        projectId,
        currentRevision
      );

      if (result.changes === 0) {
        return {
          ok: false,
          conflict: true,
          current: this.getPagesRecord(projectId)
        };
      }

      return { ok: true, record: this.getPagesRecord(projectId) };
    });

    return tx();
  },

  /**
   * 获取历史版本列表
   */
  getPageRevisions(projectId, limit = 30) {
    return db.prepare(`
      SELECT id, project_id, revision, updated_by, updated_by_session, created_at
      FROM project_page_revisions
      WHERE project_id = ?
      ORDER BY revision DESC
      LIMIT ?
    `).all(projectId, Math.max(1, Math.min(Number.parseInt(limit, 10) || 30, 100)));
  },

  /**
   * 获取指定历史版本
   */
  getPageRevision(projectId, revision) {
    const row = db.prepare(`
      SELECT project_id, revision, pages_json, updated_by, updated_by_session, created_at
      FROM project_page_revisions
      WHERE project_id = ? AND revision = ?
    `).get(projectId, revision);

    return row ? {
      ...row,
      pagesConfig: safeParsePagesJson(row.pages_json)
    } : null;
  },

  /**
   * 恢复到指定历史版本，恢复操作本身会生成一个新版本
   */
  restorePageRevision(projectId, revision, meta = {}) {
    const tx = db.transaction(() => {
      const target = db.prepare(`
        SELECT pages_json
        FROM project_page_revisions
        WHERE project_id = ? AND revision = ?
      `).get(projectId, revision);

      if (!target || !target.pages_json) return null;

      const current = db.prepare(`
        SELECT pages_json, revision, updated_at, updated_by, updated_by_session
        FROM project_pages
        WHERE project_id = ?
      `).get(projectId);

      if (current) {
        snapshotPagesRevision(projectId, current);
        db.prepare(`
          UPDATE project_pages
          SET pages_json = ?,
              revision = COALESCE(revision, 1) + 1,
              updated_by = ?,
              updated_by_session = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).run(target.pages_json, meta.editorName || null, meta.sessionId || null, projectId);
      } else {
        db.prepare(`
          INSERT INTO project_pages (project_id, pages_json, revision, updated_by, updated_by_session)
          VALUES (?, ?, 1, ?, ?)
        `).run(projectId, target.pages_json, meta.editorName || null, meta.sessionId || null);
      }

      return this.getPagesRecord(projectId);
    });

    return tx();
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
        isCurrentEditor: false,
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

    return { success: true, isCurrentEditor: true, currentEditor: editorName };
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
    return { success: true, isCurrentEditor: true, currentEditor: editorName };
  }
};

const crypto = require('crypto');

/**
 * scrypt 密码哈希；存储格式 `scrypt$N$r$p$saltHex$hashHex`
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, Nstr, rstr, pstr, saltHex, hashHex] = parts;
  const N = Number.parseInt(Nstr, 10);
  const r = Number.parseInt(rstr, 10);
  const p = Number.parseInt(pstr, 10);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  return crypto.timingSafeEqual(expected, actual);
}

const Users = {
  count() {
    return db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  },
  getByUsername(username) {
    return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) || null;
  },
  getById(id) {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) || null;
  },
  list() {
    return db.prepare(`SELECT id, username, role, created_at, updated_at FROM users ORDER BY id`).all();
  },
  getFirstAdmin() {
    return db.prepare(`SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get() || null;
  },
  getFirst() {
    return db.prepare(`SELECT * FROM users ORDER BY id LIMIT 1`).get() || null;
  },
  create({ username, password, role = 'user' }) {
    const passwordHash = hashPassword(password);
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
    `).run(username, passwordHash, role);
    return info.lastInsertRowid;
  },
  updatePassword(id, password) {
    db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(hashPassword(password), id);
  },
  updateRole(id, role) {
    db.prepare(`UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(role, id);
  },
  delete(id) {
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  },
  verifyPassword,
};

module.exports = {
  db,
  Projects,
  EditSessions,
  Users,
};
