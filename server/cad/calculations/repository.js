import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrateDatabase } from './migrations.js';

const APPLICATION_VERSION = '2.0.1';
const ALGORITHM_VERSION = 'geometry-2.0/contact-3.0/feature-4.0';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceFileName: row.source_file_name,
    sourceFileHash: row.source_hash,
    sourceFileSize: Number(row.source_size),
    sourceRef: row.source_ref,
    meshRef: row.mesh_ref,
    revisionNumber: Number(row.revision_number),
    applicationVersion: row.application_version,
    algorithmVersion: row.algorithm_version,
    payload: JSON.parse(row.payload_json),
  };
}

export function sanitizeCalculationName(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('Название расчёта должно быть строкой'), { code: 'INVALID_CALCULATION_NAME' });
  const name = [...value].map((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 160) throw Object.assign(new Error('Название расчёта должно содержать от 1 до 160 символов'), { code: 'INVALID_CALCULATION_NAME' });
  return name;
}

export function assertCalculationId(id) {
  if (!ID_PATTERN.test(id ?? '')) throw Object.assign(new Error('Некорректный идентификатор расчёта'), { code: 'CALCULATION_NOT_FOUND' });
  return id;
}

export class CalculationRepository {
  constructor(config) {
    this.config = config;
    fs.mkdirSync(config.calculationStoragePath, { recursive: true, mode: 0o700 });
    this.database = migrateDatabase(config.databasePath);
    void this.cleanupExpiredSources().catch(() => undefined);
  }

  close() { this.database.close(); }

