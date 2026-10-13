/**
 * SISTEM REKAP HAFALAN SANTRI - BACKEND
 * 
 * Sheets:
 *  - Database       : Aktivitas harian
 *  - Master_Santri  : Master data santri
 *  - Master_Halaqah : Master data halaqah
 */

const SHEET_NAME = 'Database';
const HEADERS = ['ID','Nama Santri','Kelas','Halaqah','Tanggal','Juz','Surah','Ayat','Jumlah Baris','Status','Evaluasi','Tipe','Kehadiran'];

const SH_MASTER_SANTRI = 'Master_Santri';
const SH_MASTER_HALAQAH = 'Master_Halaqah';
const H_MASTER_SANTRI = ['ID','Nama','Kelas','Halaqah','Foto','Status','Sumber','Catatan'];
const H_MASTER_HALAQAH = ['ID','Nama','Guru','Status','Sumber'];

// ============================================================
// WEB APP ENTRY
// ============================================================
function doGet() {
  ensureAllSheets();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Rekap Hafalan Santri')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
      id: String(r[0]||''), nama: String(r[1]||''), kelas: String(r[2]||''),
      halaqah: String(r[3]||''), foto: String(r[4]||''),
      status: String(r[5]||'Aktif'), sumber: String(r[6]||''), catatan: String(r[7]||'')
    }));
    
    const halaqah = hRows.slice(1).filter(r => r[0]).map(r => ({
      id: String(r[0]||''), nama: String(r[1]||''), guru: String(r[2]||''),
      status: String(r[3]||'Aktif'), sumber: String(r[4]||'')
    }));
    
    return { isOk: true, santri: santri, halaqah: halaqah };
  } catch(e) {
    Logger.log('getMasterData: ' + e);
    return { isOk: false, santri: [], halaqah: [], message: e.toString() };
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
    sheet.appendRow([id, data.nama||'', data.kelas||'', data.halaqah||'',
                     data.foto||'', data.status||'Aktif', data.sumber||'custom', data.catatan||'']);
    return { isOk: true, id: id };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
        sheet.getRange(i + 1, 1, 1, H_MASTER_SANTRI.length).setValues([[
          data.id, newName, data.kelas||'', data.halaqah||'',
          data.foto !== undefined ? data.foto : (rows[i][4]||''),
          data.status || 'Aktif', data.sumber || rows[i][6] || 'custom',
          data.catatan !== undefined ? data.catatan : (rows[i][7]||'')
        ]]);
        if (oldName !== newName) syncSantriNameInDb(oldName, newName);
        return { isOk: true };
      }
    }
    return { isError: true, message: 'Santri tidak ditemukan' };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
        return { isOk: true };
      }
    }
    return { isError: true, message: 'Santri tidak ditemukan' };
  } catch(e) { return { isError: true, message: e.toString() }; }
  finally { lock.releaseLock(); }
}

function syncSantriNameInDb(oldName, newName) {
  try {
    const sheet = getDbSheet(); if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) === oldName) sheet.getRange(i + 1, 2).setValue(newName);
    }
  } catch(e) { Logger.log('syncSantriName: ' + e); }
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
    sheet.appendRow([id, data.nama||'', data.guru||'', data.status||'Aktif', data.sumber||'custom']);
    return { isOk: true, id: id };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
          data.id, newName, data.guru||'', data.status||'Aktif',
          data.sumber || rows[i][4] || 'custom'
        ]]);
        if (oldName !== newName) syncHalaqahName(oldName, newName);
        return { isOk: true };
      }
    }
    return { isError: true, message: 'Halaqah tidak ditemukan' };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
        return { isOk: true };
      }
    }
    return { isError: true, message: 'Halaqah tidak ditemukan' };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
  } catch(e) { Logger.log('syncHalaqahName: ' + e); }
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
      __backendId: String(row[0]||''), nama_santri: String(row[1]||''),
      kelas: String(row[2]||''), halaqah: String(row[3]||''),
      tanggal: row[4] instanceof Date ? row[4].toISOString() : String(row[4]||''),
      juz: String(row[5]||''), surah: String(row[6]||''), ayat: String(row[7]||''),
      jumlah_baris: Number(row[8])||0, status: String(row[9]||''),
      evaluasi: String(row[10]||''), tipe: String(row[11]||''), kehadiran: String(row[12]||'')
    }));
  } catch(e) { Logger.log('getData: ' + e); return []; }
}

