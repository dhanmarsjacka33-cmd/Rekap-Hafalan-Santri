/**
 * ============================================================
 * SISTEM REKAP HAFALAN SANTRI - BACKEND
 * Versi 2.0 — Response standar (isOk), bulk mutation, riwayat setoran
 * ============================================================
 *
 * Sheets:
 *  - Database       : Aktivitas harian (setoran, kehadiran, mutasi, dll)
 *  - Master_Santri  : Master data santri
 *  - Master_Halaqah : Master data halaqah
 *
 * Perubahan v2.0:
 *  - Semua respons API standar: { isOk: bool, ... } (tidak campur isError)
 *  - Endpoint baru: mutateSantriBulk (atomik), getRiwayatSetoran
 *  - processBulkAttendance: bug loop dinamis diperbaiki
 *  - doGet: satu fungsi, support HTML fallback + API via ?action=
 */

// ============================================================
// KONSTANTA
// ============================================================
const SHEET_NAME = 'Database';
const HEADERS = ['ID','Nama Santri','Kelas','Halaqah','Tanggal','Juz','Surah','Ayat','Jumlah Baris','Status','Evaluasi','Tipe','Kehadiran'];

const SH_MASTER_SANTRI = 'Master_Santri';
const SH_MASTER_HALAQAH = 'Master_Halaqah';
const H_MASTER_SANTRI = ['ID','Nama','Kelas','Halaqah','Foto','Status','Sumber','Catatan'];
const H_MASTER_HALAQAH = ['ID','Nama','Guru','Status','Sumber'];

// ============================================================
// WEB APP ENTRY
// ============================================================
function doGet(e) {
  // Mode API via query string ?action=xxx (untuk testing & fallback)
  if (e && e.parameter && e.parameter.action) {
    try {
      const payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
      return jsonResponse(routeApi(e.parameter.action, payload));
    } catch (err) {
      return jsonResponse(err(err.toString()));
    }
  }

  // Fallback: serve HTML lama jika Index.html masih ada
  try {
    ensureAllSheets();
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Rekap Hafalan Santri')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return jsonResponse(ok({
      message: 'Rekap Hafalan API',
      ts: new Date().toISOString(),
      hint: 'POST dengan URLSearchParams {action, payload}'
    }));
  }
}

function doPost(e) {
  try {
    let req;
    if (e.parameter && e.parameter.action) {
      req = {
        action: e.parameter.action,
        payload: e.parameter.payload ? JSON.parse(e.parameter.payload) : {}
      };
    } else if (e.postData && e.postData.contents) {
      req = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse(err('No payload received'));
    }

    const result = routeApi(req.action, req.payload);
    return jsonResponse(result);
  } catch (errObj) {
    return jsonResponse(err(errObj.toString()));
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
// RESPONSE HELPERS — standarkan isOk di seluruh API
// ============================================================
function ok(data) {
  return Object.assign({ isOk: true }, data || {});
}

function err(message, extra) {
  return Object.assign(
    { isOk: false, isError: true, message: String(message || 'Error') },
    extra || {}
  );
}

/**
 * Normalisasi respons CRUD lama yang masih pakai {isError:true}.
 * Membuat semua respons API punya field isOk yang konsisten.
 */
function wrap(r) {
  if (!r) return err('Empty response');
  if (r.isOk) return r;
  return err(r.message || 'Operasi gagal');
}

// ============================================================
// SHEET INIT
// ============================================================
function ensureAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let db = ss.getSheetByName(SHEET_NAME);
  if (!db) { db = ss.insertSheet(SHEET_NAME); db.appendRow(HEADERS); db.setFrozenRows(1); }
  let ms = ss.getSheetByName(SH_MASTER_SANTRI);
  if (!ms) { ms = ss.insertSheet(SH_MASTER_SANTRI); ms.appendRow(H_MASTER_SANTRI); ms.setFrozenRows(1); }
  let mh = ss.getSheetByName(SH_MASTER_HALAQAH);
  if (!mh) { mh = ss.insertSheet(SH_MASTER_HALAQAH); mh.appendRow(H_MASTER_HALAQAH); mh.setFrozenRows(1); }
}

function getDbSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

// ============================================================
// MASTER DATA READ
// ============================================================
function getMasterData() {
  try {
    ensureAllSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sRows = ss.getSheetByName(SH_MASTER_SANTRI).getDataRange().getValues();
    const hRows = ss.getSheetByName(SH_MASTER_HALAQAH).getDataRange().getValues();

    const santri = sRows.slice(1).filter(r => r[0]).map(r => ({
      id: String(r[0] || ''), nama: String(r[1] || ''), kelas: String(r[2] || ''),
      halaqah: String(r[3] || ''), foto: String(r[4] || ''),
      status: String(r[5] || 'Aktif'), sumber: String(r[6] || ''), catatan: String(r[7] || '')
    }));

    const halaqah = hRows.slice(1).filter(r => r[0]).map(r => ({
      id: String(r[0] || ''), nama: String(r[1] || ''), guru: String(r[2] || ''),
      status: String(r[3] || 'Aktif'), sumber: String(r[4] || '')
    }));

    return ok({ santri: santri, halaqah: halaqah });
  } catch (e) {
    Logger.log('getMasterData: ' + e);
    return err(e.toString(), { santri: [], halaqah: [] });
  }
}

// ============================================================
// SANTRI CRUD
// ============================================================
function createSantri(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    ensureAllSheets();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_SANTRI);
    const id = data.id || Utilities.getUuid();
    sheet.appendRow([id, data.nama || '', data.kelas || '', data.halaqah || '',
                     data.foto || '', data.status || 'Aktif', data.sumber || 'custom', data.catatan || '']);
    return ok({ id: id });
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function updateSantri(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_SANTRI);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        const oldName = String(rows[i][1]);
        const newName = data.nama || oldName;

        sheet.getRange(i + 1, 1).setValue(data.id);
        sheet.getRange(i + 1, 2).setValue(newName);
        sheet.getRange(i + 1, 3).setValue(data.kelas || '');
        sheet.getRange(i + 1, 4).setValue(data.halaqah || '');

        if (data.foto !== undefined) sheet.getRange(i + 1, 5).setValue(data.foto);
        sheet.getRange(i + 1, 6).setValue(data.status || 'Aktif');
        sheet.getRange(i + 1, 7).setValue(data.sumber || rows[i][6] || 'custom');
        sheet.getRange(i + 1, 8).setValue(data.catatan !== undefined ? data.catatan : (rows[i][7] || ''));

        if (oldName !== newName) syncSantriNameInDb(oldName, newName);
        return ok({});
      }
    }
    return err('Santri tidak ditemukan');
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function deleteSantri(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_SANTRI);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.getRange(i + 1, 6).setValue('Nonaktif');
        return ok({});
      }
    }
    return err('Santri tidak ditemukan');
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function syncSantriNameInDb(oldName, newName) {
  try {
    const sheet = getDbSheet(); if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) === oldName) sheet.getRange(i + 1, 2).setValue(newName);
    }
  } catch (e) { Logger.log('syncSantriName: ' + e); }
}

