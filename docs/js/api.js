// ============================================================
// API LAYER FINAL (Via Cloudflare Worker)
// ============================================================

window.APP_CONFIG = {
  // PASTIKAN URL INI ADALAH URL CLOUDFLARE WORKER ANDA
  gasUrl: 'https://rekap-hafalan-proxy.dhanmars-jacka33.workers.dev'
};

let _inflightGetAll = null;

// --- 1. Fungsi Pemanggil API Utama ---
async function gasCall(action, payload = {}) {
  try {
    const res = await fetch(window.APP_CONFIG.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });

    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error("Gagal parse JSON. Respons mentah dari server:", text);
      throw new Error("Respons bukan JSON. Cek log Cloudflare Worker Anda.");
    }
  } catch (error) {
    console.error(`[gasCall] Gagal mengeksekusi ${action}:`, error);
    throw error;
  }
}

// --- 2. Fungsi Deduplikasi & Refresh Data ---
function fetchAll({ force = false } = {}) {
  if (!force && _inflightGetAll) return _inflightGetAll;
  _inflightGetAll = gasCall('getAll').finally(() => { 
    _inflightGetAll = null; 
  });
  return _inflightGetAll;
}

async function _doRefresh() {
  try {
    const data = await fetchAll();
    if (data.isOk) {
      window.records = data.records || [];
      window.masterSantri = data.masterSantri || [];
      window.masterHalaqah = data.masterHalaqah || [];
      
      // Render ulang UI
      if (typeof window.render === 'function') window.render();
    } else {
      throw new Error(data.message || 'Gagal mengambil data dari server.');
    }
    return data;
  } catch (e) {
    if (typeof window.showToast === 'function') {
      window.showToast('Gagal sinkronisasi data: ' + e.message, true);
    }
    throw e;
  }
}

function refreshData() {
  return _doRefresh();
}

// --- 3. SDK Data (Dipakai oleh app.js) ---
window.dataSdk = {
  init: async function (handler) {
    try {
      const data = await fetchAll();
      if (data.isOk) {
        window.records = data.records || [];
        window.masterSantri = data.masterSantri || [];
        window.masterHalaqah = data.masterHalaqah || [];
        
        if (typeof window.render === 'function') window.render();
        if (handler && typeof handler.onDataChanged === 'function') {
          handler.onDataChanged(window.records);
        }
      } else {
        throw new Error(data.message || 'Inisialisasi gagal');
      }
      return { isOk: true };
    } catch (e) {
      if (typeof window.showToast === 'function') {
        window.showToast('Gagal memuat data awal: ' + e.message, true);
      }
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
  
  mutateSantriBulk: (items) => gasCall('mutateSantriBulk', { items }).then(r => { if (r.isOk) refreshData(); return r; }),
  refresh: () => refreshData(),
  fetchAll
};