function createRecord(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getDbSheet();
    const id = Utilities.getUuid();
    sheet.appendRow([id, data.nama_santri||'', data.kelas||'', data.halaqah||'',
                     data.tanggal || new Date().toISOString(), data.juz||'', data.surah||'',
                     data.ayat||'', data.jumlah_baris||0, data.status||'',
                     data.evaluasi||'', data.tipe||'', data.kehadiran||'']);
    return { isOk: true, id: id };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
        return { isOk: true };
      }
    }
    return { isError: true, message: 'Record tidak ditemukan' };
  } catch(e) { return { isError: true, message: e.toString() }; }
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
        return { isOk: true };
      }
    }
    return { isError: true, message: 'Record tidak ditemukan' };
  } catch(e) { return { isError: true, message: e.toString() }; }
  finally { lock.releaseLock(); }
}

// FIXED: Skip Alfa jika santri sudah setoran di tanggal sama
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
          ? Utilities.formatDate(row[4], Session.getScriptTimeZone(), "yyyy-MM-dd")
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
        const newRow = [id, att.nama_santri, att.kelas||'', att.halaqah||'',
                       att.tanggal, '', '', '', 0, '', '', 'kehadiran', att.kehadiran];
        sheet.appendRow(newRow); rows.push(newRow);
        addedCount++;
      }
    });
    return { isOk: true, message: `Update: ${updatedCount}, Tambah: ${addedCount}, Skip: ${skippedCount}` };
  } catch(e) { return { isError: true, message: e.toString() }; }
  finally { lock.releaseLock(); }
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
  
  // ── Baca delta records lama ──
  const dbSheet = getDbSheet();
  const dbData = dbSheet ? dbSheet.getDataRange().getValues().slice(1) : [];
  const records = dbData.map(row => ({
    tipe: String(row[11]||''),
    nama_santri: String(row[1]||''),
    kelas: String(row[2]||''),
    halaqah: String(row[3]||''),
    juz: String(row[5]||''),
    surah: String(row[6]||''),
    status: String(row[9]||''),
    evaluasi: String(row[10]||''),
    tanggal: row[4]
  }));
  
  // ── Bangun halaqah map ──
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
  
  // ── Bangun santri map ──
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
    .sort((a,b) => new Date(a.tanggal) - new Date(b.tanggal))
    .forEach(m => {
      const key = String(m.nama_santri).trim().toLowerCase();
      if (santriMap.has(key) && m.juz) santriMap.get(key).halaqah = m.juz;
    });
  
  // ── Tulis ke sheet ──
  const hRows = [...halaqahMap.values()].map(h => [h.id, h.nama, h.guru, h.status, h.sumber]);
  if (hRows.length > 0) hSheet.getRange(2, 1, hRows.length, H_MASTER_HALAQAH.length).setValues(hRows);
  
  const sRows = [...santriMap.values()].map(s => [s.id, s.nama, s.kelas, s.halaqah, s.foto, s.status, s.sumber, s.catatan]);
  if (sRows.length > 0) sSheet.getRange(2, 1, sRows.length, H_MASTER_SANTRI.length).setValues(sRows);
  
  const msg = `✅ Migrasi selesai: ${sRows.length} santri, ${hRows.length} halaqah`;
  Logger.log(msg);
  return msg;
}
function diagnosticMasterSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];
  
  ['Master_Santri', 'Master_Halaqah'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      report.push(`❌ ${name}: TIDAK ADA`);
      return;
    }
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    const headers = lastRow >= 1 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    report.push(`✅ ${name}: ${lastRow - 1} baris data, ${lastCol} kolom`);
    report.push(`   Header: [${headers.join(' | ')}]`);
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
    s.getRange(1, 1, 1, 8).setValues([[ 'ID','Nama','Kelas','Halaqah','Foto','Status','Sumber','Catatan' ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#e8f3ef');
  }
  if (h) {
    h.getRange(1, 1, 1, 5).setValues([[ 'ID','Nama','Guru','Status','Sumber' ]]);
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
    if (md.santri && md.santri.length > 0) {
      Logger.log('Contoh santri[0]: ' + JSON.stringify(md.santri[0]));
    }
    if (md.halaqah && md.halaqah.length > 0) {
      Logger.log('Contoh halaqah[0]: ' + JSON.stringify(md.halaqah[0]));
    }
    if (md.message) Logger.log('Message: ' + md.message);
  } catch(e) {
    Logger.log('ERROR getMasterData: ' + e.toString());
  }
  
  Logger.log(' ');
  Logger.log('=== TES GET DATA (Database) ===');
  try {
    const d = getData();
    Logger.log('Jumlah records: ' + (d ? d.length : 'NULL'));
    if (d && d.length > 0) {
      Logger.log('Contoh record[0]: ' + JSON.stringify(d[0]));
    }
  } catch(e) {
    Logger.log('ERROR getData: ' + e.toString());
  }
  
  Logger.log(' ');
  Logger.log('=== TES SHEET INFO ===');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Master_Santri', 'Master_Halaqah', 'Database'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      Logger.log(`${name}: LastRow=${sh.getLastRow()}, LastCol=${sh.getLastColumn()}`);
      if (sh.getLastRow() >= 1) {
        const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        Logger.log(`  Header: [${hdr.join(' | ')}]`);
      }
    } else {
      Logger.log(`${name}: TIDAK ADA`);
    }
  });
}
// ============================================================
// API ROUTER UNTUK GITHUB PAGES FRONTEND
// ============================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ isError: true, message: 'No payload' });
    }
    
    const req = JSON.parse(e.postData.contents);
    const action = req.action;
    const payload = req.payload || {};
    
    const result = routeApi(action, payload);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ isError: true, message: err.toString() });
  }
}