// ============================================================
// MUTASI MASSAL SANTRI (untuk fitur Pecah Halaqah)
// Payload: { items: [{ santriId, halaqahBaru }, ...] }
// Atomik: validasi semua dulu, baru apply. Kalau ada yang invalid,
//         tidak ada satu pun yang berubah.
// ============================================================
function mutateSantriBulk(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const items = (data && data.items) || [];
    if (!Array.isArray(items) || items.length === 0) {
      return err('items kosong atau bukan array');
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_SANTRI);
    if (!sheet) return err('Sheet Master_Santri tidak ditemukan');

    const rows = sheet.getDataRange().getValues();
    const rowNumById = new Map();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) rowNumById.set(String(rows[i][0]), i + 1);
    }

    // ---- VALIDASI (all-or-nothing) ----
    const errors = [];
    const planned = [];
    for (const it of items) {
      const id = String(it.santriId || '');
      if (!id) { errors.push('santriId kosong'); continue; }
      const rowNum = rowNumById.get(id);
      if (!rowNum) { errors.push('Santri ' + id + ' tidak ditemukan'); continue; }
      if (!it.halaqahBaru) { errors.push('Santri ' + id + ': halaqahBaru kosong'); continue; }
      planned.push({ rowNum, santriId: id, halaqahBaru: String(it.halaqahBaru) });
    }
    if (errors.length > 0) {
      return err('Validasi gagal, tidak ada yang diubah', { errors: errors });
    }

    // ---- APPLY ----
    planned.forEach(p => {
      sheet.getRange(p.rowNum, 4).setValue(p.halaqahBaru);
    });

    return ok({
      updated: planned.length,
      results: planned.map(p => ({ santriId: p.santriId, halaqahBaru: p.halaqahBaru, ok: true }))
    });
  } catch (e) {
    Logger.log('mutateSantriBulk: ' + e);
    return err(e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// HALAQAH CRUD
// ============================================================
function createHalaqah(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    ensureAllSheets();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_HALAQAH);
    const id = data.id || Utilities.getUuid();
    sheet.appendRow([id, data.nama || '', data.guru || '', data.status || 'Aktif', data.sumber || 'custom']);
    return ok({ id: id });
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function updateHalaqah(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_HALAQAH);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        const oldName = String(rows[i][1]);
        const newName = data.nama || oldName;
        sheet.getRange(i + 1, 1, 1, H_MASTER_HALAQAH.length).setValues([[
          data.id, newName, data.guru || '', data.status || 'Aktif',
          data.sumber || rows[i][4] || 'custom'
        ]]);
        if (oldName !== newName) syncHalaqahName(oldName, newName);
        return ok({});
      }
    }
    return err('Halaqah tidak ditemukan');
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function deleteHalaqah(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MASTER_HALAQAH);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.getRange(i + 1, 4).setValue('Nonaktif');
        return ok({});
      }
    }
    return err('Halaqah tidak ditemukan');
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function syncHalaqahName(oldName, newName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sSheet = ss.getSheetByName(SH_MASTER_SANTRI);
    const sRows = sSheet.getDataRange().getValues();
    for (let i = 1; i < sRows.length; i++) {
      if (String(sRows[i][3]) === oldName) sSheet.getRange(i + 1, 4).setValue(newName);
    }
    const dbSheet = getDbSheet();
    const dRows = dbSheet.getDataRange().getValues();
    for (let i = 1; i < dRows.length; i++) {
      if (String(dRows[i][3]) === oldName) dbSheet.getRange(i + 1, 4).setValue(newName);
    }
  } catch (e) { Logger.log('syncHalaqahName: ' + e); }
}

// ============================================================
// ACTIVITY RECORDS
// ============================================================
function getData() {
  try {
    const sheet = getDbSheet();
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map(row => ({
      __backendId: String(row[0] || ''), nama_santri: String(row[1] || ''),
      kelas: String(row[2] || ''), halaqah: String(row[3] || ''),
      tanggal: row[4] instanceof Date ? row[4].toISOString() : String(row[4] || ''),
      juz: String(row[5] || ''), surah: String(row[6] || ''), ayat: String(row[7] || ''),
      jumlah_baris: Number(row[8]) || 0, status: String(row[9] || ''),
      evaluasi: String(row[10] || ''), tipe: String(row[11] || ''), kehadiran: String(row[12] || '')
    }));
  } catch (e) { Logger.log('getData: ' + e); return []; }
}

function createRecord(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getDbSheet();
    const id = Utilities.getUuid();
    sheet.appendRow([id, data.nama_santri || '', data.kelas || '', data.halaqah || '',
                     data.tanggal || new Date().toISOString(), data.juz || '', data.surah || '',
                     data.ayat || '', data.jumlah_baris || 0, data.status || '',
                     data.evaluasi || '', data.tipe || '', data.kehadiran || '']);
    return ok({ id: id });
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function updateRecord(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getDbSheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.__backendId)) {
        sheet.getRange(i + 1, 1, 1, 13).setValues([[
          data.__backendId, data.nama_santri, data.kelas, data.halaqah,
          data.tanggal, data.juz, data.surah, data.ayat,
          data.jumlah_baris, data.status, data.evaluasi, data.tipe, data.kehadiran
        ]]);
        return ok({});
      }
    }
    return err('Record tidak ditemukan');
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

function deleteRecord(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getDbSheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.__backendId)) {
        sheet.deleteRow(i + 1);
        return ok({});
      }
    }
    return err('Record tidak ditemukan');
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

// ============================================================
// BULK ATTENDANCE
// Logika: skip Alfa jika santri sudah setoran (setoran_kehadiran) di tanggal sama
// ============================================================
function processBulkAttendance(attendances) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getDbSheet();
    const rows = sheet.getDataRange().getValues();
    let updatedCount = 0, addedCount = 0, skippedCount = 0;

    attendances.forEach(att => {
      let foundIndex = -1, hasSetoran = false;
      const attDateString = String(att.tanggal).split('T')[0];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (String(row[1]) !== String(att.nama_santri)) continue;
        const rowDateString = row[4] instanceof Date
          ? Utilities.formatDate(row[4], Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : String(row[4]).split('T')[0];
        if (rowDateString !== attDateString) continue;

        const tipe = String(row[11] || '').trim();
        if (tipe === 'setoran_kehadiran') {
          hasSetoran = true;
          if (att.kehadiran === 'Alfa') { skippedCount++; return; }
        }
        if (tipe === 'kehadiran' && foundIndex === -1) foundIndex = i;
      }

      if (foundIndex !== -1) {
        sheet.getRange(foundIndex + 1, 13).setValue(att.kehadiran);
        rows[foundIndex][12] = att.kehadiran;
        updatedCount++;
      } else if (!hasSetoran || att.kehadiran !== 'Alfa') {
        const id = Utilities.getUuid();
        const newRow = [id, att.nama_santri, att.kelas || '', att.halaqah || '',
                       att.tanggal, '', '', '', 0, '', '', 'kehadiran', att.kehadiran];
        sheet.appendRow(newRow);
        rows.push(newRow);
        addedCount++;
      }
    });
    return ok({ message: 'Update: ' + updatedCount + ', Tambah: ' + addedCount + ', Skip: ' + skippedCount });
  } catch (e) { return err(e.toString()); }
  finally { lock.releaseLock(); }
}

