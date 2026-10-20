// ============================================================
// API LAYER — Komunikasi dengan Google Apps Script
// Versi 2.1 (FINAL) — Lengkap, siap pakai
// ============================================================

// --- Konfigurasi URL GAS (Pastikan URL ini sesuai dengan Deploy GAS Anda) ---
window.APP_CONFIG = window.APP_CONFIG || {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzd0nAN62cpSg2HAhVtrbKQEQYZ_-TXRl9ABTQTnqo1Rhs3FEVaciMLvikUdnKV0l_dLg/exec'
};

// ---------- State internal ----------
let _inflightGetAll = null;   // promise getAll yang sedang jalan (dedupe)
let _refreshQueued = null;    // promise refresh yang ditunda (coalesce)

// ---------- Konfigurasi default ----------
const GAS_DEFAULTS = {
  timeout: 45000,   // GAS cold start 3–10s, beri ruang
  retries: 1,       // retry sekali kalau timeout/abort
};

// ---------- Core: panggil GAS ----------
async function gasCall(action, payload = {}, options = {}) {
  const timeoutMs = options.timeout ?? GAS_DEFAULTS.timeout;
  const retriesLeft = options.retries ?? GAS_DEFAULTS.retries;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    timeoutMs
  );
  const t0 = performance.now();

  try {
    if (window.DEBUG) console.log('[gasCall] →', action, payload);

    const formData = new URLSearchParams();
    formData.append('action', action);
    formData.append('payload', JSON.stringify(payload));

    const res = await fetch(window.APP_CONFIG.gasUrl, {
      method: 'POST',
      body: formData,
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

    if (window.DEBUG) {
      const dur = (performance.now() - t0).toFixed(0);
      console.log(`[gasCall] ← ${action} (${dur}ms)`, json);
    }
    return json;
  } catch (e) {
    const isAbort = e.name === 'AbortError' || e.name === 'TimeoutError';
    if (isAbort && retriesLeft > 0) {
      console.warn(`[gasCall] retry ${action} setelah ${e.name} (sisa ${retriesLeft - 1})`);
      clearTimeout(timer);
      return gasCall(action, payload, { ...options, retries: retriesLeft - 1 });
    }
    const dur = (performance.now() - t0).toFixed(0);
    console.error(`[gasCall] ✗ ${action} (${dur}ms)`, e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Dedupe: getAll hanya 1 paralel ----------
function fetchAll({ force = false } = {}) {
  if (!force && _inflightGetAll) return _inflightGetAll;
  _inflightGetAll = gasCall('getAll', {}, { timeout: GAS_DEFAULTS.timeout })
    .finally(() => { _inflightGetAll = null; });
  return _inflightGetAll;
}

// ---------- Coalesce: banyak panggilan refresh → 1 eksekusi ----------
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
      // Asumsi variabel global dari app.js
      window.records = data.records || [];
      window.masterSantri = data.masterSantri || [];
      window.masterHalaqah = data.masterHalaqah || [];
      
      // Panggil fungsi render dari app.js jika ada
      if (typeof window.render === 'function') {
        window.render();
      }
    }
    return data;
  } catch (e) {
    if (typeof window.showToast === 'function') {
      window.showToast('Gagal refresh data: ' + e.message, true);
    } else {
      console.error('Gagal refresh data:', e);
    }
    throw e;
  }
}

// ---------- Helper optimistic ----------
function _applyLocalCreate(row) {
  if (!window.records) return;
  const tempId = row.id || ('tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  window.records.push({ ...row, id: tempId, _pending: true });
}

function _applyLocalUpdate(row) {
  if (!window.records) return;
  const idx = window.records.findIndex(r => String(r.id) === String(row.id));
  if (idx >= 0) window.records[idx] = { ...window.records[idx], ...row };
}

function _applyLocalDelete(row) {
  if (!window.records) return;
  window.records = window.records.filter(r => String(r.id) !== String(row.id));
}

// ---------- Helper opsi kompatibel ----------
function _opts(a) {
  if (typeof a === 'boolean') return { skipRefresh: a, optimistic: false };
  return { skipRefresh: false, optimistic: false, ...(a || {}) };
}

// ============================================================
// SDK PUBLIK (WINDOW.DATASDK)
// ============================================================
window.dataSdk = {
  // --- Inisialisasi Awal ---
  init: async function (handler) {
    try {
      const data = await fetchAll();
      if (data.isOk) {
        window.records = data.records || [];
        window.masterSantri = data.masterSantri || [];
        window.masterHalaqah = data.masterHalaqah || [];
        
        if (handler && typeof handler.onDataChanged === 'function') {
          handler.onDataChanged(window.records);
        }
      }
      return { isOk: true };
    } catch (e) {
      if (typeof window.showToast === 'function') {
        window.showToast('Gagal memuat data: ' + e.message, true);
      } else {
        console.error('Gagal memuat data:', e);
      }
      return { isOk: false, message: e.message };
    }
  },

  // --- CRUD Setoran / Record ---
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

  // --- Bulk attendance ---
  bulkAttendance: async (rows, o) => {
    const { skipRefresh } = _opts(o);
    const r = await gasCall('processBulkAttendance', rows, { timeout: 60000 });
    if (r.isOk && !skipRefresh) refreshData();
    return r;
  },

  // --- Master Santri ---
  createSantri: async (d) => { const r = await gasCall('createSantri', d); if (r.isOk) refreshData(); return r; },
  updateSantri: async (d) => { const r = await gasCall('updateSantri', d); if (r.isOk) refreshData(); return r; },
  deleteSantri: async (d) => { const r = await gasCall('deleteSantri', d); if (r.isOk) refreshData(); return r; },

  // --- Master Halaqah ---
  createHalaqah: async (d) => { const r = await gasCall('createHalaqah', d); if (r.isOk) refreshData(); return r; },
  updateHalaqah: async (d) => { const r = await gasCall('updateHalaqah', d); if (r.isOk) refreshData(); return r; },
  deleteHalaqah: async (d) => { const r = await gasCall('deleteHalaqah', d); if (r.isOk) refreshData(); return r; },

  // --- Mutasi Massal (Pecah Halaqah) ---
  mutateSantriBulk: async (items, o) => {
    const { skipRefresh } = _opts(o);
    try {
      const r = await gasCall('mutateSantriBulk', { items }, { timeout: 60000 });
      if (r.isOk && !skipRefresh) refreshData({ immediate: true });
      return r;
    } catch (e) {
      // Fallback jika endpoint bulk di GAS error
      const results = [];
      for (const item of items) {
        try { 
          const r = await gasCall('updateSantri', item); 
          results.push({ ok: r.isOk, item }); 
        } catch (err) { 
          results.push({ ok: false, item, error: err.message }); 
        }
      }
      if (!skipRefresh) await refreshData({ immediate: true });
      return { isOk: results.every(x => x.ok), results };
    }
  },

  // --- Utilitas ---
  refresh: (opts) => refreshData(opts),
  fetchAll,
};