// ============================================================
// API LAYER FINAL (Via Cloudflare Worker)
// ============================================================

window.APP_CONFIG = {
  // PASTIKAN URL INI ADALAH URL CLOUDFLARE WORKER ANDA (berakhiran workers.dev)
  gasUrl: 'https://rekap-hafalan-proxy.dhanmars-jacka33.workers.dev'
};

async function gasCall(action, payload = {}) {
  // Kita gunakan POST via Worker agar payload besar (seperti 5174 record) aman
  const res = await fetch(window.APP_CONFIG.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Trik anti-preflight
    body: JSON.stringify({ action, payload })
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Gagal parse JSON. Respons:", text);
    throw new Error("Format respons tidak valid. Periksa log Cloudflare.");
  }
}

// (Sisa kode di bawah ini SAMA PERSIS dengan api.js yang saya berikan sebelumnya)
let _inflightGetAll = null;
function fetchAll({ force = false } = {}) {
  if (!force && _inflightGetAll) return _inflightGetAll;
  _inflightGetAll = gasCall('getAll').finally(() => { _inflightGetAll = null; });
  return _inflightGetAll;
}

function refreshData({ immediate = false } = {}) {
  if (immediate) return _doRefresh();
  return _doRefresh();
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

window.dataSdk = {
  init: async function (handler) {
    try {
    const data = await fetchAll();
      if (data.isOk) {
        window.records = data.records || [];
        window.masterSantri = data.masterSantri || [];
        window.masterHalaqah = data.masterHalaqah || [];
        if (typeof window.render === 'function') window.render();
        if (handler && typeof handler.onDataChanged === 'function') handler.onDataChanged(window.records);
      }
      return { isOk: true };
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Gagal memuat data: ' + e.message, true);
      return { isOk: false, message: e.message };
    }
  },
  create: (row) => gasCall('createRecord', row).then(r => { if (r.isOk) refreshData(); return r; }),
  update: (row) => gasCall('updateRecord', row).then(r => { if (r.isOk) refreshData(); return r; }),
  delete: (row) => gasCall('deleteRecord', row).then(r => { if (r.isOk) refreshData(); return r; }),
  bulkAttendance: (rows) => gasCall('processBulkAttendance', rows).then(r => { if (r.isOk) refreshData(); return r; }),
  createSantri: (d) => gasCall('createSantri', d).then(r => { if (r.isOk) refreshData(); return r; }),
  updateSantri: (d) => gasCall('updateSantri', d).then(r => { if (r.isOk) refreshData(); return r; }),
  deleteSantri: (d) => gasCall('deleteSantri', d).then(r => { if (r.isOk) refreshData(); return r; }),
  createHalaqah: (d) => gasCall('createHalaqah', d).then(r => { if (r.isOk) refreshData(); return r; }),
  updateHalaqah: (d) => gasCall('updateHalaqah', d).then(r => { if (r.isOk) refreshData(); return r; }),
  deleteHalaqah: (d) => gasCall('deleteHalaqah', d).then(r => { if (r.isOk) refreshData(); return r; }),
  mutateSantriBulk: (items) => gasCall('mutateSantriBulk', { items }).then(r => { if (r.isOk) refreshData({ immediate: true }); return r; }),
  refresh: () => refreshData({ immediate: true }),
  fetchAll
};