// ============================================================
// RIWAYAT SETORAN TERAKHIR (untuk panel input setoran)
// Payload: { santriNama, limit?, sebelumTanggal? }
// Catatan: Database menyimpan nama_santri, bukan santriId.
// ============================================================
function getRiwayatSetoran(data) {
  try {
    const santriNama = String((data && data.santriNama) || '').trim();
    const limit = Math.min(Number((data && data.limit) || 5), 50);
    const sebelumTanggal = data && data.sebelumTanggal ? new Date(data.sebelumTanggal) : null;

    if (!santriNama) return err('santriNama wajib diisi');

    const sheet = getDbSheet();
    if (!sheet) return ok({ records: [], total: 0 });

    const rows = sheet.getDataRange().getValues();
    const matches = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (String(row[1] || '') !== santriNama) continue;

      const tipe = String(row[11] || '');
      if (tipe !== 'setoran' && tipe !== 'setoran_kehadiran') continue;

      const tgl = row[4] instanceof Date ? row[4] : new Date(row[4]);
      if (sebelumTanggal && tgl >= sebelumTanggal) continue;

      matches.push({
        tanggal: tgl.toISOString(),
        juz: String(row[5] || ''),
        surah: String(row[6] || ''),
        ayat: String(row[7] || ''),
        jumlahBaris: Number(row[8]) || 0,
        status: String(row[9] || ''),
        evaluasi: String(row[10] || ''),
        tipe: tipe,
        kehadiran: String(row[12] || '')
      });
    }

    matches.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    return ok({ records: matches.slice(0, limit), total: matches.length });
  } catch (e) {
    Logger.log('getRiwayatSetoran: ' + e);
    return err(e.toString());
  }
}