// Override doGet lama untuk support API via query string (opsional, untuk testing)
function doGet(e) {
  // Jika ada ?action=xxx → jalankan API (untuk testing)
  if (e && e.parameter && e.parameter.action) {
    try {
      const payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
      const result = routeApi(e.parameter.action, payload);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ isError: true, message: err.toString() });
    }
  }
  
  // Fallback: serve old GAS-hosted app (kalau Index.html masih ada)
  try {
    ensureAllSheets();
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Rekap Hafalan Santri')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return jsonResponse({
      isOk: true,
      message: 'Rekap Hafalan API',
      ts: new Date().toISOString(),
      hint: 'POST dengan {action, payload} untuk akses API'
    });
  }
}

function routeApi(action, payload) {
  switch (action) {
    case 'ping':
      return { isOk: true, message: 'pong', ts: new Date().toISOString() };
    case 'getAll': {
      const md = getMasterData();
      return {
        isOk: true,
        records: getData(),
        masterSantri: md.santri || [],
        masterHalaqah: md.halaqah || []
      };
    }
    case 'getData': return getData();
    case 'getMasterData': return getMasterData();
    case 'createRecord': return createRecord(payload);
    case 'updateRecord': return updateRecord(payload);
    case 'deleteRecord': return deleteRecord(payload);
    case 'processBulkAttendance': return processBulkAttendance(payload);
    case 'createSantri': return createSantri(payload);
    case 'updateSantri': return updateSantri(payload);
    case 'deleteSantri': return deleteSantri(payload);
    case 'createHalaqah': return createHalaqah(payload);
    case 'updateHalaqah': return updateHalaqah(payload);
    case 'deleteHalaqah': return deleteHalaqah(payload);
    default:
      return { isError: true, message: 'Unknown action: ' + action };
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}