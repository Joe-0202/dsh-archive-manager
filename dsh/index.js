// dsh-archive-manager — Host half.
//
// DeepSeek Harness ships native session archiving (`archiveSession`): an
// archived session keeps all of its data on disk and simply drops out of the
// active session list. The harness's own UI offers a filter ("隐藏已归档 /
// 全部对话 / 仅显示已归档") but no dedicated place to review archived
// conversations or remove the ones you no longer need. This plugin fills that
// gap with a management surface only — it never adds its own archive action,
// so archiving stays with the harness's native flow.
//
// What it does:
//   - Reads the harness's archive set (`$DSH_HOME/storages/workspace.json`
//     → `global.archivedSessionIds`) and, for each id, resolves the session's
//     display title / cwd / on-disk log directory / projection-cache state.
//   - Permanently deletes one archived session: removes its session log
//     directory and its projection cache, then drops the id from the archive
//     set so it leaves the archived filter too. The bound user workspace
//     directory (`header.cwd`) is deliberately left untouched.
//
// Deletion is idempotent: a missing log directory or cache file counts as
// already deleted. That matters because the archive set can hold "ghost"
// entries whose data was removed earlier — the panel surfaces them as
// 数据已不存在 and the same delete action simply clears the leftover id.
//
// Directory removal uses the `subprocess` service (PowerShell
// `Remove-Item -Recurse -Force` on Windows, `rm -rf` on POSIX) because the
// abstract `fs` service exposes no recursive-remove primitive.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const name = 'dsh-archive-manager';
export const inject = ['tools'];

/** Resolve the DSH data home (`~/.dsh`) with a sane fallback. */
function dshHome() {
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim()) {
    return process.env.DSH_HOME;
  }
  return join(homedir(), '.dsh');
}

/** Session log root: `$DSH_HOME/sessions`. */
function sessionsRoot() {
  return join(dshHome(), 'sessions');
}

/** Registry state file holding the archive set. */
function workspaceStateFile() {
  return join(dshHome(), 'storages', 'workspace.json');
}

/** Projection-cache directory for session-list metadata. */
function projectionCacheDir() {
  return join(dshHome(), 'storages', 'session_projcache', 'sessions');
}

/**
 * Read the harness's archive set. The file is the durable snapshot the host
 * writes back after every archive/unarchive, so it is authoritative enough for
 * a management panel. Returns an ordered array of session ids (newest archived
 * first), or an empty array when the file is missing/unreadable.
 */
function readArchivedIds() {
  try {
    const data = JSON.parse(readFileSync(workspaceStateFile(), 'utf8'));
    const ids = data?.global?.archivedSessionIds;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
  } catch {
    return [];
  }
}

/**
 * Queue file listing archived ids whose on-disk data was already deleted but
 * whose archive entry has not been dropped yet.
 *
 * Why a queue instead of unarchiving on the spot: `unarchiveSession` means
 * "return this session to the active list". The harness decides visibility by
 * whether it still holds an in-memory session object — and a session you just
 * looked at in the archive panel is still in memory even after its files are
 * gone. Unarchiving it at that moment therefore pushes a data-less ghost into
 * the active list, which fails to open with `session/not-found` until the next
 * restart. Queuing the id keeps it archived (invisible) now, and the sweep at
 * plugin start — when nothing stale is in memory — drops the entry safely.
 */
function pendingFile() {
  return join(dshHome(), 'storages', 'archive-manager-pending.json');
}

function readPending() {
  try {
    const data = JSON.parse(readFileSync(pendingFile(), 'utf8'));
    const ids = data?.pending;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
  } catch {
    return [];
  }
}