// ============================================================
// API ROUTER
// ============================================================
function routeApi(action, payload) {
  try {
    switch (action) {
      case 'ping':
        return ok({ message: 'pong', ts: new Date().toISOString() });

      case 'getAll': {
        const md = getMasterData();
        if (!md.isOk) return err(md.message || 'Gagal baca master');
        return ok({
          records: getData(),
          masterSantri: md.santri || [],
          masterHalaqah: md.halaqah || []
        });
      }

      case 'getData':       return ok({ records: getData() });
      case 'getMasterData': return getMasterData();

      case 'createRecord':          return wrap(createRecord(payload));
      case 'updateRecord':          return wrap(updateRecord(payload));
      case 'deleteRecord':          return wrap(deleteRecord(payload));
      case 'processBulkAttendance': return wrap(processBulkAttendance(payload));

      case 'createSantri':  return wrap(createSantri(payload));
      case 'updateSantri':  return wrap(updateSantri(payload));
      case 'deleteSantri':  return wrap(deleteSantri(payload));

      case 'createHalaqah': return wrap(createHalaqah(payload));
      case 'updateHalaqah': return wrap(updateHalaqah(payload));
      case 'deleteHalaqah': return wrap(deleteHalaqah(payload));

      case 'mutateSantriBulk': return mutateSantriBulk(payload);
      case 'getRiwayatSetoran': return getRiwayatSetoran(payload);

      default:
        return err('Unknown action: ' + action);
    }
  } catch (e) {
    Logger.log('routeApi error [' + action + ']: ' + e);
    return err(e.toString());
  }
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  
  // 👇 Tambahkan header CORS agar diizinkan diakses dari GitHub Pages
  return output.setHeaders({
    'Access-Control-Allow-Origin': '*', // Atau ganti '*' dengan 'https://dhanmarsjacka33-cmd.github.io' untuk lebih aman
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
}

// ============================================================
// ONE-TIME MIGRATION (jalankan sekali dari editor, hapus setelah sukses)
// ============================================================
const SEED_HALAQAH = [
  {id:1,nama:"Halaqah 1",guru:"Ust. Muhammad Ainul Fikri"},
  {id:2,nama:"Halaqah 2",guru:"Ust. Ibrahim Abdurrahman"},
  {id:3,nama:"Halaqah 3",guru:"Ust. Zarkasyi & Ust. Refa"},
  {id:4,nama:"Halaqah 4",guru:"Ust. Fawwaz & Ust. Fahmi"},
  {id:5,nama:"Halaqah 5",guru:"Ust. Rizky"},
  {id:6,nama:"Halaqah 6",guru:"Ust. Isyaka Aditya"},
  {id:7,nama:"Halaqah 7",guru:"Ust. Ilham Firmansyah"},
  {id:8,nama:"Halaqah 8",guru:"Ust. Muhammad Harun"},
  {id:9,nama:"Halaqah 9",guru:"Ustz. Alifia Dewi"},
  {id:10,nama:"Halaqah 10",guru:"Ustz. Nadhifah"},
  {id:11,nama:"Halaqah 11",guru:"Ustz. Khofa Maqoma"},
  {id:12,nama:"Halaqah 12",guru:"Ustz. Nada Nabila"},
  {id:13,nama:"Halaqah 13",guru:"Ustz. Safira Fitatunnida"},
  {id:14,nama:"Halaqah 14",guru:"Ust. Warsa"},
  {id:15,nama:"Halaqah 15",guru:"Ustz. Geby"}
];

const SEED_SANTRI = [
  ["Azka Chairul Akbar",1,"7.1"],["M. Zaki hasanudin",1,"7.1"],["Muhammad Adzfar Rafi",1,"8.1"],["Azka Nur Maulana",1,"8.1"],["Muhammad Nabil Arrasyid",1,"8.1"],["Muhammad Abdul Barri",1,"8.1"],["Azzam Fu'adi",1,"8.1"],["Ahmad Nurridho",1,"8.1"],["Sayid M. Rizky Assegaf",1,"8.1"],["Alpasah Srirama Nanda Maharaz",1,"8.1"],["Muhammad Althaf Zidna Kamal",1,"8.1"],["Husain Al Ashari",1,"8.1"],["Ichsan Gunawan Putra",1,"8.1"],["Akio Zain Kanz",1,"8.1"],["Muhammad Syamil Khourulloh R",1,"9.1"],["Muhammad Salman Alfarisri R",1,"9.1"],["Althaf Zahir Syaubil Haq",1,"7.1"],
  ["Muhamad Virgiawan",2,"8.1"],["Hasan Al Ashari",2,"8.1"],["Muhamad Rekha Hannaby",2,"8.1"],["Mohamad Fajrul Falah",2,"8.1"],["Firmasyah",2,"8.2"],["Muhammad Daffa Alfarizi",2,"8.2"],["Satria Giza",2,"8.2"],["Mohammad Abror Husnan Nadar",2,"9.1"],["Muhammad Fairuz Ridho",2,"9.1"],["afghani Rauf",2,"9.1"],["Gavin Muhammad fairuz",2,"9.2"],["Muhammad Revan sugiatro",2,"9.2"],["Mahesa",2,"9.2"],["Miftahul rafi",2,"9.2"],
  ["Reyhan Anugrah",3,"9.1"],["Askara Buana Putra",3,"9.1"],["Raka Wahyu Saputra",3,"9.1"],["Azka Wildan Perdana",3,"9.1"],["Vian bintana",3,"9.1"],["Sayid arif rahman",3,"9.1"],["Rofi maulana sidqi",3,"9.1"],["Kaisan Alzam Bazli",3,"9.1"],["Muhamad Akhas PRAYATA",3,"9.1"],["Rizki alifansyah",3,"9.1"],["Muhammad Rizqy Harun",3,"9.1"],["Kenan Satriaji",3,"9.1"],["Muhamad Ridwan",3,"9.1"],["Muhammad Rafa Al-Faiz",3,"9.1"],["Muhamad Zaky Nur Hidayat",3,"9.1"],["Raja Gavin shirazi",3,"9.2"],["Razka irwandi",3,"9.2"],["Rafi udin",3,"9.2"],["Muhammad Raihan Rizki",3,"9.2"],["Muhammad Alfin azis",3,"9.2"],["Muhammad rifati",3,"9.2"],["Muhammad ajizi Mubarok berutu",3,"9.2"],["Raihan Aditya ramadhan",3,"9.2"],["Muhammad Arfan firdaus",3,"9.2"],["Reza Maulana",3,"9.2"],
  ["Ahmad Syatibi Mukhtar",4,"7.1"],["Alby Luthfy",4,"7.1"],["Alfahmi assiddiq",4,"7.1"],["Alfarq Fathan Azzamy",4,"7.1"],["Amar Firdan",4,"7.1"],["Aqilah Zein Burvy Wibisono",4,"7.1"],["Arjuna Ahza Ardhani",4,"7.1"],["Caturangga Syawal Luqman",4,"7.1"],["Egi Erlanga",4,"7.1"],["Fahri",4,"7.1"],["Fauzan Adli Azhim",4,"7.1"],["Fikri Permana",4,"7.1"],["Ghozi Muhammad Zarkasyi",4,"7.1"],["Gibran Aidan syham hairuman",4,"7.1"],["Ikhsan",4,"7.1"],["M. Raditya saputra",4,"7.1"],["M. Rafka",4,"7.1"],["M. Surya pratama",4,"7.1"],["M. Widiadana",4,"7.1"],["Mikael AL fatih",4,"7.1"],["Muhammad Bintang Al Malik",4,"7.1"],["Naufal luqmansyah",4,"7.1"],["Nawar attaya risdullah",4,"7.1"],["Habibi Maulana Yusuf",4,"7.1"],["Radi ardiansyah",4,"7.1"],
  ["Muhammad Dzaky Alfajri",5,"8.1"],["Sayid M. Rizky Assegaf",5,"8.1"],["Arifin Nurrochman",5,"8.1"],["Zahid Uli Nuha",5,"8.1"],["Muhammad Zaedan Zain",5,"8.1"],["Yusup Maulana",5,"8.1"],["M. Brilian Al-Fadli",5,"8.1"],["Arkan Said Maulidan",5,"8.1"],["Akmal Rizki Wardana",5,"8.1"],["Amrizal Kamil",5,"8.1"],["Akhmad Zidni Mubarok",5,"8.1"],["Dafiq Nurali",5,"8.1"],["Darwis Nuruddin",5,"8.1"],["Demy Syah Reza",5,"8.2"],["Faris Raffa Nazkhan",5,"8.2"],["M Taufiq Ilham",5,"8.2"],["M Taofiq",5,"8.2"],["Malik Abdul Azis",5,"8.2"],["Muhammad Aditya Saputra",5,"8.2"],["Muhammad Bimantara",5,"8.2"],["Muhammad Farhan Rizky",5,"8.2"],["Muhammad Nuh Al Malik",5,"8.2"],["Rakha Putra Setiawan",5,"8.2"],["Veri Sanjaya",5,"8.2"],["Riyadh Arrachman",5,"8.1"],["Muhammad Fawwaz El Walad",5,"8.1"],
  ["Dhelisa amalliana",9,"7.2"],["Fakhma nuha",9,"7.2"],["Najwa khaira",9,"7.2"],["Amira Nadia Hasanah",9,"8.3"],["Nuhria khairi Azzahra",9,"7.2"],["Nur Iaila",9,"7.2"],["Prita Zakiya Syakhi",9,"7.2"],["Salwa Irfania Putri Adoria",9,"7.2"],["Annisa Dwi Azzahra",9,"8.3"],["Azzahra Shaqilla Putri Ramadhina",9,"8.3"],["Bilqis Aninda Fatkhu",9,"8.3"],["Denita Kumayirah",9,"8.3"],["Faezea Khairunnisa",9,"8.3"],["Jihan Nur Afifah",9,"8.3"],["Nida Inthifadhah",9,"8.3"],["Octavia Putri Andini",9,"8.3"],["Shintya Rahindramaya Baridz",9,"8.3"],["Siti Nafisa Fauziah",9,"8.3"],["Nazwa halim",9,"9.3"],["Deta",9,"9.3"],
  ["Annis Kusuma Dewi",10,"8.3"],["Asma Izatunisa",10,"8.3"],["Hanifa Rasyida",10,"8.3"],["Naurah Zahra Irviyani",10,"8.3"],["Pillar Andra Mecca",10,"9.3"],["Kitiyyah Nurmadanisa",10,"9.3"],["Tsabita Maulidya",10,"9.3"],["Nadinda Sugiana",10,"9.3"],["Meisha Tri W",10,"9.3"],["Sri Oktaviani",10,"9.3"],["Niyzilla",10,"9.3"],["Nayyara Adrena",10,"9.3"],["Salsabila Aulia",10,"9.3"],["Silvia Nuril Malla",10,"9.3"],["Adinda Olivia",10,"9.3"],["Aisyah Nur Maulida",10,"9.3"],["Almira Azalia Sikumbang",10,"9.3"],["Asyifa Cahaya Pratiwi",10,"9.3"],["Dea Nafaqotus Safira",10,"9.3"],
  ["Aida",11,"7.2"],["Alifa nailatul rahmah",11,"7.2"],["Darra Iiyana",11,"7.2"],["Jihan ayu syifa",11,"7.2"],["Kirana nafisa",11,"7.2"],["Mutmainnah",11,"7.2"],["Natasya suherman",11,"7.2"],["Siti elfira",11,"7.2"],["Nurul Kayla Kurota'ayun",11,"7.2"],["Sarfah Nur Azizah",11,"7.2"],["Adsila Roses Aura Risky",11,"8.3"],["Anisa Al Zatna",11,"6.3"],["Asila Fitriyani",11,"8.3"],["Aulia Najwa Al Farotunisa",11,"8.3"],["Aziza Qurrotul'aini Rahmatin",11,"8.3"],["Delvira Nindytia Attaya",11,"8.3"],["Denisa Wahyu Denovianti",11,"8.3"],["Arisa Kania Salsabila",11,"8.3"],["Eliana Hafizatun Zahra",11,"8.3"],["Ghina Alfatunisa",11,"8.3"],["Intan Septiani Apendi",11,"8.3"],["Linda Putri Alawiyah",11,"8.3"],
  ["Nafisa Yumna Attalah",12,"8.3"],["Rifda Maharani",12,"8.3"],["Risa Safitri",12,"8.3"],["Shalma Amelia Putri",12,"8.3"],["Siti Fadilah",12,"8.3"],["Yuan Saekyla",12,"8.3"],["Zahra Ramadhanie",12,"8.3"],["Amel",12,"8.3"],["Tazlah Afrilia",12,"9.3"],["Silviyana Adelia",12,"9.3"],["Kalila Putri",12,"9.3"],["Salsabila Efda",12,"9.3"],["Salsabila Gyna",12,"9.3"],["Halifa Umarama",12,"9.3"],["Miftahul Bilqis",12,"9.3"],["Silvia Lusinda",12,"9.3"],["Refi Aprilia",12,"9.3"],["Alya Sukma Dewi",12,"9.3"],["Aska Winda Maulana",12,"9.3"],["Azzahra Suryani",12,"9.3"],["Dewi Nurul Wulan",12,"9.3"],["Qunayta",12,"9.3"],["Nihla",12,"9.3"],
  ["Fahmi Fadilah Rahman",6,"10"],["M Jidan Akbar",6,"10"],["Miqdad Al Faruq",6,"10"],["Nabil Fahreza",6,"10"],["Nurkholis Majid",6,"10"],["Wiksa Gyasi Pratama",6,"10"],["Ahmad ainun najib",6,"10"],["Andika rifai putra",6,"10"],["Fatih ahzami",6,"10"],["Muhamad Fazar",6,"10"],["Muhammad Zubair C",6,"10"],["Nhauval Poetra Anshori",6,"10"],["Noval Ibnu Sina",6,"10"],["Rio Naufal",6,"10"],["Shafy Hanan M",6,"10"],["Arifin Ilham",6,"10"],["Daffa Ulhaq",6,"10"],["Hafitz Alfauzan",6,"10"],["Muhammad Amrri Mardani",6,"10"],["Muhammad Reza Saputra",6,"10"],["Rivaldo Alif Lamro",6,"10"],["Taufik Ramadani",6,"10"],["Yusuf Arhab Tsaqib",6,"10"],["Zaki Musyaffa",6,"10"],
  ["Adit Saputra",7,"11"],["Rais Musthafa Humayun",7,"11"],["Muhammad Malika Yusnadi",7,"11"],["Hanif Maulana Irawan",7,"11"],["Ardito Sadewo",7,"11"],["M Rafiko Maulana",7,"11"],["Fauzi Nuryafi Asyandhanu",7,"11"],["Muhammad Rizky Herdiyanto",7,"11"],["Febrika erwansyah",7,"11"],["Al-ghifari aqsa",7,"11"],["Ahmad balya",7,"11"],["Ibrahim alhafizh",7,"11"],["Asep jaelani",7,"11"],["Athalla muzaffar",7,"11"],
  ["Akbar maulana",8,"12"],["Radithya Ibrahim Kiandra",8,"12"],["Muhammad Ripal Adiansyah",8,"12"],["Ahmad Pyrmansyah",8,"12"],["Muhammad Sadik Ernandes",8,"12"],["Arjuna Said Maulana",8,"12"],["Ridho Syuraih Khoerudin",8,"12"],["Radya Yusuf Kiandra",8,"12"],["Adam Dae",8,"12"],["Nuril Anam Fadli",8,"12"],["Sebastian Bima",8,"12"],["Ahmad Fahri",8,"12"],["M Raja Malfiana Pasah",8,"12"],
  ["Afifah Khoirunnisa",13,"10"],["Asyifa Qurotu Aini",13,"10"],["Azza Fitriya Alfi",13,"10"],["Hilwa Abida",13,"10"],["Nurul Azkia",13,"10"],["Zivilia Hasna",13,"10"],["Kamaelani Nur Fikriyah",13,"10"],["Kayla Salwa",13,"10"],["Marsha Nur Widianty",13,"10"],["Nasifa Aulia Putri",13,"10"],["Nur Aisia",13,"10"],["Qoulani Latifa Hakim",13,"10"],["Sahla nur athifa",13,"10"],["Sella Nur Fadilah",13,"10"],["Siti maenubah",13,"10"],["Wafa fadhilah",13,"10"],["Siti Marwah",13,"10"],["Andini",13,"10"],
  ["Nafisa Nurrohma",14,"11.2"],["Medina Azzahra",14,"11.2"],["Maylani Wennariyani",14,"11.2"],["Malca Orlin Alfishara",14,"11.2"],["Kamila Maratul Halwa",14,"11.2"],["Azzahra Adelia",14,"11.2"],["Aulia Qurrita'ayun",14,"11.2"],["Salsa nabila",14,"11.2"],["Zahrotul hayati",14,"11.2"],["Kesa awaliya",14,"11.2"],["Hasna afifah",14,"11.2"],["Syiffa nurrahmah",14,"11.2"],["Priscilla dela",14,"11.2"],["Nadia cahya putri",14,"11.2"],["Putty salisa",14,"11.2"],["Siti wahyuni",14,"11.2"],["Qaila safira",14,"11.2"],
  ["Kurnia Nur Azzahra",15,"12.2"],["Zaira Nadeesta",15,"12.2"],["Ismi Nur Rahmawati",15,"12.2"],["Istiana",15,"12.2"],["Fatimah Zahro",15,"12.2"],["Aini Nur Safira",15,"12.2"],["Mira Andriyani",15,"12.2"],["Syafa nuraida",15,"12.2"],["Savira Meliyana",15,"12.2"],["Nindia Arini",15,"12.2"],["Aisyah Ayu",15,"12.2"],["Nadia Arlita",15,"12.2"],["Mirna Amelia Sari",15,"12.2"],["Ika Silvia",15,"12.2"],["Rani",15,"12.2"],["Dwi novita raudhatul jannah",15,"12.2"],["Rayi sri rahmawati",15,"12.2"],["Rizky amelia",15,"12.2"],["Mutiara suci",15,"12.2"],["Faza amelia fahrurazi",15,"12.2"],["Maryam filia",15,"12.2"],["Dwi novita raudhotul jannah",15,"12.2"]
];

function runMigrationOnce() {
  ensureAllSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sSheet = ss.getSheetByName(SH_MASTER_SANTRI);
  const hSheet = ss.getSheetByName(SH_MASTER_HALAQAH);

  if (sSheet.getLastRow() > 1 || hSheet.getLastRow() > 1) {
    const msg = '⚠️ Master sheet sudah berisi data. Migrasi dibatalkan.';
    Logger.log(msg);
    return msg;
  }

  const dbSheet = getDbSheet();
  const dbData = dbSheet ? dbSheet.getDataRange().getValues().slice(1) : [];
  const records = dbData.map(row => ({
    tipe: String(row[11] || ''),
    nama_santri: String(row[1] || ''),
    kelas: String(row[2] || ''),
    halaqah: String(row[3] || ''),
    juz: String(row[5] || ''),
    surah: String(row[6] || ''),
    status: String(row[9] || ''),
    evaluasi: String(row[10] || ''),
    tanggal: row[4]
  }));

  const halaqahMap = new Map();
  SEED_HALAQAH.forEach(h => {
    halaqahMap.set(h.nama.toLowerCase().trim(), {
      id: Utilities.getUuid(), nama: h.nama, guru: h.guru,
      status: 'Aktif', sumber: 'base'
    });
  });
  records.filter(r => r.tipe === 'profil_guru').forEach(r => {
    const key = String(r.halaqah).toLowerCase().trim();
    if (halaqahMap.has(key)) halaqahMap.get(key).guru = r.nama_santri;
    else halaqahMap.set(key, { id: Utilities.getUuid(), nama: r.halaqah, guru: r.nama_santri, status: 'Aktif', sumber: 'custom' });
  });
  records.filter(r => r.tipe === 'hapus_guru').forEach(r => {
    const key = String(r.evaluasi).toLowerCase().trim();
    if (halaqahMap.has(key)) halaqahMap.get(key).status = 'Nonaktif';
  });

  const santriMap = new Map();
  SEED_SANTRI.forEach(s => {
    const nama = String(s[0]).trim();
    const hData = SEED_HALAQAH.find(h => h.id === s[1]);
    santriMap.set(nama.toLowerCase(), {
      id: Utilities.getUuid(), nama: nama, kelas: String(s[2]).trim(),
      halaqah: hData ? hData.nama : '', foto: '', status: 'Aktif', sumber: 'base', catatan: ''
    });
  });
  records.filter(r => r.tipe === 'profil_santri').forEach(r => {
    if (r.evaluasi && r.evaluasi.startsWith('edit:')) {
      const oldKey = String(r.evaluasi.replace('edit:', '')).trim().toLowerCase();
      if (santriMap.has(oldKey)) {
        const s = santriMap.get(oldKey);
        const newName = r.nama_santri;
        s.nama = newName; s.kelas = r.kelas; s.halaqah = r.halaqah;
        if (r.surah) s.foto = r.surah;
        if (r.status) s.catatan = r.status;
        if (oldKey !== newName.toLowerCase()) { santriMap.delete(oldKey); santriMap.set(newName.toLowerCase(), s); }
      }
    } else if (r.nama_santri && !santriMap.has(r.nama_santri.toLowerCase())) {
      santriMap.set(r.nama_santri.toLowerCase(), {
        id: Utilities.getUuid(), nama: r.nama_santri, kelas: r.kelas, halaqah: r.halaqah,
        foto: r.surah || '', status: 'Aktif', sumber: 'custom', catatan: r.status || ''
      });
    }
  });
  records.filter(r => r.tipe === 'hapus_santri').forEach(r => {
    const key = String(r.evaluasi).trim().toLowerCase();
    if (santriMap.has(key)) santriMap.get(key).status = 'Nonaktif';
  });
  records.filter(r => r.tipe === 'mutasi_tahfidz')
    .sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal))
    .forEach(m => {
      const key = String(m.nama_santri).trim().toLowerCase();
      if (santriMap.has(key) && m.juz) santriMap.get(key).halaqah = m.juz;
    });

  const hRows = [...halaqahMap.values()].map(h => [h.id, h.nama, h.guru, h.status, h.sumber]);
  if (hRows.length > 0) hSheet.getRange(2, 1, hRows.length, H_MASTER_HALAQAH.length).setValues(hRows);

  const sRows = [...santriMap.values()].map(s => [s.id, s.nama, s.kelas, s.halaqah, s.foto, s.status, s.sumber, s.catatan]);
  if (sRows.length > 0) sSheet.getRange(2, 1, sRows.length, H_MASTER_SANTRI.length).setValues(sRows);

  const msg = '✅ Migrasi selesai: ' + sRows.length + ' santri, ' + hRows.length + ' halaqah';
  Logger.log(msg);
  return msg;
}

