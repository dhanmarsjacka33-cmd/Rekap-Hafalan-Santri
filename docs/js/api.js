// Versi kompatibel — skipRefresh tetap posisional, optimistic lewat objek
function _opts(a) {
  if (typeof a === 'boolean') return { skipRefresh: a, optimistic: false };
  return { skipRefresh: false, optimistic: false, ...(a || {}) };
}

window.dataSdk = {
  init: async function (handler) { /* sama seperti v2 di atas */ },
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