function writePending(ids) {
  try {
    mkdirSync(join(dshHome(), 'storages'), { recursive: true });
    writeFileSync(pendingFile(), JSON.stringify({ version: 1, pending: ids }, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the on-disk session log directory for a session id by scanning the
 * sessions tree (the workspace-encoded bucket name is not a public contract,
 * so it is discovered rather than re-derived). Returns the absolute path or
 * undefined.
 */
function findSessionDir(sessionId) {
  const root = sessionsRoot();
  if (!existsSync(root)) return undefined;
  let buckets;
  try {
    buckets = readdirSync(root);
  } catch {
    return undefined;
  }
  for (const bucket of buckets) {
    const candidate = join(root, bucket, sessionId);
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      /* not this bucket */
    }
  }
  return undefined;
}

/** Projection-cache file for a session id, or undefined when absent. */
function findCacheFile(sessionId) {
  const file = join(projectionCacheDir(), `${sessionId}.json`);
  try {
    if (statSync(file).isFile()) return file;
  } catch {
    /* absent */
  }
  return undefined;
}

/**
 * Best-effort read of a session's title and cwd from its projection cache.
 *
 * The cache stores the two fields in *different* shapes, which is easy to get
 * wrong:
 *   - `record.rows.title` is a wrapped projection record: { ver, seq, val }
 *   - `record.identity.cwd` is a plain scalar string
 * `findVal` therefore accepts both a `{ val }` wrapper and a bare string.
 */
function readCacheInfo(sessionId) {
  const file = findCacheFile(sessionId);
  if (!file) return { title: null, cwd: null };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    function findVal(node, key, depth) {
      if (depth > 8 || node == null || typeof node !== 'object') return undefined;
      const hit = node[key];
      if (hit !== undefined && hit !== null) {
        if (typeof hit === 'string') return hit; // plain scalar (cwd)
        if (typeof hit === 'object' && !Array.isArray(hit) && 'val' in hit) {
          if (typeof hit.val === 'string') return hit.val; // wrapped record (title)
        }
      }
      for (const k in node) {
        const r = findVal(node[k], key, depth + 1);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    const title = findVal(data, 'title', 0);
    const cwd = findVal(data, 'cwd', 0);
    return {
      title: typeof title === 'string' && title ? title : null,
      cwd: typeof cwd === 'string' && cwd ? cwd : null,
    };
  } catch {
    return { title: null, cwd: null };
  }
}

/**
 * Recursively remove a path via the subprocess service. Idempotent: a missing
 * target resolves { ok: true, alreadyGone: true }.
 */
async function removePath(subprocess, absPath) {
  try {
    if (!existsSync(absPath)) return { ok: true, alreadyGone: true };
  } catch {
    /* fall through to the removal attempt */
  }
  let argv;
  if (process.platform === 'win32') {
    argv = [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' +
        `if (Test-Path -LiteralPath '${absPath.replace(/'/g, "''")}') { ` +
        `Remove-Item -LiteralPath '${absPath.replace(/'/g, "''")}' -Recurse -Force -ErrorAction Stop }`,
    ];
  } else {
    argv = ['rm', '-rf', '--', absPath];
  }
  const handle = subprocess.spawn({
    argv,
    cwd: dshHome(),
    stdio: { stdin: 'ignore', stdout: 'ignore', stderr: { maxBytes: 8 * 1024 } },
    graceMs: 30_000,
  });
  const outcome = await handle.done;
  if (outcome.exitCode === 0) return { ok: true };
  try {
    if (!existsSync(absPath)) return { ok: true, alreadyGone: true };
  } catch {
    /* ignore */
  }
  return { ok: false, error: `Failed to delete (exit code ${outcome.exitCode}): ${absPath}` };
}

/**
 * Open the OS file manager at a path. Windows uses `cmd /c start` (spawning
 * explorer.exe directly exits non-zero without opening a window for paths with
 * spaces or unicode); macOS `open -R`; Linux `xdg-open`.
 */
async function revealPath(subprocess, absPath) {
  let argv;
  if (process.platform === 'win32') {
    let target = absPath;
    try {
      if (existsSync(absPath) && statSync(absPath).isFile()) target = join(absPath, '..');
    } catch {
      /* keep as-is */
    }
    argv = ['cmd.exe', '/c', 'start', '', 'explorer.exe', target];
  } else if (process.platform === 'darwin') {
    argv = ['open', '-R', absPath];
  } else {
    argv = ['xdg-open', absPath];
  }
  try {
    // Fire-and-forget: spawning is enough to open the folder.
    subprocess.spawn({
      argv,
      cwd: dshHome(),
      stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
      graceMs: 5_000,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/** Read a JSON request body. */
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  return JSON.parse(text);
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

export function apply(ctx, config = {}) {
  // ---- Services (lazy; the plugin also boots without the web layer) ----
  const getService = (keys) => {
    for (const k of keys) {
      const v = ctx.get?.(k);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const workspaceRegistry = () => getService(['workspaceRegistry', 'workspace']);
  const workspaceController = () => getService(['workspaceController']);
  const sessionQuery = () => getService(['sessionQuery']);
  const subprocess = () => getService(['subprocess']);
  const webServer = () => getService(['webServer', 'httpServer']);

  // ---- Core logic ----

  /**
   * Read the archive set, preferring the live runtime projection over the
   * on-disk snapshot: `workspaceController.follow()` opens with a baseline
   * carrying `archivedSessionIds`, and aborting right after that first frame
   * gives the current in-memory truth without subscribing to the stream.
   * Falls back to the durable `workspace.json` snapshot.
   */
  async function readArchivedIdsLive() {
    const wc = workspaceController();
    if (wc && typeof wc.follow === 'function') {
      const ac = new AbortController();
      try {
        const iter = wc.follow(ac.signal)[Symbol.asyncIterator]();
        const first = await iter.next();
        ac.abort();
        const frame = first && !first.done ? first.value : undefined;
        if (frame && frame.type === 'baseline') {
          const ids = frame.value?.archivedSessionIds;
          if (Array.isArray(ids)) return ids.filter((id) => typeof id === 'string' && id);
        }
      } catch {
        /* stream unavailable — fall back to the disk snapshot */
      }
    }
    return readArchivedIds();
  }

  /** Build one panel row for a session id. */
  function rowFor(sessionId, extra) {
    const logDir = findSessionDir(sessionId) ?? null;
    const cacheFile = findCacheFile(sessionId) ?? null;
    const info = readCacheInfo(sessionId);
    return Object.assign(
      {
        sessionId,
        title: info.title,
        cwd: info.cwd,
        hasLogDir: logDir !== null,
        hasCache: cacheFile !== null,
        // A row whose data is gone is a "ghost" archive entry: the panel shows
        // it as such and deleting it just clears the leftover id.
        dataExists: logDir !== null || cacheFile !== null,
      },
      extra || {},
    );
  }

  /**
   * The full panel payload: sessions the harness currently shows as active,
   * plus everything in the archive set.
   */
  async function listAll() {
    const archivedIds = await readArchivedIdsLive();
    // Ids whose data is gone and whose archive entry is only waiting for the
    // next-start sweep: hide them so the panel reflects the delete immediately.
    const pendingSet = new Set(readPending());
    const archivedSet = new Set(archivedIds);
    const visibleArchived = archivedIds.filter((id) => !pendingSet.has(id));
    const visibleArchivedSet = new Set(visibleArchived);

    const active = [];
    const sq = sessionQuery();
    if (sq) {
      try {
        const records = await sq.listSessions();
        for (const r of records) {
          const id = r.header.id;
          if (archivedSet.has(id) || visibleArchivedSet.has(id)) continue;
          const extra = {
            live: r.live === true,
            persisted: r.persisted === true,
          };
          // Only override the cached cwd when sessionQuery actually supplies
          // one, so an absent header.cwd cannot blank a path we already know.
          if (typeof r.header.cwd === 'string' && r.header.cwd) extra.cwd = r.header.cwd;
          active.push(rowFor(id, extra));
        }
      } catch {
        /* sessionQuery unavailable — the archived side still works */
      }
    }

    const archived = visibleArchived.map((id) => rowFor(id));
    return { active, archived, pendingCount: pendingSet.size };
  }

  /** Archive one active session (native harness archiving). */
  async function archiveById(sessionId) {
    const wr = workspaceRegistry();
    if (!wr) {
      return { sessionId, archived: false, errors: ['workspaceRegistry service unavailable'] };
    }
    try {
      await wr.archiveSession(sessionId, { stopActivity: true });
      return { sessionId, archived: true, errors: [] };
    } catch (err) {
      return { sessionId, archived: false, errors: [`Archive failed: ${err?.message ?? String(err)}`] };
    }
  }

  /** Restore one archived session to the active list (data untouched). */
  async function unarchiveById(sessionId) {
    const wr = workspaceRegistry();
    if (!wr) {
      return { sessionId, unarchived: false, errors: ['workspaceRegistry service unavailable'] };
    }
    try {
      await wr.unarchiveSession(sessionId);
      return { sessionId, unarchived: true, errors: [] };
    } catch (err) {
      return { sessionId, unarchived: false, errors: [`Unarchive failed: ${err?.message ?? String(err)}`] };
    }
  }

  /**
   * Permanently delete one archived session:
   *   1. remove its session log directory (idempotent)
   *   2. remove its projection-cache file (idempotent)
   *   3. queue the archive-entry cleanup (see `pendingFile()` above)
   *
   * The bound user workspace directory is intentionally left alone.
   */
  async function deleteArchived(sessionId) {
    const sp = subprocess();
    const result = {
      sessionId,
      logDirDeleted: false,
      cacheDeleted: false,
      queued: false,
      errors: [],
    };

    const logDir = findSessionDir(sessionId);
    if (logDir) {
      if (!sp) {
        result.errors.push('Failed to delete session data: subprocess service unavailable');
      } else {
        const rm = await removePath(sp, logDir);
        if (rm.ok) {
          result.logDirDeleted = true;
          // Prune the workspace-encoded bucket when it becomes empty.
          const bucket = join(logDir, '..');
          try {
            const remaining = readdirSync(bucket).filter((n) => n !== '.' && n !== '..');
            if (remaining.length === 0) await removePath(sp, bucket);
          } catch {
            /* bucket already gone */
          }
        } else {
          result.errors.push(rm.error ?? 'Failed to delete session data');
        }
      }
    } else {
      result.logDirDeleted = true; // already gone
    }

    const cacheFile = findCacheFile(sessionId);
    if (cacheFile) {
      if (!sp) {
        result.errors.push('Failed to delete session cache: subprocess service unavailable');
      } else {
        const rm = await removePath(sp, cacheFile);
        if (rm.ok) result.cacheDeleted = true;
        else result.errors.push(rm.error ?? 'Failed to delete session cache');
      }
    } else {
      result.cacheDeleted = true; // already gone
    }

    // Queue the archive-entry cleanup instead of unarchiving right now.
    // `unarchiveSession` means "back to the active list", so doing it while the
    // harness still holds this session in memory would surface a data-less
    // ghost there. The sweep at plugin start drops the entry safely.
    if (result.errors.length === 0) {
      const pending = readPending();
      if (!pending.includes(sessionId)) pending.push(sessionId);
      result.queued = writePending(pending);
    }

    return result;
  }

  /**
   * Drop archive entries queued by earlier deletes. Runs at plugin start, when
   * the harness holds no stale in-memory session for those ids, so unarchiving
   * cannot push a data-less ghost into the active list.
   */
  async function flushPending() {
    const pending = readPending();
    if (pending.length === 0) return { flushed: 0, remaining: 0 };
    const wr = workspaceRegistry();
    if (!wr) return { flushed: 0, remaining: pending.length };
    const remaining = [];
    let flushed = 0;
    for (const id of pending) {
      try {
        await wr.unarchiveSession(id);
        flushed += 1;
      } catch {
        remaining.push(id); // keep it queued and retry on the next sweep
      }
    }
    writePending(remaining);
    return { flushed, remaining: remaining.length };
  }

  // ---- Tools (natural language) ----
  const tools = ctx.tools;
  if (tools && typeof tools.register === 'function') {
    tools.register({
      name: 'archive_list',
      description:
        'List sessions for archiving management: the currently active sessions plus every archived session, with titles, bound workspace directories, and whether on-disk data still exists.',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => {
          const line = (it) =>
            `${it.sessionId}${it.title ? ` (${it.title})` : ''}${it.dataExists === false ? ' [data missing]' : ''}`;
          const archived = Array.isArray(value.archived) ? value.archived : [];
          const active = Array.isArray(value.active) ? value.active : [];
          return [{
            type: 'text',
            text:
              `Archived (${archived.length}):\n` +
              (archived.length ? archived.map(line).map((s) => '  ' + s).join('\n') : '  (none)') +
              `\nActive (${active.length}):\n` +
              (active.length ? active.map(line).map((s) => '  ' + s).join('\n') : '  (none)'),
          }];
        },
      },
      async execute() {
        return listAll();
      },
    });

    tools.register({
      name: 'archive_add',
      description:
        'Archive one active session: it leaves the active list but keeps all of its data on disk. Reversible with archive_remove.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Active session id to archive.' } },
        required: ['sessionId'],
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{
          type: 'text',
          text: `Archived ${value.sessionId}: ${value.archived ? 'ok' : 'failed'}${value.errors?.length ? `\nErrors: ${value.errors.join('; ')}` : ''}`,
        }],
      },
      async execute(args) {
        return archiveById(args.sessionId);
      },
    });

    tools.register({
      name: 'archive_remove',
      description:
        'Restore one archived session back to the active list. Its data was never touched, so nothing is moved.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Archived session id to restore.' } },
        required: ['sessionId'],
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{
          type: 'text',
          text: `Unarchived ${value.sessionId}: ${value.unarchived ? 'ok' : 'failed'}${value.errors?.length ? `\nErrors: ${value.errors.join('; ')}` : ''}`,
        }],
      },
      async execute(args) {
        return unarchiveById(args.sessionId);
      },
    });

    tools.register({
      name: 'archive_delete',
      description:
        'Permanently delete one archived session: remove its session log and projection cache, then queue its archive entry for cleanup at the next DSH start. The bound workspace directory is left untouched. Irreversible.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Archived session id to delete permanently.' } },
        required: ['sessionId'],
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{
          type: 'text',
          text:
            `Deleted archived session ${value.sessionId}: log=${value.logDirDeleted}, cache=${value.cacheDeleted}` +
            (value.queued
              ? '; its archive entry is queued and will be swept at the next DSH start'
              : '') +
            (value.errors?.length ? `\nErrors: ${value.errors.join('; ')}` : ''),
        }],
      },
      async execute(args) {
        return deleteArchived(args.sessionId);
      },
    });
  }

  // ---- Web routes (the browser half calls these) ----
  // webServer may bind AFTER this plugin, so registration is retried on each
  // service binding event.
  let routesRegistered = false;
  const registerRoutes = () => {
    if (routesRegistered) return;
    const server = webServer();
    if (!server || typeof server.register !== 'function') return;
    routesRegistered = true;

    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/plugins/archive-manager/list',
      handler: async (_req, res) => {
        try {
          json(res, 200, await listAll());
        } catch (err) {
          json(res, 500, { error: err?.message ?? String(err) });
        }
      },
    }), 'archive-manager: list route');

    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/plugins/archive-manager/archive',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'POST required' });
          return;
        }
        try {
          const body = await readJson(req);
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
          if (!sessionId) {
            json(res, 400, { error: 'sessionId required' });
            return;
          }
          json(res, 200, await archiveById(sessionId));
        } catch (err) {
          json(res, 500, { error: err?.message ?? String(err) });
        }
      },
    }), 'archive-manager: archive route');

    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/plugins/archive-manager/unarchive',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'POST required' });
          return;
        }
        try {
          const body = await readJson(req);
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
          if (!sessionId) {
            json(res, 400, { error: 'sessionId required' });
            return;
          }
          json(res, 200, await unarchiveById(sessionId));
        } catch (err) {
          json(res, 500, { error: err?.message ?? String(err) });
        }
      },
    }), 'archive-manager: unarchive route');

    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/plugins/archive-manager/delete',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'POST required' });
          return;
        }
        try {
          const body = await readJson(req);
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
          if (!sessionId) {
            json(res, 400, { error: 'sessionId required' });
            return;
          }
          json(res, 200, await deleteArchived(sessionId));
        } catch (err) {
          json(res, 500, { error: err?.message ?? String(err) });
        }
      },
    }), 'archive-manager: delete route');

    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/plugins/archive-manager/reveal',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'POST required' });
          return;
        }
        try {
          const body = await readJson(req);
          const path = typeof body.path === 'string' ? body.path : '';
          if (!path) {
            json(res, 400, { error: 'path required' });
            return;
          }
          const sp = subprocess();
          if (!sp) {
            json(res, 503, { error: 'subprocess service unavailable' });
            return;
          }
          json(res, 200, await revealPath(sp, path));
        } catch (err) {
          json(res, 500, { error: err?.message ?? String(err) });
        }
      },
    }), 'archive-manager: reveal route');
  };

  registerRoutes();

  // Sweep archive entries queued by previous deletes. This plugin start is the
  // safe moment for it: whatever session the previous run still held in memory
  // is gone, so unarchiving cannot push a data-less ghost into the active list.
  let swept = false;
  const sweep = () => {
    if (swept) return;
    flushPending()
      .then((r) => {
        if (r.remaining === 0) swept = true;
      })
      .catch(() => {});
  };
  sweep();
  setTimeout(sweep, 3000);

  if (typeof ctx.on === 'function') {
    ctx.on('internal/service', (name) => {
      if (name === 'webServer' || name === 'httpServer') registerRoutes();
      if (name === 'workspaceRegistry' || name === 'workspace') sweep();
    });
  }
}