// ============================================================
// DIAGNOSTIK & UTIL
// ============================================================
function diagnosticMasterSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];

  ['Master_Santri', 'Master_Halaqah'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      report.push('❌ ' + name + ': TIDAK ADA');
      return;
    }
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    const headers = lastRow >= 1 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    report.push('✅ ' + name + ': ' + (lastRow - 1) + ' baris data, ' + lastCol + ' kolom');
    report.push('   Header: [' + headers.join(' | ') + ']');
  });

  const msg = report.join('\n');
  Logger.log(msg);
  return msg;
}

function emergencyResetMasterSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const resp = ui.alert(
    '⚠️ HAPUS & BUAT ULANG SHEET MASTER',
    'Ini akan MENGHAPUS TOTAL sheet "Master_Santri" dan "Master_Halaqah".\n\n' +
    '✅ Sheet "Database" TIDAK akan dihapus — semua riwayat aman.\n' +
    '✅ Sheet "Master_Akun" TIDAK akan dihapus.\n\n' +
    'Lanjutkan?',
    ui.ButtonSet.YES_NO
  );

  if (resp !== ui.Button.YES) return 'Dibatalkan';

  if (ss.getSheetByName('Master_Santri')) ss.deleteSheet(ss.getSheetByName('Master_Santri'));
  if (ss.getSheetByName('Master_Halaqah')) ss.deleteSheet(ss.getSheetByName('Master_Halaqah'));

  const msg = '✅ Sheet Master dihapus. Siap jalankan runMigrationOnce.';
  Logger.log(msg);
  return msg;
}

function fixMasterHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName('Master_Santri');
  const h = ss.getSheetByName('Master_Halaqah');

  if (s) {
    s.getRange(1, 1, 1, 8).setValues([['ID','Nama','Kelas','Halaqah','Foto','Status','Sumber','Catatan']]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#e8f3ef');
  }
  if (h) {
    h.getRange(1, 1, 1, 5).setValues([['ID','Nama','Guru','Status','Sumber']]);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e8f3ef');
  }

  Logger.log('✅ Header diperbaiki');
  return '✅ Header Master_Santri & Master_Halaqah diperbaiki';
}

function TEST_ALL() {
  Logger.log('=== TES GET MASTER DATA ===');
  try {
    const md = getMasterData();
    Logger.log('isOk: ' + md.isOk);
    Logger.log('Jumlah santri: ' + (md.santri ? md.santri.length : 'NULL'));
    Logger.log('Jumlah halaqah: ' + (md.halaqah ? md.halaqah.length : 'NULL'));
    if (md.santri && md.santri.length > 0) Logger.log('Contoh santri[0]: ' + JSON.stringify(md.santri[0]));
    if (md.halaqah && md.halaqah.length > 0) Logger.log('Contoh halaqah[0]: ' + JSON.stringify(md.halaqah[0]));
    if (md.message) Logger.log('Message: ' + md.message);
  } catch (e) {
    Logger.log('ERROR getMasterData: ' + e.toString());
  }

  Logger.log(' ');
  Logger.log('=== TES GET DATA (Database) ===');
  try {
    const d = getData();
    Logger.log('Jumlah records: ' + (d ? d.length : 'NULL'));
    if (d && d.length > 0) Logger.log('Contoh record[0]: ' + JSON.stringify(d[0]));
  } catch (e) {
    Logger.log('ERROR getData: ' + e.toString());
  }

  Logger.log(' ');
  Logger.log('=== TES SHEET INFO ===');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Master_Santri', 'Master_Halaqah', 'Database'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      Logger.log(name + ': LastRow=' + sh.getLastRow() + ', LastCol=' + sh.getLastColumn());
      if (sh.getLastRow() >= 1) {
        const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        Logger.log('  Header: [' + hdr.join(' | ') + ']');
      }
    } else {
      Logger.log(name + ': TIDAK ADA');
    }
  });
}

function debugSantriNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Master_Santri');
  const data = sh.getDataRange().getValues().slice(1).filter(r => r[0]);

  Logger.log('=== MASTER_SANTRI ===');
  Logger.log('Total baris: ' + data.length);

  const nameMap = {};
  data.forEach((r, i) => {
    const key = String(r[1]).trim().toLowerCase();
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push({ row: i + 2, id: r[0], nama: r[1], halaqah: r[3], sumber: r[6], status: r[5] });
  });

  let dupCount = 0;
  Logger.log(' ');
  Logger.log('=== DUPLIKAT (nama sama, case-insensitive) ===');
  Object.keys(nameMap).forEach(key => {
    if (nameMap[key].length > 1) {
      dupCount++;
      Logger.log('⚠️ "' + key + '" (' + nameMap[key].length + 'x):');
      nameMap[key].forEach(x => Logger.log('   Row ' + x.row + ': "' + x.nama + '" | ' + x.halaqah + ' | sumber=' + x.sumber + ' | status=' + x.status));
    }
  });
  if (dupCount === 0) Logger.log('✅ Tidak ada duplikat');

  Logger.log(' ');
  Logger.log('=== CARI NAMA SPESIFIK ===');
  ['nawaf', 'rofi', 'maulana'].forEach(term => {
    Logger.log('--- "' + term + '" ---');
    data.forEach((r, i) => {
      if (String(r[1]).toLowerCase().indexOf(term) !== -1) {
        Logger.log('Row ' + (i + 2) + ': "' + r[1] + '" | ' + r[3] + ' | sumber=' + r[6] + ' | status=' + r[5]);
      }
    });
  });

  Logger.log(' ');
  Logger.log('=== RECORD PROFIL_SANTRI DI DATABASE ===');
  const db = ss.getSheetByName('Database');
  const dbData = db.getDataRange().getValues().slice(1);
  const profilRecs = dbData.filter(r => String(r[11]) === 'profil_santri');
  Logger.log('Total profil_santri records: ' + profilRecs.length);
  profilRecs.slice(0, 20).forEach(r => {
    Logger.log('"' + r[1] + '" | kelas=' + r[2] + ' | halaqah=' + r[3] + ' | evaluasi="' + r[10] + '"');
  });
  if (profilRecs.length > 20) Logger.log('... dan ' + (profilRecs.length - 20) + ' record lainnya');
}

