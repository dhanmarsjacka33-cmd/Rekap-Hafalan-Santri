// ============================================================
// API LAYER — Komunikasi dengan Google Apps Script
// Menggantikan google.script.run
// ============================================================

async function gasCall(action, payload = {}, options = {}) {
  const timeoutMs = options.timeout || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (window.DEBUG) console.log('[gasCall]', action, payload);
    
    // Gunakan URLSearchParams agar tidak memicu CORS Preflight
    const formData = new URLSearchParams();
    formData.append('action', action);
    formData.append('payload', JSON.stringify(payload));
    
    const res = await fetch(window.APP_CONFIG.gasUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (window.DEBUG) console.log('[gasCall] result', json);
      return json;
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Response bukan JSON: ' + text.substring(0, 200));
    }
  } catch (e) {
    clearTimeout(timer);
    console.error('[gasCall]', action, e);
    throw e;
  }
}

window.dataSdk = {
  init: async function(handler) {
    try {
      const data = await gasCall('getAll');
      if (data.isOk) {
        records = data.records || [];
        masterSantri = data.masterSantri || [];
        masterHalaqah = data.masterHalaqah || [];
        handler.onDataChanged(records);
      }
      return { isOk: true };
    } catch (e) {
      showToast('Gagal memuat data: ' + e.message, true);
      return { isOk: false, message: e.message };
    }
  },
  create: (row, skipRefresh = false) =>
    gasCall('createRecord', row).then(r => { if (r.isOk && !skipRefresh) refreshData(); return r; }),
  update: (row, skipRefresh = false) =>
    gasCall('updateRecord', row).then(r => { if (r.isOk && !skipRefresh) refreshData(); return r; }),
  delete: (row, skipRefresh = false) =>
    gasCall('deleteRecord', row).then(r => { if (r.isOk && !skipRefresh) refreshData(); return r; }),
  bulkAttendance: (rows, skipRefresh = false) =>
    gasCall('processBulkAttendance', rows).then(r => { if (r.isOk && !skipRefresh) refreshData(); return r; }),
  createSantri: (d) => gasCall('createSantri', d).then(r => { if (r.isOk) refreshData(); return r; }),
  updateSantri: (d) => gasCall('updateSantri', d).then(r => { if (r.isOk) refreshData(); return r; }),
  deleteSantri: (d) => gasCall('deleteSantri', d).then(r => { if (r.isOk) refreshData(); return r; }),
  createHalaqah: (d) => gasCall('createHalaqah', d).then(r => { if (r.isOk) refreshData(); return r; }),
  updateHalaqah: (d) => gasCall('updateHalaqah', d).then(r => { if (r.isOk) refreshData(); return r; }),
  deleteHalaqah: (d) => gasCall('deleteHalaqah', d).then(r => { if (r.isOk) refreshData(); return r; })
};

async function refreshData() {
  try {
    const data = await gasCall('getAll');
    if (data.isOk) {
      records = data.records || [];
      masterSantri = data.masterSantri || [];
      masterHalaqah = data.masterHalaqah || [];
      render();
    }
  } catch (e) {
    showToast('Gagal refresh data', true);
  }
}