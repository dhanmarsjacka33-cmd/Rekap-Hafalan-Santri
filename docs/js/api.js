// ============================================================
// API LAYER - DIRECT TO GOOGLE APPS SCRIPT (METODE GET)
// ============================================================

window.APP_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzd0nAN62cpSg2HAhVtrbKQEQYZ_-TXRl9ABTQTnqo1Rhs3FEVaciMLvikUdnKV0l_dLg/exec'
};

// Inisialisasi wadah data global
window.records = [];
window.masterSantri = [];
window.masterHalaqah = [];

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

// Fungsi utama mengambil data & langsung render
async function syncData() {
  try {
    const data = await gasCall('getAll');
    if (data.isOk) {
      window.records = data.records || [];
      window.masterSantri = data.masterSantri || [];
      window.masterHalaqah = data.masterHalaqah || [];
      
      // Panggil fungsi render dari app.js
      if (typeof window.render === 'function') {
        window.render();
      }
    }
  } catch (e) {
    console.error("Gagal sinkronisasi:", e);
  }
}

window.dataSdk = {
  init: async function () {
    await syncData();
    return { isOk: true };
  },
  
  // Setiap aksi akan memicu syncData() agar UI langsung berubah
  create: (row) => gasCall('createRecord', row).then(r => { if (r.isOk) syncData(); return r; }),
  update: (row) => gasCall('updateRecord', row).then(r => { if (r.isOk) syncData(); return r; }),
  delete: (row) => gasCall('deleteRecord', row).then(r => { if (r.isOk) syncData(); return r; }),
  bulkAttendance: (rows) => gasCall('processBulkAttendance', rows).then(r => { if (r.isOk) syncData(); return r; }),
  
  createSantri: (d) => gasCall('createSantri', d).then(r => { if (r.isOk) syncData(); return r; }),
  updateSantri: (d) => gasCall('updateSantri', d).then(r => { if (r.isOk) syncData(); return r; }),
  deleteSantri: (d) => gasCall('deleteSantri', d).then(r => { if (r.isOk) syncData(); return r; }),
  
  createHalaqah: (d) => gasCall('createHalaqah', d).then(r => { if (r.isOk) syncData(); return r; }),
  updateHalaqah: (d) => gasCall('updateHalaqah', d).then(r => { if (r.isOk) syncData(); return r; }),
  deleteHalaqah: (d) => gasCall('deleteHalaqah', d).then(r => { if (r.isOk) syncData(); return r; }),
  
  mutateSantriBulk: (items) => gasCall('mutateSantriBulk', { items }).then(r => { if (r.isOk) syncData(); return r; }),
  
  refresh: () => syncData(),
  fetchAll: () => gasCall('getAll')
};