// ============================================================
// PERBAIKAN DATA MIGRASI
// ============================================================
function previewPerbaikan() {
  if (typeof SEED_SANTRI === 'undefined' || !SEED_SANTRI || SEED_SANTRI.length === 0) {
    Logger.log('❌ SEED_SANTRI tidak ditemukan di Code.gs');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Master_Santri');
  const db = ss.getSheetByName('Database');

  const dbData = db.getDataRange().getValues().slice(1);

  const baseNameMap = {};
  SEED_SANTRI.forEach((s, idx) => { baseNameMap['base-' + idx] = String(s[0]).trim(); });

  const edits = {};
  const deletes = new Set();
  const unknownKeys = new Set();

  dbData.forEach(row => {
    const tipe = String(row[11] || '');
    const namaSantri = String(row[1] || '');
    const kelas = String(row[2] || '');
    const halaqah = String(row[3] || '');
    const evaluasi = String(row[10] || '');
    const tanggal = row[4];

    if (tipe === 'profil_santri' && evaluasi.indexOf('edit:') === 0) {
      const key = evaluasi.replace('edit:', '').trim();
      if (key.indexOf('base-') === 0) {
        const asli = baseNameMap[key];
        if (asli) {
          const k = asli.toLowerCase();
          if (!edits[k] || new Date(tanggal) > new Date(edits[k].tanggal)) {
            edits[k] = { nama_baru: namaSantri, kelas: kelas, halaqah: halaqah, tanggal: tanggal };
          }
        } else {
          unknownKeys.add(key);
        }
      }
    }

    if (tipe === 'hapus_santri') {
      const key = evaluasi.trim();
      if (key.indexOf('base-') === 0) {
        const asli = baseNameMap[key];
        if (asli) deletes.add(asli.toLowerCase());
        else unknownKeys.add(key);
      } else {
        deletes.add(key.toLowerCase());
      }
    }
  });

  Logger.log('╔══════════════════════════════════════════════════════════╗');
  Logger.log('║            PREVIEW PERBAIKAN DATA MIGRASI                ║');
  Logger.log('╚══════════════════════════════════════════════════════════╝');
  Logger.log('');
  Logger.log('📊 Master_Santri saat ini: ' + sh.getDataRange().getValues().slice(1).filter(r => r[0]).length + ' baris');
  Logger.log('📊 Total profil_santri records: ' + dbData.filter(r => String(r[11]) === 'profil_santri').length);
  Logger.log('📊 Total hapus_santri records: ' + dbData.filter(r => String(r[11]) === 'hapus_santri').length);
  Logger.log('');
  Logger.log('✏️  RENAMES akan diterapkan: ' + Object.keys(edits).length);
  Logger.log('─────────────────────────────────────────────────────────');
  let c = 0;
  Object.keys(edits).forEach(k => {
    if (c++ < 40) Logger.log('  "' + k + '" → "' + edits[k].nama_baru + '" | ' + edits[k].halaqah + ' | Kls ' + edits[k].kelas);
  });
  if (Object.keys(edits).length > 40) Logger.log('  ... dan ' + (Object.keys(edits).length - 40) + ' edit lainnya');
  Logger.log('');

  Logger.log('🗑️  DEACTIVATIONS akan diterapkan: ' + deletes.size);
  Logger.log('─────────────────────────────────────────────────────────');
  deletes.forEach(k => Logger.log('  "' + k + '"'));
  Logger.log('');

  if (unknownKeys.size > 0) {
    Logger.log('⚠️  Unknown base keys (tidak match SEED_SANTRI): ' + unknownKeys.size);
    Logger.log('─────────────────────────────────────────────────────────');
    let uk = 0;
    unknownKeys.forEach(k => { if (uk++ < 20) Logger.log('  "' + k + '"'); });
    if (unknownKeys.size > 20) Logger.log('  ... dan ' + (unknownKeys.size - 20) + ' lainnya');
    Logger.log('');
  }

  const freshSData = sh.getDataRange().getValues();
  const nameGroups = {};
  freshSData.slice(1).forEach((row, i) => {
    if (!row[0]) return;
    const key = String(row[1]).trim().toLowerCase();
    if (!nameGroups[key]) nameGroups[key] = [];
    nameGroups[key].push({ rowNum: i + 2, nama: row[1], sumber: String(row[6] || '') });
  });

  let dupGroups = 0;
  let dupRows = 0;
  Object.keys(nameGroups).forEach(key => {
    if (nameGroups[key].length > 1) {
      dupGroups++;
      dupRows += nameGroups[key].length - 1;
    }
  });

  Logger.log('🔁 DUPLIKAT ditemukan: ' + dupGroups + ' grup, ' + dupRows + ' baris akan dihapus');
  Logger.log('─────────────────────────────────────────────────────────');
  let dc = 0;
  Object.keys(nameGroups).forEach(key => {
    if (nameGroups[key].length > 1 && dc++ < 30) {
      Logger.log('  "' + nameGroups[key][0].nama + '" x' + nameGroups[key].length);
    }
  });
  if (dupGroups > 30) Logger.log('  ... dan ' + (dupGroups - 30) + ' grup lainnya');
  Logger.log('');
  Logger.log('╔══════════════════════════════════════════════════════════╗');
  Logger.log('║  Untuk APPLY: jalankan fungsi applyPerbaikan()           ║');
  Logger.log('║  ⚠️  Backup dulu sebelum apply!                          ║');
  Logger.log('╚══════════════════════════════════════════════════════════╝');
}

function applyPerbaikan() {
  if (typeof SEED_SANTRI === 'undefined' || !SEED_SANTRI || SEED_SANTRI.length === 0) {
    Logger.log('❌ SEED_SANTRI tidak ditemukan. Batal.');
    return;
  }

  Logger.log('🚀 Memulai apply perbaikan...');
  const startTime = new Date();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Master_Santri');
  const db = ss.getSheetByName('Database');

  const dbData = db.getDataRange().getValues().slice(1);

  const baseNameMap = {};
  SEED_SANTRI.forEach((s, idx) => { baseNameMap['base-' + idx] = String(s[0]).trim(); });

  // 1. RENAMES
  const edits = {};
  dbData.forEach(row => {
    const tipe = String(row[11] || '');
    const evaluasi = String(row[10] || '');
    const tanggal = row[4];
    if (tipe !== 'profil_santri' || evaluasi.indexOf('edit:') !== 0) return;
    const key = evaluasi.replace('edit:', '').trim();
    if (key.indexOf('base-') !== 0) return;
    const asli = baseNameMap[key];
    if (!asli) return;
    const k = asli.toLowerCase();
    if (!edits[k] || new Date(tanggal) > new Date(edits[k].tanggal)) {
      edits[k] = {
        nama_baru: String(row[1] || ''),
        kelas: String(row[2] || ''),
        halaqah: String(row[3] || ''),
        tanggal: tanggal
      };
    }
  });

  let renamedCount = 0;
  let sData = sh.getDataRange().getValues();
  for (let i = 1; i < sData.length; i++) {
    if (!sData[i][0]) continue;
    const nama = String(sData[i][1]).trim();
    const key = nama.toLowerCase();
    if (edits[key]) {
      const e = edits[key];
      sh.getRange(i + 1, 2).setValue(e.nama_baru);
      sh.getRange(i + 1, 3).setValue(e.kelas);
      sh.getRange(i + 1, 4).setValue(e.halaqah);
      Logger.log('✏️  Renamed: "' + nama + '" → "' + e.nama_baru + '"');
      renamedCount++;
    }
  }
  Logger.log('✅ ' + renamedCount + ' santri di-rename');

  // 2. DELETES
  const deletes = new Set();
  dbData.forEach(row => {
    const tipe = String(row[11] || '');
    if (tipe !== 'hapus_santri') return;
    const key = String(row[10] || '').trim();
    if (key.indexOf('base-') === 0) {
      const asli = baseNameMap[key];
      if (asli) deletes.add(asli.toLowerCase());
    } else if (key) {
      deletes.add(key.toLowerCase());
    }
  });

  let deactCount = 0;
  sData = sh.getDataRange().getValues();
  for (let i = 1; i < sData.length; i++) {
    if (!sData[i][0]) continue;
    const nama = String(sData[i][1]).trim();
    if (deletes.has(nama.toLowerCase()) && sData[i][5] !== 'Nonaktif') {
      sh.getRange(i + 1, 6).setValue('Nonaktif');
      Logger.log('🗑️  Deactivated: "' + nama + '"');
      deactCount++;
    }
  }
  Logger.log('✅ ' + deactCount + ' santri dinonaktifkan');

  // 3. CLEANUP DUPLIKAT
  const sData2 = sh.getDataRange().getValues();
  const nameGroups = {};
  sData2.slice(1).forEach((row, i) => {
    if (!row[0]) return;
    const key = String(row[1]).trim().toLowerCase();
    if (!nameGroups[key]) nameGroups[key] = [];
    nameGroups[key].push({
      rowNum: i + 2, nama: row[1], sumber: String(row[6] || ''),
      status: String(row[5] || ''), id: String(row[0])
    });
  });

  const rowsToDelete = [];
  Object.keys(nameGroups).forEach(key => {
    const group = nameGroups[key];
    if (group.length <= 1) return;

    const baseEntries = group.filter(x => x.sumber === 'base');
    const aktifBase = baseEntries.filter(x => x.status === 'Aktif');

    if (aktifBase.length > 0) {
      let kept = false;
      group.forEach(x => {
        if (!kept && x.id === aktifBase[0].id) { kept = true; return; }
        rowsToDelete.push(x);
      });
    } else if (baseEntries.length > 0) {
      let kept = false;
      group.forEach(x => {
        if (!kept && x.id === baseEntries[0].id) { kept = true; return; }
        rowsToDelete.push(x);
      });
    } else {
      group.slice(1).forEach(x => rowsToDelete.push(x));
    }
  });

  rowsToDelete.sort((a, b) => b.rowNum - a.rowNum);
  rowsToDelete.forEach(x => {
    Logger.log('🔁 Delete dup: "' + x.nama + '" (row ' + x.rowNum + ', sumber=' + x.sumber + ')');
    sh.deleteRow(x.rowNum);
  });
  Logger.log('✅ ' + rowsToDelete.length + ' baris duplikat dihapus');

  // 4. REPORT
  const finalCount = sh.getDataRange().getValues().slice(1).filter(r => r[0]).length;
  const aktifCount = sh.getDataRange().getValues().slice(1).filter(r => r[0] && r[5] === 'Aktif').length;
  const dur = ((new Date() - startTime) / 1000).toFixed(2);

  Logger.log('');
  Logger.log('╔══════════════════════════════════════════════════════════╗');
  Logger.log('║                    SELESAI                               ║');
  Logger.log('╚══════════════════════════════════════════════════════════╝');
  Logger.log('  Renames:        ' + renamedCount);
  Logger.log('  Deactivated:    ' + deactCount);
  Logger.log('  Duplikat hapus: ' + rowsToDelete.length);
  Logger.log('  Total baris:    ' + finalCount);
  Logger.log('  Aktif:          ' + aktifCount);
  Logger.log('  Nonaktif:       ' + (finalCount - aktifCount));
  Logger.log('  Waktu:          ' + dur + 's');
  Logger.log('');
  Logger.log('✅ Fix selesai. Refresh aplikasi web untuk lihat hasilnya.');
}
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}