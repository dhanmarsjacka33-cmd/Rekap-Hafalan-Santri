// ============================================================
// API LAYER — Komunikasi dengan Google Apps Script
// Versi 3.0 (Anti-CORS & Lengkap)
// ============================================================

// Pastikan URL ini sesuai dengan URL GAS Anda (yang diakhiri /exec)
window.APP_CONFIG = window.APP_CONFIG || {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzd0nAN62cpSg2HAhVtrbKQEQYZ_-TXRl9ABTQTnqo1Rhs3FEVaciMLvikUdnKV0l_dLg/exec'
};

let _inflightGetAll = null;
let _refreshQueued = null;

const GAS_DEFAULTS = {
  timeout: 45000,
  retries: 1,
};

// ---------- Core: panggil GAS ----------
async function gasCall(action, payload = {}, options = {}) {
  const timeoutMs = options.timeout ?? GAS_DEFAULTS.timeout;
  const retriesLeft = options.retries ?? GAS_DEFAULTS.retries;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const t0 = performance.now();

  try {
    if (window.DEBUG) console.log('[gasCall] →', action, payload);

    // 🛠️ TRIK CORS: Kirim sebagai text/plain agar tidak memicu preflight (OPTIONS)
    const res = await fetch(window.APP_CONFIG.gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', 
      },
      // Kirim data dalam format JSON string
      body: JSON.stringify({ action, payload }), 
      signal: controller.signal,
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Response bukan JSON: ' + text.substring(0, 200));
      json = JSON.parse(match[0]);
    }

    if (window.DEBUG) console.log(`[gasCall] ← ${action} (${(performance.now() - t0).toFixed(0)}ms)`, json);
    return json;
  } catch (e) {
    const isAbort = e.name === 'AbortError' || e.name === 'TimeoutError';
    if (isAbort && retriesLeft > 0) {
      console.warn(`[gasCall] retry ${action}...`);
      clearTimeout(timer);
      return gasCall(action, payload, { ...options, retries: retriesLeft - 1 });
    }
    console.error(`[gasCall] ✗ ${action}`, e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Dedupe & Coalesce ----------
function fetchAll({ force = false } = {}) {
  if (!force && _inflightGetAll) return _inflightGetAll;
  _inflightGetAll = gasCall('getAll', {}, { timeout: GAS_DEFAULTS.timeout })
    .finally(() => { _inflightGetAll = null; });
  return _inflightGetAll;
}

function refreshData({ immediate = false } = {}) {
  if (immediate) return _doRefresh();
  if (_refreshQueued) return _refreshQueued;
  _refreshQueued = new Promise((resolve) => {
    setTimeout(() => {
      _refreshQueued = null;
      _doRefresh().then(resolve).catch(resolve);
    }, 200);
  });
  return _refreshQueued;
}

async function _doRefresh() {
  try {
    const data = await fetchAll();
    if (data.isOk) {
      window.records = data.records || [];
      window.masterSantri = data.masterSantri || [];
      window.masterHalaqah = data.masterHalaqah || [];
      if (typeof window.render === 'function') window.render();
    }
    return data;
  } catch (e) {
    if (typeof window.showToast === 'function') window.showToast('Gagal refresh data: ' + e.message, true);
    throw e;
  }
}

function _applyLocalCreate(row) { if (window.records) window.records.push({ ...row, id: row.id || 'tmp_' + Date.now() }); }
function _applyLocalUpdate(row) { if (!window.records) return; const i = window.records.findIndex(r => String(r.id) === String(row.id)); if (i >= 0) window.records[i] = { ...window.records[i], ...row }; }
function _applyLocalDelete(row) { if (window.records) window.records = window.records.filter(r => String(r.id) !== String(row.id)); }

function _opts(a) {
  if (typeof a === 'boolean') return { skipRefresh: a, optimistic: false };
  return { skipRefresh: false, optimistic: false, ...(a || {}) };
}

// ============================================================
// SDK PUBLIK
// ============================================================
window.dataSdk = {
  init: async function (handler) {
    try {
      const data = await fetchAll();
      if (data.isOk) {
        window.records = data.records || [];
        window.masterSantri = data.masterSantri || [];
        window.masterHalaqah = data.masterHalaqah || [];
        
        // Paksa UI untuk render setelah data masuk
        if (typeof window.render === 'function') window.render();

        if (handler && typeof handler.onDataChanged === 'function') {
          handler.onDataChanged(window.records);
        }
      }
      return { isOk: true };
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Gagal memuat data: ' + e.message, true);
      return { isOk: false, message: e.message };
    }
  },

  create: async (row, o) => {
    const { skipRefresh, optimistic } = _opts(o);
    if (optimistic) _applyLocalCreate(row);
    const r = await gasCall('createRecord', row);
    if (r.isOk && !skipRefresh) refreshData();
    return r;
  },

  update: async (row, o) => {
    const { skipRefresh, optimistic } = _opts(o);
    if (optimistic) _applyLocalUpdate(row);
    const r = await gasCall('updateRecord', row);
    if (r.isOk && !skipRefresh) refreshData();
    return r;
  },

  delete: async (row, o) => {
    const { skipRefresh, optimistic } = _opts(o);
    if (optimistic) _applyLocalDelete(row);
    const r = await gasCall('deleteRecord', row);
    if (r.isOk && !skipRefresh) refreshData();
    return r;
  },

  bulkAttendance: async (rows, o) => {
    const { skipRefresh } = _opts(o);
    const r = await gasCall('processBulkAttendance', rows, { timeout: 60000 });
    if (r.isOk && !skipRefresh) refreshData();
    return r;
  },

  createSantri: async (d) => { const r = await gasCall('createSantri', d); if (r.isOk) refreshData(); return r; },
  updateSantri: async (d) => { const r = await gasCall('updateSantri', d); if (r.isOk) refreshData(); return r; },
  deleteSantri: async (d) => { const r = await gasCall('deleteSantri', d); if (r.isOk) refreshData(); return r; },

  createHalaqah: async (d) => { const r = await gasCall('createHalaqah', d); if (r.isOk) refreshData(); return r; },
  updateHalaqah: async (d) => { const r = await gasCall('updateHalaqah', d); if (r.isOk) refreshData(); return r; },
  deleteHalaqah: async (d) => { const r = await gasCall('deleteHalaqah', d); if (r.isOk) refreshData(); return r; },

  mutateSantriBulk: async (items, o) => {
    const { skipRefresh } = _opts(o);
    try {
      const r = await gasCall('mutateSantriBulk', { items }, { timeout: 60000 });
      if (r.isOk && !skipRefresh) refreshData({ immediate: true });
      return r;
    } catch (e) {
      const results = [];
      for (const item of items) {
        try { const r = await gasCall('updateSantri', item); results.push({ ok: r.isOk, item }); }
        catch (err) { results.push({ ok: false, item, error: err.message }); }
      }
      if (!skipRefresh) await refreshData({ immediate: true });
      return { isOk: results.every(x => x.ok), results };
    }
  },

  refresh: (opts) => refreshData(opts),
  fetchAll,
};