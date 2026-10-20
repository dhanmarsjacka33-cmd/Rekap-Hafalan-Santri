// ============================================================
// API LAYER - DIRECT TO GOOGLE APPS SCRIPT (METODE GET)
// ============================================================

window.APP_CONFIG = {
  // Tembak langsung ke URL GAS Anda (tanpa Worker)
  gasUrl: 'https://script.google.com/macros/s/AKfycbzd0nAN62cpSg2HAhVtrbKQEQYZ_-TXRl9ABTQTnqo1Rhs3FEVaciMLvikUdnKV0l_dLg/exec'
};

async function gasCall(action, payload = {}) {
  try {
    // Kita kirim data lewat URL (Query String) agar tidak memicu blokir CORS
    const url = new URL(window.APP_CONFIG.gasUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('payload', JSON.stringify(payload));

    const res = await fetch(url.toString(), { method: 'GET' });
    
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("Bukan JSON, isi respons:", text.substring(0, 100));
      throw new Error("Google mengembalikan HTML. Pastikan Deploy GAS 'Anyone' dan Code.gs sudah benar.");
    }
  } catch (error) {
    console.error(`[gasCall] Gagal di ${action}:`, error);
    throw error;
  }
}

// ============================================================
// SISA KODE SDK (Sama seperti sebelumnya)
// ============================================================
let _inflightGetAll = null;
function fetchAll({ force = false } = {}) {
  if (!force && _inflightGetAll) return _inflightGetAll;
  _inflightGetAll = gasCall('getAll').finally(() => { _inflightGetAll = null; });
  return _inflightGetAll;
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

function refreshData() { return _doRefresh(); }

window.dataSdk = {
  init: async function (handler) {
    try {
      await refreshData();
      return { isOk: true };
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Gagal memuat: ' + e.message, true);
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
  refresh: () => refreshData(),
  fetchAll
};