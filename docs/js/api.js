// ============================================================
// API LAYER - DIRECT TO GOOGLE APPS SCRIPT (FINAL FIX)
// ============================================================

window.APP_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzd0nAN62cpSg2HAhVtrbKQEQYZ_-TXRl9ABTQTnqo1Rhs3FEVaciMLvikUdnKV0l_dLg/exec'
};

let _inflightGetAll = null;

async function gasCall(action, payload = {}) {
  try {
    const url = new URL(window.APP_CONFIG.gasUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('payload', JSON.stringify(payload));

    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

    const text = await res.text();
    return JSON.parse(text);
  } catch (error) {
    console.error(`[gasCall] Gagal di ${action}:`, error);
    throw error;
  }
}

function fetchAll() {
  if (_inflightGetAll) return _inflightGetAll;
  _inflightGetAll = gasCall('getAll').finally(() => { _inflightGetAll = null; });
  return _inflightGetAll;
}

// ============================================================
// SDK
// ============================================================
window.dataSdk = {
  init: async function (handler) {
    try {
      const data = await fetchAll();
      
      if (data.isOk) {
        // Simpan ke window (untuk jaga-jaga)
        window.records = data.records || [];
        window.masterSantri = data.masterSantri || [];
        window.masterHalaqah = data.masterHalaqah || [];

        // 👇 INI YANG SAYA LUPA SEBELUMNYA 👇
        // Panggil callback agar app.js menerima datanya
        if (handler && typeof handler.onDataChanged === 'function') {
          handler.onDataChanged(window.records);
        }
      }
      return { isOk: true };
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Gagal memuat: ' + e.message, true);
      return { isOk: false, message: e.message };
    }
  },
  
  create: (row) => gasCall('createRecord', row).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  update: (row) => gasCall('updateRecord', row).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  delete: (row) => gasCall('deleteRecord', row).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  bulkAttendance: (rows) => gasCall('processBulkAttendance', rows).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  createSantri: (d) => gasCall('createSantri', d).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  updateSantri: (d) => gasCall('updateSantri', d).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  deleteSantri: (d) => gasCall('deleteSantri', d).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  createHalaqah: (d) => gasCall('createHalaqah', d).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  updateHalaqah: (d) => gasCall('updateHalaqah', d).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  deleteHalaqah: (d) => gasCall('deleteHalaqah', d).then(r => { if (r.isOk) window.dataSdk.refresh(); return r; }),
  
  refresh: async () => {
    const data = await fetchAll();
    if (data.isOk) {
      window.records = data.records || [];
      window.masterSantri = data.masterSantri || [];
      window.masterHalaqah = data.masterHalaqah || [];
      if (typeof window.render === 'function') window.render();
    }
  },
  fetchAll
};