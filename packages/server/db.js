/**
 * 数据库模块
 * 使用 SQLite 存储项目信息
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const { DB_PATH } = require('./paths');

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

  CREATE TABLE IF NOT EXISTS figma_import_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id TEXT NOT NULL UNIQUE,
    token_secret_hash TEXT NOT NULL,
    token_preview TEXT,
    project_scope TEXT NOT NULL DEFAULT 'selected',
    allowed_project_ids TEXT,
    created_by_user_id INTEGER,
    created_by_name TEXT,
    expires_at TEXT NOT NULL,
    revoked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    last_used_project_id INTEGER,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
  CREATE INDEX IF NOT EXISTS idx_figma_import_tokens_token_id ON figma_import_tokens(token_id);
  CREATE INDEX IF NOT EXISTS idx_figma_import_tokens_created_by ON figma_import_tokens(created_by_user_id);
  CREATE INDEX IF NOT EXISTS idx_figma_import_tokens_expires_at ON figma_import_tokens(expires_at);
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

function defaultPagesConfig(projectName = 'My App') {
  return {
    projectName,
    targetPlatform: ['flutter'],
    designSystem: {},
    sharedComponents: [],
    htmlFiles: [],
    pageGroups: []
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function entityHash(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizePagesConfig(pagesConfig, projectName = 'My App') {
  const fallback = defaultPagesConfig(projectName);
  return {
    ...fallback,
    ...(pagesConfig || {}),
    targetPlatform: pagesConfig?.targetPlatform || fallback.targetPlatform,
    designSystem: pagesConfig?.designSystem || fallback.designSystem,
    sharedComponents: pagesConfig?.sharedComponents || fallback.sharedComponents,
    htmlFiles: Array.isArray(pagesConfig?.htmlFiles) ? pagesConfig.htmlFiles : [],
    pageGroups: Array.isArray(pagesConfig?.pageGroups) ? pagesConfig.pageGroups : []
  };
}

function buildGroupEntity(pagesConfig) {
  const normalized = normalizePagesConfig(pagesConfig);
  return {
    pageGroups: normalized.pageGroups,
    assignments: normalized.htmlFiles
      .map((file) => ({
        path: file.path,
        groupId: file.groupId ?? null,
        isPrimaryState: !!file.isPrimaryState
      }))
      .filter((item) => item.path)
      .sort((a, b) => String(a.path).localeCompare(String(b.path)))
  };
}

function buildPagesHashes(pagesConfig) {
  const normalized = normalizePagesConfig(pagesConfig);
  const files = {};
  for (const file of normalized.htmlFiles) {
    if (file?.path) files[file.path] = entityHash(file);
  }
  return {
    files,
    groups: entityHash(buildGroupEntity(normalized))
  };
}

function normalizeUserId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isAdminUser(user) {
  return user?.role === 'admin';
}

function normalizeMemberRole(role) {
  return ['owner', 'editor', 'viewer'].includes(role) ? role : null;
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
   * 检查用户是否可以管理项目成员
   */
  userCanManageMembers(projectId, user) {
    if (!user) return false;
    if (isAdminUser(user)) {
      return !!this.getById(projectId);
    }
    const userId = normalizeUserId(user.id);
    if (!userId) return false;
    return !!db.prepare(`
      SELECT 1
      FROM project_members
      WHERE project_id = ? AND user_id = ? AND role = 'owner'
    `).get(projectId, userId);
  },

  /**
   * 获取项目成员列表
   */
  listMembers(projectId) {
    return db.prepare(`
      SELECT pm.project_id, pm.user_id, pm.role, pm.created_at,
             u.username, u.role AS user_role
      FROM project_members pm
      INNER JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY
        CASE pm.role WHEN 'owner' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END,
        u.username COLLATE NOCASE
    `).all(projectId);
  },

  /**
   * 添加或更新项目成员
   */
  setMember(projectId, userId, role) {
    const memberUserId = normalizeUserId(userId);
    const memberRole = normalizeMemberRole(role);
    if (!memberUserId || !memberRole) return { ok: false, error: '成员或角色无效' };

    const tx = db.transaction(() => {
      const project = db.prepare(`SELECT id, owner_user_id FROM projects WHERE id = ?`).get(projectId);
      if (!project) return { ok: false, error: '项目不存在' };
      const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(memberUserId);
      if (!user) return { ok: false, error: '用户不存在' };

      const existing = db.prepare(`
        SELECT role FROM project_members WHERE project_id = ? AND user_id = ?
      `).get(projectId, memberUserId);
      if (existing?.role === 'owner' && memberRole !== 'owner') {
        const ownerCount = db.prepare(`
          SELECT COUNT(*) AS n FROM project_members WHERE project_id = ? AND role = 'owner'
        `).get(projectId).n;
        if (ownerCount <= 1) return { ok: false, error: '至少保留一名项目 owner' };
      }

      db.prepare(`
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role
      `).run(projectId, memberUserId, memberRole);

      if (memberRole === 'owner' && project.owner_user_id !== memberUserId) {
        db.prepare(`UPDATE projects SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(memberUserId, projectId);
      }

      return { ok: true };
    });

    return tx();
  },

  /**
   * 移除项目成员
   */
  removeMember(projectId, userId) {
    const memberUserId = normalizeUserId(userId);
    if (!memberUserId) return { ok: false, error: '成员无效' };

    const tx = db.transaction(() => {
      const member = db.prepare(`
        SELECT role FROM project_members WHERE project_id = ? AND user_id = ?
      `).get(projectId, memberUserId);
      if (!member) return { ok: false, error: '成员不存在' };

      if (member.role === 'owner') {
        const ownerCount = db.prepare(`
          SELECT COUNT(*) AS n FROM project_members WHERE project_id = ? AND role = 'owner'
        `).get(projectId).n;
        if (ownerCount <= 1) return { ok: false, error: '至少保留一名项目 owner' };
      }

      db.prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`)
        .run(projectId, memberUserId);

      const project = db.prepare(`SELECT owner_user_id FROM projects WHERE id = ?`).get(projectId);
      if (project?.owner_user_id === memberUserId) {
        const nextOwner = db.prepare(`
          SELECT user_id FROM project_members
          WHERE project_id = ? AND role = 'owner'
          ORDER BY created_at, user_id
          LIMIT 1
        `).get(projectId);
        db.prepare(`UPDATE projects SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(nextOwner?.user_id || null, projectId);
      }

      return { ok: true };
    });

    return tx();
  },

  /**
   * 升级旧数据：把未归属项目挂到指定用户名下，并补齐 owner 成员关系。
   */
  assignLegacyProjectsToUser(userId) {
    const ownerId = normalizeUserId(userId);
    if (!ownerId) return 0;

    const tx = db.transaction(() => {
      // 清理指向已删除用户的悬空 owner_user_id（FK 添加前的历史数据可能存在）
      db.prepare(`
        UPDATE projects
        SET owner_user_id = NULL
        WHERE owner_user_id IS NOT NULL
          AND owner_user_id NOT IN (SELECT id FROM users)
      `).run();

      const result = db.prepare(`
        UPDATE projects
        SET owner_user_id = ?
        WHERE owner_user_id IS NULL
      `).run(ownerId);

      const rows = db.prepare(`
        SELECT p.id, p.owner_user_id
        FROM projects p
        INNER JOIN users u ON u.id = p.owner_user_id
        WHERE p.owner_user_id IS NOT NULL
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

  getPagesHashes(pagesConfig) {
    return buildPagesHashes(pagesConfig);
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
   * 按单页 hash 保存一个 htmlFiles 项；只有目标页面变更时才冲突。
   */
  savePageFileIfHash(projectId, filePath, fileConfig, expectedHash, meta = {}, fallbackConfig = null) {
    const tx = db.transaction(() => {
      const current = db.prepare(`
        SELECT pages_json, revision, updated_at, updated_by, updated_by_session
        FROM project_pages
        WHERE project_id = ?
      `).get(projectId);

      const pagesConfig = normalizePagesConfig(
        current ? safeParsePagesJson(current.pages_json) : fallbackConfig,
        fallbackConfig?.projectName
      );
      const files = pagesConfig.htmlFiles || [];
      const index = files.findIndex((file) => file?.path === filePath);
      const currentFile = index >= 0 ? files[index] : null;
      const currentHash = currentFile ? entityHash(currentFile) : null;
      const requestedHash = expectedHash || null;

      if (requestedHash !== currentHash) {
        return {
          ok: false,
          conflict: true,
          current: current ? buildPagesRecord(current) : {
            pagesConfig,
            revision: 0,
            updatedAt: null,
            updatedBy: null,
            updatedBySession: null
          },
          currentFile,
          currentHash
        };
      }

      const nextFile = { ...(fileConfig || {}), path: filePath };
      if (index >= 0) files[index] = nextFile;
      else files.push(nextFile);
      const nextConfig = { ...pagesConfig, htmlFiles: files };

      if (current) {
        db.prepare(`
          UPDATE project_pages
          SET pages_json = ?,
              revision = COALESCE(revision, 1) + 1,
              updated_by = ?,
              updated_by_session = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).run(JSON.stringify(nextConfig), meta.editorName || null, meta.sessionId || null, projectId);
      } else {
        db.prepare(`
          INSERT INTO project_pages (project_id, pages_json, revision, updated_by, updated_by_session)
          VALUES (?, ?, 1, ?, ?)
        `).run(projectId, JSON.stringify(nextConfig), meta.editorName || null, meta.sessionId || null);
      }

      return {
        ok: true,
        record: this.getPagesRecord(projectId),
        fileHash: entityHash(nextFile)
      };
    });

    return tx();
  },

  /**
   * 按分组结构 hash 保存 pageGroups 与文件分组归属。
   */
  savePageGroupsIfHash(projectId, pageGroups, assignments, expectedHash, meta = {}, fallbackConfig = null) {
    const tx = db.transaction(() => {
      const current = db.prepare(`
        SELECT pages_json, revision, updated_at, updated_by, updated_by_session
        FROM project_pages
        WHERE project_id = ?
      `).get(projectId);

      const pagesConfig = normalizePagesConfig(
        current ? safeParsePagesJson(current.pages_json) : fallbackConfig,
        fallbackConfig?.projectName
      );
      const currentHash = entityHash(buildGroupEntity(pagesConfig));
      const requestedHash = expectedHash || null;

      if (requestedHash !== currentHash) {
        return {
          ok: false,
          conflict: true,
          current: current ? buildPagesRecord(current) : {
            pagesConfig,
            revision: 0,
            updatedAt: null,
            updatedBy: null,
            updatedBySession: null
          },
          currentHash
        };
      }

      const assignmentMap = new Map(
        (Array.isArray(assignments) ? assignments : [])
          .filter((item) => item?.path)
          .map((item) => [item.path, item])
      );
      const nextFiles = pagesConfig.htmlFiles.map((file) => {
        const item = assignmentMap.get(file.path);
        if (!item) return file;
        return {
          ...file,
          groupId: item.groupId ?? null,
          isPrimaryState: !!item.isPrimaryState
        };
      });
      const nextConfig = {
        ...pagesConfig,
        pageGroups: Array.isArray(pageGroups) ? pageGroups : [],
        htmlFiles: nextFiles
      };

      if (current) {
        db.prepare(`
          UPDATE project_pages
          SET pages_json = ?,
              revision = COALESCE(revision, 1) + 1,
              updated_by = ?,
              updated_by_session = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).run(JSON.stringify(nextConfig), meta.editorName || null, meta.sessionId || null, projectId);
      } else {
        db.prepare(`
          INSERT INTO project_pages (project_id, pages_json, revision, updated_by, updated_by_session)
          VALUES (?, ?, 1, ?, ?)
        `).run(projectId, JSON.stringify(nextConfig), meta.editorName || null, meta.sessionId || null);
      }

      return {
        ok: true,
        record: this.getPagesRecord(projectId),
        groupsHash: entityHash(buildGroupEntity(nextConfig))
      };
    });

    return tx();
  },

};

function hashFigmaImportSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

function timingSafeHexEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
  } catch {
    return false;
  }
}

function safeParseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildFigmaTokenStatus(row) {
  const expiresAtMs = Date.parse(row.expires_at);
  const isExpired = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
  if (row.revoked_at) return 'revoked';
  return isExpired ? 'expired' : 'active';
}

function buildFigmaImportToken(row) {
  if (!row) return null;
  const allowedProjectIds = safeParseJsonArray(row.allowed_project_ids)
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  const status = buildFigmaTokenStatus(row);
  return {
    id: row.id,
    tokenId: row.token_id,
    tokenPreview: row.token_preview || (row.token_id ? `aps1.${row.token_id}` : ''),
    projectScope: row.project_scope || 'selected',
    allowedProjectIds,
    projectCount: row.project_scope === 'all' ? null : allowedProjectIds.length,
    createdByUserId: row.created_by_user_id || null,
    createdByName: row.created_by_name || null,
    username: row.created_by_name || row.username || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null,
    lastUsedAt: row.last_used_at || null,
    lastUsedProjectId: row.last_used_project_id || null,
    status,
    isExpired: status === 'expired',
    isRevoked: status === 'revoked'
  };
}

function normalizeFigmaTtlMinutes(value) {
  const ttl = Number.parseInt(value, 10);
  return Math.max(5, Math.min(Number.isFinite(ttl) ? ttl : 720, 30 * 24 * 60));
}

function buildFigmaExpiry(ttlMinutes, baseMs = Date.now()) {
  return new Date(baseMs + normalizeFigmaTtlMinutes(ttlMinutes) * 60 * 1000).toISOString();
}

function decodeFigmaTokenPayload(raw) {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseFigmaImportToken(token) {
  const value = String(token || '').trim();
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'aps1') return null;
  if (!parts[1] || !parts[2]) return null;
  const payload = decodeFigmaTokenPayload(parts[1]);
  const tokenId = payload && payload.tid ? String(payload.tid) : parts[1];
  return {
    tokenId,
    secret: parts[2]
  };
}

function projectIdsForToken(tokenRecord) {
  if (!tokenRecord) return [];
  if (tokenRecord.projectScope === 'all') {
    return Projects.getAll().map((project) => project.id);
  }
  return tokenRecord.allowedProjectIds || [];
}

function tokenCanAccessProject(tokenRecord, projectId) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0 || !tokenRecord) return false;
  if (tokenRecord.projectScope === 'all') return !!Projects.getById(pid);
  return (tokenRecord.allowedProjectIds || []).includes(pid);
}

function getFigmaTokenRowForUser(tokenId, user) {
  const id = Number.parseInt(tokenId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const isAdmin = isAdminUser(user);
  const userId = normalizeUserId(user?.id);
  if (!isAdmin && !userId) return null;

  const sql = `
    SELECT t.id, t.token_id, t.token_secret_hash, t.token_preview, t.project_scope,
           t.allowed_project_ids, t.created_by_user_id, t.created_by_name, t.expires_at,
           t.revoked_at, t.created_at, t.last_used_at, t.last_used_project_id, u.username
    FROM figma_import_tokens t
    LEFT JOIN users u ON u.id = t.created_by_user_id
    WHERE t.id = ? ${isAdmin ? '' : 'AND t.created_by_user_id = ?'}
  `;
  return isAdmin ? db.prepare(sql).get(id) : db.prepare(sql).get(id, userId);
}

const FigmaImportTokens = {
  create({ createdByUser = null, allowedProjectIds = [], projectScope = 'selected', ttlMinutes = 720 } = {}) {
    const tokenId = crypto.randomBytes(9).toString('base64url');
    const secret = crypto.randomBytes(32).toString('base64url');
    const token = `aps1.${tokenId}.${secret}`;
    const tokenSecretHash = hashFigmaImportSecret(secret);
    const tokenPreview = `aps1.${tokenId}...${secret.slice(-4)}`;
    const expiresAt = buildFigmaExpiry(ttlMinutes);
    const creatorId = normalizeUserId(createdByUser?.id);
    const createdByName = createdByUser?.username || null;
    const normalizedScope = projectScope === 'all' ? 'all' : 'selected';
    const normalizedProjectIds = [...new Set((allowedProjectIds || [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0))];

    const result = db.prepare(`
      INSERT INTO figma_import_tokens (
        token_id, token_secret_hash, token_preview, project_scope, allowed_project_ids,
        created_by_user_id, created_by_name, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tokenId,
      tokenSecretHash,
      tokenPreview,
      normalizedScope,
      normalizedScope === 'all' ? null : JSON.stringify(normalizedProjectIds),
      creatorId,
      createdByName,
      expiresAt
    );

    return {
      id: result.lastInsertRowid,
      token,
      tokenId,
      tokenPreview,
      projectScope: normalizedScope,
      allowedProjectIds: normalizedProjectIds,
      projectCount: normalizedScope === 'all' ? null : normalizedProjectIds.length,
      createdByUserId: creatorId,
      createdByName,
      expiresAt
    };
  },

  verify(token) {
    const parsed = parseFigmaImportToken(token);
    if (!parsed) return null;
    const row = db.prepare(`
      SELECT t.id, t.token_id, t.token_secret_hash, t.token_preview, t.project_scope,
             t.allowed_project_ids, t.created_by_user_id, t.created_by_name, t.expires_at,
             t.revoked_at, t.created_at, t.last_used_at, t.last_used_project_id, u.username
      FROM figma_import_tokens t
      LEFT JOIN users u ON u.id = t.created_by_user_id
      WHERE t.token_id = ?
    `).get(parsed.tokenId);
    if (!row) return null;
    if (!timingSafeHexEqual(hashFigmaImportSecret(parsed.secret), row.token_secret_hash)) return null;

    const record = buildFigmaImportToken(row);
    if (!record || record.status !== 'active') return null;
    return record;
  },

  markUsed(tokenId, projectId) {
    if (!tokenId) return;
    const pid = Number.parseInt(projectId, 10) || null;
    db.prepare(`
      UPDATE figma_import_tokens
      SET last_used_at = CURRENT_TIMESTAMP,
          last_used_project_id = ?
      WHERE token_id = ?
    `).run(pid, tokenId);
  },

  listForUser(user) {
    const isAdmin = isAdminUser(user);
    const userId = normalizeUserId(user?.id);
    const sql = `
      SELECT t.id, t.token_id, t.token_preview, t.project_scope, t.allowed_project_ids,
             t.created_by_user_id, t.created_by_name, t.expires_at, t.revoked_at,
             t.created_at, t.last_used_at, t.last_used_project_id, u.username
      FROM figma_import_tokens t
      LEFT JOIN users u ON u.id = t.created_by_user_id
      ${isAdmin ? '' : 'WHERE t.created_by_user_id = ?'}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 50
    `;
    const rows = isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(userId || -1);
    return rows.map(buildFigmaImportToken);
  },

  revokeForUser(tokenId, user) {
    const id = Number.parseInt(tokenId, 10);
    if (!Number.isFinite(id) || id <= 0) return 0;
    const isAdmin = isAdminUser(user);
    const userId = normalizeUserId(user?.id);
    const result = isAdmin
      ? db.prepare(`
          UPDATE figma_import_tokens
          SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
          WHERE id = ?
        `).run(id)
      : db.prepare(`
          UPDATE figma_import_tokens
          SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
          WHERE id = ? AND created_by_user_id = ?
        `).run(id, userId || -1);
    return result.changes || 0;
  },

  setExpiryForUser(tokenId, user, ttlMinutes) {
    const row = getFigmaTokenRowForUser(tokenId, user);
    if (!row) return null;
    const expiresAt = buildFigmaExpiry(ttlMinutes);
    db.prepare(`
      UPDATE figma_import_tokens
      SET expires_at = ?
      WHERE id = ?
    `).run(expiresAt, row.id);
    return buildFigmaImportToken({ ...row, expires_at: expiresAt });
  },

  renewForUser(tokenId, user, ttlMinutes) {
    const row = getFigmaTokenRowForUser(tokenId, user);
    if (!row) return null;
    const currentExpiryMs = Date.parse(row.expires_at);
    const baseMs = Number.isFinite(currentExpiryMs) ? Math.max(Date.now(), currentExpiryMs) : Date.now();
    const expiresAt = buildFigmaExpiry(ttlMinutes, baseMs);
    db.prepare(`
      UPDATE figma_import_tokens
      SET expires_at = ?
      WHERE id = ?
    `).run(expiresAt, row.id);
    return buildFigmaImportToken({ ...row, expires_at: expiresAt });
  },

  deleteForUser(tokenId, user) {
    const id = Number.parseInt(tokenId, 10);
    if (!Number.isFinite(id) || id <= 0) return 0;
    const isAdmin = isAdminUser(user);
    const userId = normalizeUserId(user?.id);
    if (!isAdmin && !userId) return 0;
    const result = isAdmin
      ? db.prepare(`DELETE FROM figma_import_tokens WHERE id = ?`).run(id)
      : db.prepare(`DELETE FROM figma_import_tokens WHERE id = ? AND created_by_user_id = ?`).run(id, userId);
    return result.changes || 0;
  },

  projectsForToken(tokenRecord) {
    const ids = projectIdsForToken(tokenRecord);
    const projects = [];
    for (const id of ids) {
      const project = Projects.getById(id);
      if (project) projects.push(project);
    }
    return projects;
  },

  tokenCanAccessProject
};

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
    const tx = db.transaction(() => {
      // 显式清理用户在所有项目中的成员关系（兼容历史上未启用 FK 的数据）
      db.prepare(`DELETE FROM project_members WHERE user_id = ?`).run(id);
      // 将该用户拥有的项目 owner 置空（FK 为 SET NULL，这里显式确保）
      db.prepare(`UPDATE projects SET owner_user_id = NULL WHERE owner_user_id = ?`).run(id);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    });
    tx();
  },
  verifyPassword,
};

module.exports = {
  db,
  Projects,
  Users,
  FigmaImportTokens,
};