  resolveStorageRef(reference) {
    if (typeof reference !== 'string' || reference.includes('..') || path.isAbsolute(reference)) throw Object.assign(new Error('Некорректная ссылка хранилища'), { code: 'CALCULATION_NOT_FOUND' });
    const root = path.resolve(this.config.calculationStoragePath);
    const resolved = path.resolve(root, reference);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error('Выход за пределы хранилища запрещён'), { code: 'CALCULATION_NOT_FOUND' });
    return resolved;
  }

  resolveOwnedStorageRef(calculation, reference) {
    const segments = typeof reference === 'string' ? reference.split('/') : [];
    const roots = new Set(['source-files', 'viewer-mesh', 'previews', 'reports']);
    if (segments.length < 3 || !roots.has(segments[0]) || segments[1] !== calculation.id) throw Object.assign(new Error('Файл не принадлежит расчёту'), { code: 'CALCULATION_NOT_FOUND' });
    return this.resolveStorageRef(reference);
  }

  async createFromJob(job, name = job.originalName) {
    if (job.status !== 'completed') throw Object.assign(new Error('Расчёт ещё не завершён'), { code: 'CALCULATION_NOT_READY' });
    const id = randomUUID();
    const now = new Date().toISOString();
    const sourceRef = `source-files/${id}/source${job.extension}`;
    const meshRef = `viewer-mesh/${id}/viewer-mesh.json`;
    await fsp.mkdir(path.dirname(this.resolveStorageRef(sourceRef)), { recursive: true, mode: 0o700 });
    await fsp.mkdir(path.dirname(this.resolveStorageRef(meshRef)), { recursive: true, mode: 0o700 });
    await fsp.copyFile(path.join(this.config.uploadDir, job.storedName), this.resolveStorageRef(sourceRef));
    await fsp.writeFile(this.resolveStorageRef(meshRef), JSON.stringify(job.viewerMesh ?? { available: false }), { mode: 0o600 });
    const payload = {
      status: 'completed',
      source: { name: job.originalName, hash: job.diagnostics.modelHash, sizeBytes: job.size, format: job.extension },
      diagnostics: job.diagnostics,
      contacts: job.contacts,
      contactSummary: job.contactSummary,
      contactStatistics: job.contactStatistics,
      features: job.features,
      featureSummary: job.featureSummary,
      featureStatistics: job.featureStatistics,
      featureRules: job.featureRules,
      contactSettings: this.config.contact,
      faceCatalog: job.faceCatalog,
      warnings: job.diagnostics.warnings,
      sourceRetained: true,
      reportVersion: '1.0.0',
      versions: {
        applicationVersion: APPLICATION_VERSION,
        geometryAlgorithmVersion: '2.0.0',
        contactAlgorithmVersion: '3.0.0',
        featureAlgorithmVersion: '4.0.0',
        reportSchemaVersion: '1.0.0',
        viewerMeshVersion: job.viewerMesh?.meshVersion ?? '1.0.0',
      },
      decisionHistory: [],
      paintIntegration: null,
    };
    const insert = this.database.prepare(`INSERT INTO calculations
      (id,name,status,created_at,updated_at,source_file_name,source_hash,source_size,source_ref,mesh_ref,payload_json,revision_number,application_version,algorithm_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(id, sanitizeCalculationName(name), 'completed', now, now, job.originalName, job.diagnostics.modelHash, job.size, sourceRef, meshRef, JSON.stringify(payload), 1, APPLICATION_VERSION, ALGORITHM_VERSION);
    this.database.prepare(`INSERT INTO revisions
      (id,calculation_id,revision_number,created_at,reason,settings_json,summary_json,algorithm_version,parent_revision_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), id, 1, now, 'initial_calculation', JSON.stringify({ featureRules: job.featureRules, contactSettings: this.config.contact }), JSON.stringify(job.featureSummary), ALGORITHM_VERSION, null);
    return this.get(id);
  }

  get(id) {
    assertCalculationId(id);
    return parseRow(this.database.prepare('SELECT * FROM calculations WHERE id = ?').get(id));
  }

  list({ page = 1, pageSize = 20, search = '', status = '', sort = 'updated_desc' } = {}) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)));
    const order = sort === 'created_asc' ? 'created_at ASC' : sort === 'created_desc' ? 'created_at DESC' : sort === 'updated_asc' ? 'updated_at ASC' : 'updated_at DESC';
    const where = [];
    const values = [];
    if (search) { where.push('name LIKE ? ESCAPE \'\\\''); values.push(`%${String(search).replace(/[\\%_]/g, '\\$&')}%`); }
    if (status) { where.push('status = ?'); values.push(String(status)); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM calculations ${clause}`).get(...values).count);
    const rows = this.database.prepare(`SELECT * FROM calculations ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values, safeSize, (safePage - 1) * safeSize);
    return { items: rows.map(parseRow), page: safePage, pageSize: safeSize, total };
  }

  async update(id, { name, payload, status, mesh, revisionReason, revisionSettings } = {}) {
    const current = this.get(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const nextRevision = revisionReason ? current.revisionNumber + 1 : current.revisionNumber;
    if (mesh) await fsp.writeFile(this.resolveStorageRef(current.meshRef), JSON.stringify(mesh), { mode: 0o600 });
    this.database.prepare(`UPDATE calculations SET name=?, status=?, updated_at=?, payload_json=?, revision_number=? WHERE id=?`).run(
      name === undefined ? current.name : sanitizeCalculationName(name),
      status ?? current.status,
      now,
      JSON.stringify(payload ?? current.payload),
      nextRevision,
      id,
    );
    if (revisionReason) {
      const parent = this.database.prepare('SELECT id FROM revisions WHERE calculation_id=? AND revision_number=?').get(id, current.revisionNumber);
      this.database.prepare(`INSERT INTO revisions
        (id,calculation_id,revision_number,created_at,reason,settings_json,summary_json,algorithm_version,parent_revision_id)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), id, nextRevision, now, revisionReason, JSON.stringify(revisionSettings ?? {}), JSON.stringify((payload ?? current.payload).featureSummary ?? {}), ALGORITHM_VERSION, parent?.id ?? null);
    }
    return this.get(id);
  }

  recordDecision(id, entry) {
    const createdAt = new Date().toISOString();
    this.database.prepare(`INSERT INTO decision_history
      (calculation_id,action,entity_type,entity_id,previous_status,new_status,created_at) VALUES (?,?,?,?,?,?,?)`).run(
      id, entry.action, entry.entityType, entry.entityId, entry.previousStatus ?? null, entry.newStatus ?? null, createdAt,
    );
    return createdAt;
  }

  revisions(id) {
    assertCalculationId(id);
    return this.database.prepare('SELECT id, revision_number AS revisionNumber, created_at AS createdAt, reason, settings_json AS settingsJson, summary_json AS summaryJson, algorithm_version AS algorithmVersion, parent_revision_id AS parentRevisionId FROM revisions WHERE calculation_id=? ORDER BY revision_number').all(id).map((row) => ({ ...row, settings: JSON.parse(row.settingsJson), summary: JSON.parse(row.summaryJson), settingsJson: undefined, summaryJson: undefined }));
  }

  async duplicate(id) {
    const current = this.get(id);
    if (!current) return null;
    const duplicateId = randomUUID();
    const now = new Date().toISOString();
    const extension = path.extname(current.sourceRef);
    const sourceRef = `source-files/${duplicateId}/source${extension}`;
    const meshRef = `viewer-mesh/${duplicateId}/viewer-mesh.json`;
    await fsp.mkdir(path.dirname(this.resolveStorageRef(sourceRef)), { recursive: true, mode: 0o700 });
    await fsp.mkdir(path.dirname(this.resolveStorageRef(meshRef)), { recursive: true, mode: 0o700 });
    await fsp.copyFile(this.resolveOwnedStorageRef(current, current.sourceRef), this.resolveStorageRef(sourceRef));
    await fsp.copyFile(this.resolveOwnedStorageRef(current, current.meshRef), this.resolveStorageRef(meshRef));
    const payload = structuredClone(current.payload);
    if (payload.preview?.storageRef) {
      const previewRef = `previews/${duplicateId}/report-preview${path.extname(payload.preview.storageRef)}`;
      await fsp.mkdir(path.dirname(this.resolveStorageRef(previewRef)), { recursive: true, mode: 0o700 });
      await fsp.copyFile(this.resolveOwnedStorageRef(current, payload.preview.storageRef), this.resolveStorageRef(previewRef));
      payload.preview.storageRef = previewRef;
    }
    this.database.prepare(`INSERT INTO calculations
      (id,name,status,created_at,updated_at,source_file_name,source_hash,source_size,source_ref,mesh_ref,payload_json,revision_number,application_version,algorithm_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(duplicateId, sanitizeCalculationName(`${current.name} — копия`), current.status, now, now, current.sourceFileName, current.sourceFileHash, current.sourceFileSize, sourceRef, meshRef, JSON.stringify(payload), 1, current.applicationVersion, current.algorithmVersion);
    this.database.prepare(`INSERT INTO revisions
      (id,calculation_id,revision_number,created_at,reason,settings_json,summary_json,algorithm_version,parent_revision_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), duplicateId, 1, now, `duplicated_from:${id}`, '{}', JSON.stringify(current.payload.featureSummary ?? {}), current.algorithmVersion, null);
    return this.get(duplicateId);
  }

  async delete(id) {
    const current = this.get(id);
    if (!current) return false;
    this.database.prepare('DELETE FROM calculations WHERE id=?').run(id);
    for (const root of ['source-files', 'viewer-mesh', 'previews', 'reports']) await fsp.rm(this.resolveStorageRef(`${root}/${id}`), { recursive: true, force: true });
    return true;
  }

  async readMesh(calculation) { return JSON.parse(await fsp.readFile(this.resolveOwnedStorageRef(calculation, calculation.meshRef), 'utf8')); }
  async readSource(calculation) { return fsp.readFile(this.resolveOwnedStorageRef(calculation, calculation.sourceRef), 'utf8'); }

  async writePreview(calculation, bytes, metadata) {
    const previousRef = calculation.payload.preview?.storageRef;
    const storageRef = `previews/${calculation.id}/report-preview${metadata.extension}`;
    await fsp.mkdir(path.dirname(this.resolveStorageRef(storageRef)), { recursive: true, mode: 0o700 });
    await fsp.writeFile(this.resolveStorageRef(storageRef), bytes, { mode: 0o600 });
    if (previousRef && previousRef !== storageRef) await fsp.rm(this.resolveOwnedStorageRef(calculation, previousRef), { force: true });
    return this.update(calculation.id, { payload: { ...calculation.payload, preview: { ...metadata, storageRef } } });
  }

  async readPreview(calculation) {
    const preview = calculation.payload.preview;
    if (!preview?.storageRef) return null;
    return { metadata: preview, bytes: await fsp.readFile(this.resolveOwnedStorageRef(calculation, preview.storageRef)) };
  }

  async cleanupExpiredSources(now = Date.now()) {
    const retentionDays = Math.max(0, Number(this.config.sourceFileRetentionDays ?? 30));
    const cutoff = this.config.sourceFileRetentionEnabled === false ? now : now - retentionDays * 86_400_000;
    const rows = this.database.prepare('SELECT id, created_at, source_ref, payload_json FROM calculations').all();
    let removed = 0;
    for (const row of rows) {
      if (Date.parse(row.created_at) > cutoff) continue;
      await fsp.rm(this.resolveOwnedStorageRef({ id: row.id }, row.source_ref), { force: true });
      const payload = JSON.parse(row.payload_json);
      if (payload.sourceRetained !== false) {
        payload.sourceRetained = false;
        this.database.prepare('UPDATE calculations SET payload_json=? WHERE id=?').run(JSON.stringify(payload), row.id);
      }
      removed += 1;
    }
    return removed;
  }
}

export const calculationVersions = { applicationVersion: APPLICATION_VERSION, algorithmVersion: ALGORITHM_VERSION };
