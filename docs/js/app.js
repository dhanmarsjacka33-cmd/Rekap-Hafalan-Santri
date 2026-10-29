// === LAZY LOADER ===
function loadScript(src) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); }
async function ensureChartLoaded() { if (typeof Chart === 'undefined') await loadScript('https://cdn.jsdelivr.net/npm/chart.js'); }
async function ensureCalendarLoaded() { if (typeof FullCalendar === 'undefined') { await loadScript('https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js'); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js'); } }

let selectedStudent = null;
let modalState = null;
let attendanceChart = null, setoranChart = null, ujianChart = null, progressionChart = null;
let cropper = null, fullCalendarInstance = null;
let activeLeaderboardTab = "quran", currentLeaderboardData = [];
window.currentUser = null;

const byId = id => document.getElementById(id);
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function showToast(message, isError = false, undoId = null) { 
  const container = byId("toast-container"); if (!container) return; 
  const toast = document.createElement("div"); 
  toast.className = "toast"; 
  if (isError) toast.style.backgroundColor = "#dc2626"; 
  toast.innerHTML = `<i data-lucide="${isError ? 'alert-circle' : 'check-circle'}" style="width:18px;height:18px"></i><span>${esc(message)}</span>`; 
  
  if (undoId) {
    const btn = document.createElement('button');
    btn.className = "ml-auto bg-white text-stone-800 px-2 py-1 rounded text-xs font-bold";
    btn.textContent = 'Undo';
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = '...';
      await window.dataSdk.delete({__backendId: undoId, user: window.currentUser.username});
      toast.remove();
      showToast("Data dibatalkan");
    };
    toast.appendChild(btn);
  }

  container.appendChild(toast); 
  if (window.lucide) lucide.createIcons(); 
  setTimeout(() => { 
    if(toast.parentNode) {
      toast.style.opacity = '0'; 
      toast.style.transform = 'translateX(100%)'; 
      setTimeout(() => toast.remove(), 300); 
    }
  }, undoId ? 6000 : 3000); 
}

const todayKey = () => new Date().toLocaleDateString("en-CA");
const dateKey = v => v ? new Date(v).toLocaleDateString("en-CA") : "";
const getActiveDate = () => { const el = byId("global-input-date") || byId("global-input-date-roster"); return el && el.value ? el.value : todayKey(); };
const getIsoForDate = (dateStr) => { const d = new Date(dateStr); d.setHours(12, 0, 0, 0); return d.toISOString(); };

const getJenjang = (kelasStr) => { if (!kelasStr) return ""; const k = parseInt(kelasStr); if (k >= 7 && k <= 9) return "SMP"; if (k >= 10 && k <= 12) return "SMA"; return ""; };
const getPredikatUjian = (nilai) => { if (nilai >= 91) return "Mumtaaz"; if (nilai >= 81) return "Jayyid Jiddan"; if (nilai >= 71) return "Jayyid"; if (nilai >= 61) return "Maqbuul"; return "Roosib"; };
const isProfile = r => ["profil_santri","profil_guru","hapus_santri","hapus_guru","snapshot","mutasi_tahfidz","ujian_semester","kandidat_tes","agenda_tahfidz"].includes(r.tipe);
const activityRecords = () => window.records ? window.records.filter(r => !isProfile(r)) : [];

const parseCat = ev => {
    if (!ev) return "Sabaq";
    if (ev.includes("[Sabqi]") || ev.includes("[Murojaah]")) return "Sabqi";
    if (ev.includes("[Manzil]")) return "Manzil";
    return "Sabaq";
};
const cleanEv = ev => ev ? ev.replace(/\[(Sabaq|Sabqi|Manzil|Ziyadah|Murojaah)\]\s*/, "") : "";
const option = (sel, val, lbl) => { const o = document.createElement("option"); o.value = val; o.textContent = lbl; sel.appendChild(o); };
const clearSelect = (sel, txt) => { if (!sel) return; sel.innerHTML = ""; option(sel, "", txt); };
const EXCLUDED_TAHSIN_HALAQAH = ["Halaqah 3","Halaqah 4","Halaqah 5","Halaqah 7","Halaqah 8","Halaqah 11","Halaqah 12","Halaqah 15","Halaqah 16"];

function studentList() { if (!window.masterSantri) return []; return window.masterSantri.filter(s => s.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, "id")); }
function halaqahList() { if (!window.masterHalaqah) return []; return window.masterHalaqah.filter(h => h.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, "id", {numeric: true})); }
function kelasList() { if (!window.masterKelas) return []; return window.masterKelas.sort((a, b) => a.nama.localeCompare(b.nama, "id", {numeric: true})); }
function getHalaqahName(s) { return s.halaqah || ''; }

// LOGIN & INIT
if (byId("login-form")) {
  byId("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = byId("login-user").value.trim();
    const p = byId("login-pin").value.trim();
    const btn = byId("login-submit");
    const err = byId("login-error");
    
    btn.disabled = true; btn.textContent = "Memeriksa...";
    err.classList.add("hidden");

    try {
      const res = await window.dataSdk.login(u, p);
      if (res.isOk) {
        window.currentUser = res;
        sessionStorage.setItem('rhs_user', JSON.stringify(res));
        applyRole();
        byId("login-ui").classList.add("hidden");
        byId("main-ui").classList.remove("hidden");
        initAppData();
      } else {
        err.textContent = res.message || "Gagal login";
        err.classList.remove("hidden");
      }
    } catch (ex) {
      err.textContent = "Koneksi error";
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false; btn.textContent = "Masuk";
    }
  });
}

if (byId("logout-btn")) {
  byId("logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem('rhs_user');
    window.currentUser = null;
    location.reload();
  });
}

function checkAuth() {
  const saved = sessionStorage.getItem('rhs_user');
  if (saved) {
    try {
      window.currentUser = JSON.parse(saved);
      applyRole();
      byId("login-ui").classList.add("hidden");
      byId("main-ui").classList.remove("hidden");
      initAppData();
    } catch(e) {
      sessionStorage.removeItem('rhs_user');
      byId("login-ui").classList.remove("hidden");
    }
  } else {
    byId("login-ui").classList.remove("hidden");
  }
}

function applyRole() {
  if (!window.currentUser) return;
  if (byId("user-name-display")) byId("user-name-display").textContent = window.currentUser.username;
  if (byId("user-role-display")) byId("user-role-display").textContent = window.currentUser.role;

  if (window.currentUser.role === 'Guru') {
    byId("tab-lap-3").style.display = "none";
    byId("tab-lap-4").style.display = "none";
    byId("nav-dashboard").click();
    
    setTimeout(() => {
      const selH = byId("f-halaqah");
      if(selH) selH.value = window.currentUser.halaqah;
      if(selH) selH.disabled = true;
      renderAll();
    }, 500);
  }
}

function initAppData() {
  if (!window.APP_CONFIG || !window.APP_CONFIG.gasUrl) return;
  window.dataSdk.init({ onDataChanged(data) { renderAll(); } });
}

// NAVIGATION
const navBtns = document.querySelectorAll('.nav-btn');
const bottomNavBtns = document.querySelectorAll('.nav-bottom-btn');
const views = ['view-dashboard', 'view-input', 'view-laporan', 'view-agenda'];

function syncNav(targetView) {
  navBtns.forEach(b => {
    const isActive = b.id === 'nav-' + targetView.split('-')[1];
    b.classList.remove('bg-white', 'shadow-sm', 'text-[#1f6f54]', 'font-bold');
    b.classList.add('text-stone-300', 'font-semibold');
    if (isActive) {
      b.classList.add('bg-white', 'shadow-sm', 'text-[#1f6f54]', 'font-bold');
      b.classList.remove('text-stone-300', 'font-semibold');
    }
  });
  bottomNavBtns.forEach(b => {
    const isActive = b.getAttribute('onclick').includes(targetView);
    b.classList.remove('text-emerald-600');
    b.classList.add('text-stone-400');
    if (isActive) {
      b.classList.add('text-emerald-600');
      b.classList.remove('text-stone-400');
    }
  });
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetView = 'view-' + btn.id.split('-')[1];
    views.forEach(v => { if(byId(v)) byId(v).classList.add('hidden'); });
    if(byId(targetView)) byId(targetView).classList.remove('hidden');
    syncNav(targetView);
    
    if (targetView === 'view-agenda' && fullCalendarInstance) setTimeout(() => fullCalendarInstance.render(), 150);
    if (targetView === 'view-input' && typeof window.renderInputCepat === 'function') setTimeout(window.renderInputCepat, 100);
    if (targetView === 'view-laporan') switchRaporTab('lap-1');
    window.scrollTo(0, 0);
  });
});

function switchDashTab(tab) {
  const tabs = ['ringkasan', 'analitik'];
  tabs.forEach(t => {
    const el = byId('dash-' + t);
    const btn = byId('tab-dash-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
    if (btn) {
      if (t === tab) btn.className = "px-6 py-2 rounded-lg text-sm font-bold bg-white text-emerald-700 shadow-sm transition-all";
      else btn.className = "px-6 py-2 rounded-lg text-sm font-bold text-stone-500 hover:text-stone-700 transition-all";
    }
  });
  if (tab === 'analitik') { renderProgressionChart(); renderLeaderboard(); } else { renderStats(); }
}

function switchRaporTab(tab) {
  const tabs = ['lap-1', 'lap-2', 'lap-3', 'lap-4'];
  tabs.forEach(t => {
    const el = byId(t);
    const btn = byId('tab-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
    if (btn) {
      if (t === tab) btn.className = "px-4 py-2 rounded-lg text-xs md:text-sm font-bold bg-white text-emerald-700 shadow-sm transition-all";
      else btn.className = "px-4 py-2 rounded-lg text-xs md:text-sm font-bold text-stone-500 hover:text-stone-700 transition-all";
    }
  });
  if (tab === 'lap-3') { populateAdminFilters(); renderAdminStudents(); renderAdminClasses(); renderAdminUsers(); }
  if (tab === 'lap-4') { renderAuditLog(); }
}

// FILTER GLOBAL
if (byId('toggle-filter-btn')) {
  byId('toggle-filter-btn').addEventListener('click', () => {
    const body = byId('filter-body'), chev = byId('filter-chevron');
    if(body) body.classList.toggle('hidden');
    if(chev) chev.style.transform = body.classList.contains('hidden') ? 'rotate(180deg)' : 'rotate(0deg)';
  });
}

function populateAllFilters() { 
  const mH = byId("f-halaqah").value, lH = byId("leaderboard-halaqah").value, hH = byId("riwayat-filter-halaqah").value; const gH = byId("rekap-halaqah").value, uH = byId("rekap-ujian-halaqah").value, pH = byId("prog-halaqah").value; 
  populateHalaqahSelect(byId("f-halaqah"), "-- Semua Halaqah --", mH); 
  populateHalaqahSelect(byId("leaderboard-halaqah"), "Semua halaqah", lH); 
  populateHalaqahSelect(byId("riwayat-filter-halaqah"), "Semua halaqah", hH); 
  populateHalaqahSelect(byId("rekap-halaqah"), "Semua halaqah", gH); 
  populateHalaqahSelect(byId("rekap-ujian-halaqah"), "Semua halaqah", uH); 
  populateHalaqahSelect(byId("laporan-halaqah"), "-- Semua Halaqah --", byId("laporan-halaqah").value); 
  populateHalaqahSelect(byId("prog-halaqah"), "Semua halaqah", pH); 
  populateClassFilters(); populateHistoryNames(); 
}
function populateHalaqahSelect(sel, placeholder, cur) { clearSelect(sel, placeholder); halaqahList().forEach(h => option(sel, h.nama, `${h.nama} · ${h.guru}`)); if ([...sel.options].some(o => o.value === cur)) sel.value = cur; if (sel.id === "f-halaqah") { const dl = byId("halaqah-datalist"); if (dl) { dl.innerHTML = ""; halaqahList().forEach(h => option(dl, h.nama, h.nama)); } const tH = byId("mutasi-tujuan-halaqah"); if (tH) { clearSelect(tH, "-- Pilih Halaqah Tujuan --"); halaqahList().forEach(h => option(tH, h.nama, h.nama)); } } }
function classesFor(h) { return [...new Set(studentList().filter(s => !h || getHalaqahName(s) === h).map(s => s.kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", {numeric: true})); }
function populateClassSelect(sel, h, cur, ph) { clearSelect(sel, ph); classesFor(h).forEach(k => option(sel, k, `Kelas ${k}`)); if ([...sel.options].some(o => o.value === cur)) sel.value = cur; }
function populateClassFilters() { populateClassSelect(byId("f-kelas"), byId("f-halaqah").value, byId("f-kelas").value, "Semua kelas"); populateClassSelect(byId("leaderboard-kelas"), byId("leaderboard-halaqah").value, byId("leaderboard-kelas").value, "Semua kelas"); populateClassSelect(byId("riwayat-filter-kelas"), byId("riwayat-filter-halaqah").value, byId("riwayat-filter-kelas").value, "Semua kelas"); populateClassSelect(byId("rekap-kelas"), byId("rekap-halaqah").value, byId("rekap-kelas").value, "Semua kelas"); populateClassSelect(byId("rekap-ujian-kelas"), byId("rekap-ujian-halaqah").value, byId("rekap-ujian-kelas").value, "Semua kelas"); populateClassSelect(byId("laporan-kelas"), byId("laporan-halaqah").value, byId("laporan-kelas").value, "Semua kelas"); populateClassSelect(byId("prog-kelas"), byId("prog-halaqah").value, byId("prog-kelas").value, "Semua kelas"); populateLaporanSiswa(); }
function populateHistoryNames() { const selR = byId("riwayat-filter-nama"), curR = selR.value; const hR = byId("riwayat-filter-halaqah").value, kR = byId("riwayat-filter-kelas").value; const selP = byId("prog-nama"), curP = selP.value; const hP = byId("prog-halaqah").value, kP = byId("prog-kelas").value; const allLogs = window.records ? window.records.filter(r => r.tipe === "setoran_kehadiran" || r.tipe === "kehadiran" || r.tipe === "ujian_semester") : []; const namesR = [...new Set(allLogs.filter(r => (!hR || r.halaqah === hR) && (!kR || r.kelas === kR)).map(r => r.nama_santri).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")); clearSelect(selR, "Semua nama"); namesR.forEach(n => option(selR, n, n)); if ([...selR.options].some(o => o.value === curR)) selR.value = curR; const namesP = [...new Set(allLogs.filter(r => (!hP || r.halaqah === hP) && (!kP || r.kelas === kP)).map(r => r.nama_santri).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")); clearSelect(selP, "Semua nama"); namesP.forEach(n => option(selP, n, n)); if ([...selP.options].some(o => o.value === curP)) selP.value = curP; }
function populateLaporanSiswa() { const sel = byId("laporan-siswa"), cur = sel.value; const h = byId("laporan-halaqah").value, k = byId("laporan-kelas").value; const students = studentList().filter(s => (!h || getHalaqahName(s) === h) && (!k || s.kelas === k)).sort((a, b) => a.nama.localeCompare(b.nama, "id")); clearSelect(sel, "-- Pilih Siswa --"); students.forEach(s => option(sel, s.nama, s.nama)); if ([...sel.options].some(o => o.value === cur)) sel.value = cur; }
function filteredStudents() { 
  const h = byId("f-halaqah").value; 
  const k = byId("f-kelas").value; 
  const q = byId("f-search").value.toLowerCase().trim(); 
  let list = studentList().filter(s => (!h || getHalaqahName(s) === h) && (!k || s.kelas === k) && (!q || s.nama.toLowerCase().includes(q)));
  if (window.currentUser && window.currentUser.role === 'Guru') {
      list = list.filter(s => s.halaqah === window.currentUser.halaqah);
  }
  return list.sort((a, b) => a.nama.localeCompare(b.nama, "id")); 
}

// ROSTER & STATS
function attendanceFor(student) { const h = getHalaqahName(student); const targetDate = getActiveDate(); const m = activityRecords().filter(r => dateKey(r.tanggal) === targetDate && r.nama_santri === student.nama && r.halaqah === h); if (m.some(r => r.tipe === "setoran_kehadiran")) return "Hadir"; return m.find(r => r.tipe === "kehadiran")?.kehadiran || "Alfa"; }
function renderRoster() {
  const students = filteredStudents();
  const list = byId("roster-list");
  if (!list) return;
  const targetDate = getActiveDate();
  list.innerHTML = "";
  byId("roster-wrap").classList.toggle("hidden", students.length === 0);
  byId("roster-empty").classList.toggle("hidden", students.length > 0);
  byId("roster-empty").textContent = students.length === 0 ? "Tidak ada santri pada filter ini." : "";
  
  students.forEach((student, i) => {
    const node = byId("roster-row-template").content.cloneNode(true);
    node.querySelector(".row-no").textContent = i + 1;
    node.querySelector(".row-name").textContent = student.nama;
    const hasSetoran = activityRecords().some(r => r.nama_santri === student.nama && r.tipe === "setoran_kehadiran" && dateKey(r.tanggal) === targetDate);
    if (hasSetoran) node.querySelector(".row-setoran-badge").classList.remove("hidden");
    const hasUjian = (window.records || []).some(r => r.nama_santri === student.nama && r.tipe === "ujian_semester" && dateKey(r.tanggal) === targetDate);
    if (hasUjian) node.querySelector(".row-ujian-badge").classList.remove("hidden");
    node.querySelector(".row-class").textContent = `Kelas ${student.kelas}`;
    const att = node.querySelector(".row-attendance"); att.value = attendanceFor(student);
    node.querySelector(".save-attendance").addEventListener("click", () => saveAttendance(student, att));
    node.querySelector(".open-setoran").addEventListener("click", () => window.openSetoran(student));
    node.querySelector(".open-ujian").addEventListener("click", () => openUjian(student));
    node.querySelector(".edit-student").addEventListener("click", () => openProfileModal("student", student));
    node.querySelector(".delete-student").addEventListener("click", e => deleteStudent(student, e.currentTarget));
    list.appendChild(node);
  });
}
async function saveAttendance(student, input) { const isoDate = getIsoForDate(getActiveDate()); const payload = { nama_santri: student.nama, kelas: student.kelas, halaqah: getHalaqahName(student), tanggal: isoDate, tipe: "kehadiran", kehadiran: input.value, user: window.currentUser.username }; input.disabled = true; await window.dataSdk.bulkAttendance([payload]); input.disabled = false; }

window.openSetoran = function(student) {
  selectedStudent = student; byId("selected-student").textContent = student.nama; byId("selected-meta").textContent = `${getHalaqahName(student)} · Kelas ${student.kelas}`; byId("f-tanggal-setoran").value = getActiveDate(); byId("ujian-panel").classList.add("hidden"); byId("setoran-panel").classList.remove("hidden"); const sel = byId("f-tipe-setoran"); if (sel) { sel.value = "Al-Quran"; sel.dispatchEvent(new Event("change")); } byId("setoran-panel").scrollIntoView({behavior: "smooth", block: "start"}); if (typeof window.renderPanelRiwayat === 'function') window.renderPanelRiwayat(student.nama);
};
function openUjian(student) { selectedStudent = student; byId("ujian-selected-student").textContent = student.nama; byId("ujian-selected-meta").textContent = `${getHalaqahName(student)} · Kelas ${student.kelas}`; byId("u-tanggal").value = getActiveDate(); byId("setoran-panel").classList.add("hidden"); byId("ujian-panel").classList.remove("hidden"); byId("ujian-panel").scrollIntoView({behavior: "smooth", block: "start"}); }

// JUZ & SURAH
const JUZ_MAPPING = {1:[["Al-Fatihah",1,7],["Al-Baqarah",1,141]],2:[["Al-Baqarah",142,252]],3:[["Al-Baqarah",253,286],["Ali Imran",1,92]],4:[["Ali Imran",93,200],["An-Nisa",1,23]],5:[["An-Nisa",24,147]],6:[["An-Nisa",148,176],["Al-Ma'idah",1,81]],7:[["Al-Ma'idah",82,120],["Al-An'am",1,110]],8:[["Al-An'am",111,165],["Al-A'raf",1,87]],9:[["Al-A'raf",88,206],["Al-Anfal",1,40]],10:[["Al-Anfal",41,75],["At-Taubah",1,92]],11:[["At-Taubah",93,129],["Yunus",1,109],["Hud",1,5]],12:[["Hud",6,123],["Yusuf",1,52]],13:[["Yusuf",53,111],["Ar-Ra'd",1,43],["Ibrahim",1,52]],14:[["Al-Hijr",1,99],["An-Nahl",1,128]],15:[["Al-Isra",1,111],["Al-Kahf",1,74]],16:[["Al-Kahf",75,110],["Maryam",1,98],["Taha",1,135]],17:[["Al-Anbiya",1,112],["Al-Hajj",1,78]],18:[["Al-Mu'minun",1,118],["An-Nur",1,64],["Al-Furqan",1,20]],19:[["Al-Furqan",21,77],["Asy-Syu'ara",1,227],["An-Naml",1,55]],20:[["An-Naml",56,93],["Al-Qasas",1,88],["Al-Ankabut",1,45]],21:[["Al-Ankabut",46,69],["Ar-Rum",1,60],["Luqman",1,34],["As-Sajdah",1,30],["Al-Ahzab",1,30]],22:[["Al-Ahzab",31,73],["Saba'",1,54],["Fatir",1,45],["Yasin",1,27]],23:[["Yasin",28,83],["As-Saffat",1,182],["Sad",1,88],["Az-Zumar",1,31]],24:[["Az-Zumar",32,75],["Ghafir",1,85],["Fussilat",1,46]],25:[["Fussilat",47,54],["Asy-Syura",1,53],["Az-Zukhruf",1,89],["Ad-Dukhan",1,59],["Al-Jasiyah",1,37]],26:[["Al-Ahqaf",1,35],["Muhammad",1,38],["Al-Fath",1,29],["Al-Hujurat",1,18],["Qaf",1,45],["Adz-Dzariyat",1,30]],27:[["Adz-Dzariyat",31,60],["At-Tur",1,49],["An-Najm",1,62],["Al-Qamar",1,55],["Ar-Rahman",1,78],["Al-Waqi'ah",1,96],["Al-Hadid",1,29]],28:[["Al-Mujadilah",1,22],["Al-Hasyr",1,24],["Al-Mumtahanah",1,13],["As-Saff",1,14],["Al-Jumu'ah",1,11],["Al-Munafiqun",1,11],["At-Taghabun",1,18],["At-Talaq",1,12],["At-Tahrim",1,12]],29:[["Al-Mulk",1,30],["Al-Qalam",1,52],["Al-Haqqah",1,52],["Al-Ma'arij",1,44],["Nuh",1,28],["Al-Jinn",1,28],["Al-Muzzammil",1,20],["Al-Mudassir",1,56],["Al-Qiyamah",1,40],["Al-Insan",1,31],["Al-Mursalat",1,50]],30:[["An-Naba",1,40],["An-Nazi'at",1,46],["'Abasa",1,42],["At-Takwir",1,29],["Al-Infitar",1,19],["Al-Mutaffifin",1,36],["Al-Insyigaq",1,25],["Al-Buruj",1,22],["At-Tariq",1,17],["Al-A'la",1,19],["Al-Ghasyiyah",1,26],["Al-Fajr",1,30],["Al-Balad",1,20],["Asy-Syams",1,15],["Al-Lail",1,21],["Ad-Duha",1,11],["Asy-Syarh",1,8],["At-Tin",1,8],["Al-'Alaq",1,19],["Al-Qadr",1,5],["Al-Bayyinah",1,8],["Al-Zalzalah",1,8],["Al-'Adiyat",1,11],["Al-Qari'ah",1,11],["At-Takasur",1,8],["Al-'Asr",1,3],["Al-Humazah",1,9],["Al-Fil",1,5],["Quraisy",1,4],["Al-Ma'un",1,7],["Al-Kausar",1,3],["Al-Kafirun",1,6],["An-Nasr",1,3],["Al-Lahab",1,5],["Al-Ikhlas",1,4],["Al-Falaq",1,5],["An-Nas",1,6]]};
const IQRA_PAGES = {"Iqra Jilid 1":32,"Iqra Jilid 2":32,"Iqra Jilid 3":34,"Iqra Jilid 4":32,"Iqra Jilid 5":32,"Iqra Jilid 6":32};

function populateJuz() { clearSelect(byId("f-juz"), "-- Pilih Juz --"); for (let j = 30; j >= 1; j--) option(byId("f-juz"), String(j), `Juz ${j}`); }
function populateSurah() { const j = Number(byId("f-juz").value); const sel = byId("f-surah"); clearSelect(sel, "-- Pilih Surah --"); (JUZ_MAPPING[j] || []).forEach(item => option(sel, item[0], `${item[0]} (Ayat ${item[1]}-${item[2]})`)); sel.disabled = !j; clearSelect(byId("f-ayat"), "-- Pilih Ayat --"); byId("f-ayat").disabled = true; }
function populateAyat() { const j = Number(byId("f-juz").value); const s = byId("f-surah").value; const sel = byId("f-ayat"); clearSelect(sel, "-- Pilih Ayat --"); const f = (JUZ_MAPPING[j] || []).find(i => i[0] === s); if (!f) { sel.disabled = true; return; } for (let a = f[1]; a <= f[2]; a++) option(sel, String(a), `Ayat ${a}`); sel.disabled = false; }
function populateBaris() { clearSelect(byId("f-baris"), "-- Pilih --"); for (let i = 1; i <= 15; i++) option(byId("f-baris"), String(i), `${i} baris`); option(byId("f-baris"), "custom", "Custom"); }
function populateIqraHalaman() { const j = byId("f-iqra").value; const sel = byId("f-halaman-iqra"); clearSelect(sel, "-- Pilih Halaman --"); if (!j) { sel.disabled = true; return; } const max = IQRA_PAGES[j] || 32; for (let p = 1; p <= max; p++) option(sel, String(p), `Halaman ${p}`); sel.disabled = false; }
function setupTipeSetoranToggle() { const sel = byId("f-tipe-setoran"); if (!sel) return; sel.addEventListener("change", () => { const isIqra = sel.value === "Iqra"; byId("kat-quran-wrapper").classList.toggle("hidden", isIqra); byId("juz-wrapper").classList.toggle("hidden", isIqra); byId("quran-location-fields").classList.toggle("hidden", isIqra); byId("f-juz").required = !isIqra; byId("f-surah").required = !isIqra; byId("f-ayat").required = !isIqra; byId("iqra-wrapper").classList.toggle("hidden", !isIqra); byId("iqra-location-fields").classList.toggle("hidden", !isIqra); byId("f-iqra").required = isIqra; byId("f-halaman-iqra").required = isIqra; if (isIqra) populateIqraHalaman(); }); if (byId("f-iqra")) byId("f-iqra").addEventListener("change", populateIqraHalaman); }

const isDuplicate = row => activityRecords().some(r => r.tipe === row.tipe && r.nama_santri === row.nama_santri && r.halaqah === row.halaqah && r.kelas === row.kelas && dateKey(r.tanggal) === dateKey(row.tanggal) && r.juz === row.juz && r.surah === row.surah && r.ayat === row.ayat && r.kehadiran === row.kehadiran && r.jumlah_baris === row.jumlah_baris);

async function renderCharts(hadir, sakit, izin, alfa, lancar, perbaikan, diulang, dataUjian) {
  await ensureChartLoaded(); if (typeof Chart === 'undefined') return;
  const ctxAtt = byId('attendanceChart'); 
  if (ctxAtt) {
    if (attendanceChart) attendanceChart.destroy();
    attendanceChart = new Chart(ctxAtt, { type: 'doughnut', data: { labels: ['Hadir','Sakit','Izin','Alfa'], datasets: [{ data: [hadir, sakit, izin, alfa], backgroundColor: ['#20744e','#d97706','#eab308','#a24c38'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {boxWidth: 12, font: {size: 10}} } }, cutout: '70%' } });
  }
  const ctxSet = byId('setoranChart'); 
  if (ctxSet) {
    if (setoranChart) setoranChart.destroy();
    setoranChart = new Chart(ctxSet, { type: 'bar', data: { labels: ['Lancar','Perbaikan','Diulang'], datasets: [{ label: 'Jumlah', data: [lancar, perbaikan, diulang], backgroundColor: ['#1f6f54','#f59e0b','#ef4444'], borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{stepSize:1}} } } });
  }
  const ctxUjian = byId('ujianChart'); 
  if (ctxUjian) {
    if (ujianChart) ujianChart.destroy();
    let uM = 0, uJJ = 0, uJ = 0, uMq = 0, uR = 0; dataUjian.forEach(r => { if (r.status === "Mumtaaz") uM++; else if (r.status === "Jayyid Jiddan") uJJ++; else if (r.status === "Jayyid") uJ++; else if (r.status === "Maqbuul") uMq++; else if (r.status === "Roosib") uR++; });
    ujianChart = new Chart(ctxUjian, { type: 'doughnut', data: { labels: ['Mumtaaz','Jayyid J.','Jayyid','Maqbuul','Roosib'], datasets: [{ data: [uM, uJJ, uJ, uMq, uR], backgroundColor: ['#047857','#059669','#34d399','#fbbf24','#ef4444'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {boxWidth: 12, font: {size: 10}} } }, cutout: '60%' } });
  }
}
function renderStats() {
  const students = filteredStudents(); const targetDate = getActiveDate();
  let hadir = 0, sakit = 0, izin = 0, alfa = 0, lancar = 0, perbaikan = 0, diulang = 0, totalBaris = 0;
  const keys = new Set(students.map(s => `${s.nama}|${getHalaqahName(s)}`));
  const currentActivity = activityRecords().filter(r => dateKey(r.tanggal) === targetDate && keys.has(`${r.nama_santri}|${r.halaqah}`));
  students.forEach(s => {
    const sActs = currentActivity.filter(r => r.nama_santri === s.nama); const setoranList = sActs.filter(r => r.tipe === "setoran_kehadiran"); const kehadiranList = sActs.filter(r => r.tipe === "kehadiran"); let finalStatus = "Alfa";
    if (setoranList.length > 0) { finalStatus = "Hadir"; setoranList.forEach(r => { if (r.status === "Lancar") lancar++; else if (r.status === "Perlu Perbaikan") perbaikan++; else if (r.status === "Diulang") diulang++; if (parseCat(r.evaluasi) === "Sabaq") totalBaris += (Number(r.jumlah_baris) || 0); }); } else if (kehadiranList.length > 0) { finalStatus = kehadiranList[kehadiranList.length - 1].kehadiran; }
    if (finalStatus === "Hadir") hadir++; else if (finalStatus === "Sakit") sakit++; else if (finalStatus === "Izin") izin++; else alfa++;
  });
  const h = byId("f-halaqah").value, k = byId("f-kelas").value; const allUjian = (window.records || []).filter(r => r.tipe === "ujian_semester" && (!h || r.halaqah === h) && (!k || r.kelas === k));
  byId("stat-santri").textContent = students.length; byId("stat-hadir").textContent = hadir; byId("stat-baris").textContent = totalBaris; renderCharts(hadir, sakit, izin, alfa, lancar, perbaikan, diulang, allUjian);
}
function renderProgressionChart() {
  if (typeof Chart === 'undefined') return; const h = byId("prog-halaqah").value, k = byId("prog-kelas").value, n = byId("prog-nama").value; const start = byId("prog-start").value, end = byId("prog-end").value; const acts = activityRecords().filter(r => r.tipe === "setoran_kehadiran");
  const filteredActs = acts.filter(r => { const d = dateKey(r.tanggal); return (!h || r.halaqah === h) && (!k || r.kelas === k) && (!n || r.nama_santri === n) && (!start || d >= start) && (!end || d <= end); }).sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  if (filteredActs.length === 0) { byId("progressionChart").classList.add("hidden"); byId("prog-empty").classList.remove("hidden"); return; }
  byId("progressionChart").classList.remove("hidden"); byId("prog-empty").classList.add("hidden"); const dateMap = new Map();
  filteredActs.forEach(r => { const d = dateKey(r.tanggal); const cat = parseCat(r.evaluasi); const baris = Number(r.jumlah_baris) || 0; if (!dateMap.has(d)) dateMap.set(d, { sabaq: 0, sabqi: 0, manzil: 0 }); const obj = dateMap.get(d); if (cat === "Sabaq") obj.sabaq += baris; else if(cat === "Sabqi") obj.sabqi += baris; else obj.manzil += baris; });
  const labels = Array.from(dateMap.keys()).map(d => new Date(d).toLocaleDateString("id-ID", {day: '2-digit', month: 'short'})); 
  const sabaqData = Array.from(dateMap.values()).map(v => v.sabaq); 
  const sabqiData = Array.from(dateMap.values()).map(v => v.sabqi);
  const manzilData = Array.from(dateMap.values()).map(v => v.manzil);
  const ctx = byId('progressionChart'); if (progressionChart) progressionChart.destroy();
  progressionChart = new Chart(ctx, { 
    type: 'line', 
    data: { 
      labels, 
      datasets: [ 
        { label: 'Sabaq (Baru)', data: sabaqData, borderColor: '#1f6f54', backgroundColor: 'rgba(31,111,84,0.1)', fill: true, tension: 0.3 },
        { label: 'Sabqi (Mengulang)', data: sabqiData, borderColor: '#eab308', backgroundColor: 'rgba(234,179,8,0.1)', fill: true, tension: 0.3 },
        { label: 'Manzil (Lama)', data: manzilData, borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.1)', fill: true, tension: 0.3 }
      ] 
    }, 
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } } 
  });
}

function renderLeaderboard() {
  const jenjangFilter = byId("leaderboard-jenjang").value; const h = byId("leaderboard-halaqah").value, k = byId("leaderboard-kelas").value; const start = byId("leaderboard-start").value, end = byId("leaderboard-end").value; const list = byId("leaderboard-list"); list.innerHTML = ""; currentLeaderboardData = []; const activeStudentNames = new Set(studentList().map(s => s.nama));
  if (activeLeaderboardTab === "kandidat") {
    byId("add-kandidat-btn").classList.remove("hidden"); byId("filter-start-wrap").classList.add("hidden"); byId("filter-end-wrap").classList.add("hidden"); byId("filter-jenjang-wrap").classList.add("hidden");
    const kDatas = (window.records || []).filter(r => r.tipe === "kandidat_tes" && (!h || r.halaqah === h) && (!k || r.kelas === k)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); byId("leaderboard-empty").classList.toggle("hidden", kDatas.length > 0);
    kDatas.forEach(item => { const node = byId("kandidat-item-template").content.cloneNode(true); node.querySelector(".kandidat-name").textContent = item.nama_santri; node.querySelector(".kandidat-meta").textContent = `${item.halaqah} · Kelas ${item.kelas}`; node.querySelector(".kandidat-note").textContent = item.evaluasi || ""; node.querySelector(".delete-kandidat").addEventListener("click", e => deleteActivity(item, e.currentTarget)); list.appendChild(node); });
  } else {
    byId("add-kandidat-btn").classList.add("hidden"); byId("filter-start-wrap").classList.remove("hidden"); byId("filter-end-wrap").classList.remove("hidden"); byId("filter-jenjang-wrap").classList.remove("hidden");
    if (activeLeaderboardTab === "quran") { const map = new Map(); activityRecords().filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "setoran_kehadiran" && parseCat(r.evaluasi) === "Sabaq" && r.surah && !r.juz?.startsWith("Iqra") && (!h || r.halaqah === h) && (!k || r.kelas === k) && (!jenjangFilter || getJenjang(r.kelas) === jenjangFilter) && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end)).forEach(r => { const key = `${r.nama_santri}|${r.halaqah}|${r.kelas}`; const c = map.get(key) || {nama: r.nama_santri, halaqah: r.halaqah, kelas: r.kelas, baris: 0, setoran: 0}; c.baris += Number(r.jumlah_baris) || 0; c.setoran += 1; map.set(key, c); }); const ranking = [...map.values()].sort((a, b) => b.baris - a.baris || b.setoran - a.setoran).slice(0, 12); byId("leaderboard-empty").classList.toggle("hidden", ranking.length > 0); ranking.forEach((item, i) => { const node = byId("leaderboard-item-template").content.cloneNode(true); const rank = node.querySelector(".rank-number"); rank.textContent = i + 1; rank.style.cssText = i === 0 ? "background:#f7df91;color:#785211" : i === 1 ? "background:#e7e7e7;color:#555" : i === 2 ? "background:#f0d4b9;color:#83451b" : "background:#e7f0ea;color:#1f6f54"; node.querySelector(".leader-name").textContent = item.nama; node.querySelector(".leader-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`; node.querySelector(".leader-lines").textContent = item.baris; node.querySelector(".leader-sub").textContent = "baris"; list.appendChild(node); currentLeaderboardData.push({...item, rank: i + 1, type: 'quran'}); });
    } else if (activeLeaderboardTab === "iqra") { const map = new Map(); activityRecords().filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "setoran_kehadiran" && r.juz && r.juz.startsWith("Iqra") && (!h || r.halaqah === h) && (!k || r.kelas === k) && (!jenjangFilter || getJenjang(r.kelas) === jenjangFilter) && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end)).forEach(r => { const key = `${r.nama_santri}|${r.halaqah}|${r.kelas}`; const jn = parseInt(r.juz.replace("Iqra Jilid ", "")) || 1; const hn = parseInt(r.surah) || 1; const c = map.get(key) || {nama: r.nama_santri, halaqah: r.halaqah, kelas: r.kelas, maxJilid: 0, maxHalaman: 0}; if (jn > c.maxJilid) { c.maxJilid = jn; c.maxHalaman = hn; } else if (jn === c.maxJilid && hn > c.maxHalaman) { c.maxHalaman = hn; } map.set(key, c); }); const ranking = [...map.values()].sort((a, b) => b.maxJilid - a.maxJilid || b.maxHalaman - a.maxHalaman).slice(0, 12); byId("leaderboard-empty").classList.toggle("hidden", ranking.length > 0); ranking.forEach((item, i) => { const node = byId("leaderboard-item-template").content.cloneNode(true); const rank = node.querySelector(".rank-number"); rank.textContent = i + 1; rank.style.cssText = i === 0 ? "background:#f7df91;color:#785211" : i === 1 ? "background:#e7e7e7;color:#555" : i === 2 ? "background:#f0d4b9;color:#83451b" : "background:#e7f0ea;color:#1f6f54"; node.querySelector(".leader-name").textContent = item.nama; node.querySelector(".leader-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`; node.querySelector(".leader-lines").textContent = `Jld ${item.maxJilid}`; node.querySelector(".leader-sub").textContent = `Hal ${item.maxHalaman}`; list.appendChild(node); currentLeaderboardData.push({...item, rank: i + 1, type: 'iqra'}); });
    } else if (activeLeaderboardTab === "ujian") { const map = new Map(); (window.records || []).filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "ujian_semester" && (!h || r.halaqah === h) && (!k || r.kelas === k) && (!jenjangFilter || getJenjang(r.kelas) === jenjangFilter) && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end)).forEach(r => { const key = `${r.nama_santri}|${r.halaqah}|${r.kelas}`; const score = parseInt(r.ayat) || 0; const c = map.get(key) || {nama: r.nama_santri, halaqah: r.halaqah, kelas: r.kelas, maxScore: 0, predicate: "", tipeUjian: ""}; if (score > c.maxScore) { c.maxScore = score; c.predicate = r.status; c.tipeUjian = r.surah; } map.set(key, c); }); const ranking = [...map.values()].sort((a, b) => b.maxScore - a.maxScore).slice(0, 12); byId("leaderboard-empty").classList.toggle("hidden", ranking.length > 0); ranking.forEach((item, i) => { const node = byId("leaderboard-item-template").content.cloneNode(true); const rank = node.querySelector(".rank-number"); rank.textContent = i + 1; rank.style.cssText = i === 0 ? "background:#f7df91;color:#785211" : i === 1 ? "background:#e7e7e7;color:#555" : i === 2 ? "background:#f0d4b9;color:#83451b" : "background:#e7f0ea;color:#1f6f54"; node.querySelector(".leader-name").textContent = item.nama; node.querySelector(".leader-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`; node.querySelector(".leader-lines").textContent = item.maxScore; node.querySelector(".leader-sub").textContent = `${item.predicate} · ${item.tipeUjian}`; list.appendChild(node); currentLeaderboardData.push({...item, rank: i + 1, type: 'ujian'}); });
    } else if (activeLeaderboardTab === "wanted") {
      const targetDateStr = getActiveDate(); const targetDateObj = new Date(targetDateStr + "T12:00:00"); let earliestRecordDate = new Date(); if ((window.records || []).length > 0) { const times = (window.records || []).map(r => new Date(dateKey(r.tanggal) + "T12:00:00").getTime()).filter(t => !isNaN(t)); if (times.length > 0) earliestRecordDate = new Date(Math.min(...times)); } const map = new Map();
      activityRecords().filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "setoran_kehadiran").forEach(r => { const rDateStr = dateKey(r.tanggal); if (rDateStr <= targetDateStr) { const curr = map.get(r.nama_santri); if (!curr || rDateStr > curr.lastDateStr) map.set(r.nama_santri, {lastDateStr: rDateStr, halaqah: r.halaqah, kelas: r.kelas}); } });
      const students = studentList().filter(s => { const hName = getHalaqahName(s); if (EXCLUDED_TAHSIN_HALAQAH.includes(hName)) return false; return (!h || hName === h) && (!k || s.kelas === k) && (!jenjangFilter || getJenjang(s.kelas) === jenjangFilter); }); let wantedList = [];
      students.forEach(s => { const record = map.get(s.nama); let diffDays = 0; if (record) { const lastD = new Date(record.lastDateStr + "T12:00:00"); diffDays = Math.floor((targetDateObj - lastD) / (1000 * 60 * 60 * 24)); } else { diffDays = Math.floor((targetDateObj - earliestRecordDate) / (1000 * 60 * 60 * 24)); if (diffDays < 0) diffDays = 0; } if (diffDays >= 5) wantedList.push({nama: s.nama, halaqah: getHalaqahName(s), kelas: s.kelas, daysMissed: diffDays}); });
      wantedList.sort((a, b) => b.daysMissed - a.daysMissed); byId("leaderboard-empty").classList.toggle("hidden", wantedList.length > 0);
      wantedList.slice(0, 16).forEach(item => { const node = byId("leaderboard-wanted-template").content.cloneNode(true); node.querySelector(".wanted-name").textContent = item.nama; node.querySelector(".wanted-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`; const s = students.find(x => x.nama === item.nama); if (s && s.foto && s.foto.length > 100) { const img = node.querySelector(".wanted-photo"); img.src = s.foto; img.classList.remove("hidden"); node.querySelector(".wanted-placeholder").classList.add("hidden"); } node.querySelector(".wanted-days").textContent = `${item.daysMissed} HARI`; list.appendChild(node); currentLeaderboardData.push({...item, rank: "-", type: 'wanted'}); });
    }
  }
  if (window.lucide) lucide.createIcons();
}

function renderHistory() {
  const h = byId("riwayat-filter-halaqah").value, k = byId("riwayat-filter-kelas").value, n = byId("riwayat-filter-nama").value; const allLogs = (window.records || []).filter(r => r.tipe === "setoran_kehadiran" || r.tipe === "kehadiran" || r.tipe === "ujian_semester"); const filtered = allLogs.filter(r => (!h || r.halaqah === h) && (!k || r.kelas === k) && (!n || r.nama_santri === n)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); const list = byId("riwayat-list"); list.innerHTML = ""; byId("riwayat-empty").classList.toggle("hidden", filtered.length > 0);
  filtered.slice(0, 40).forEach(record => { const node = byId("history-row-template").content.cloneNode(true); node.querySelector(".history-name").textContent = record.nama_santri; const badge = node.querySelector(".history-badge"); const evNode = node.querySelector(".history-evaluation"); if (record.tipe === "setoran_kehadiran") { const cat = parseCat(record.evaluasi); const note = cleanEv(record.evaluasi); node.querySelector(".history-detail").textContent = `${record.halaqah} · Kls ${record.kelas} · Juz ${record.juz} · ${record.surah} : ${record.ayat} · ${record.jumlah_baris} baris`; if (note) { evNode.textContent = `Catatan: ${note}`; evNode.classList.remove("hidden"); } badge.textContent = cat; badge.style.cssText = cat === "Sabaq" ? "background:#dcefe3;color:#17633e" : cat === "Sabqi" ? "background:#fef3c7;color:#b45309" : "background:#e0e7ff;color:#3730a3"; } else if (record.tipe === "ujian_semester") { node.querySelector(".history-detail").textContent = `${record.halaqah} · Kls ${record.kelas} · ${record.surah}`; evNode.textContent = `${record.evaluasi} · Avg: ${record.ayat}`; evNode.classList.remove("hidden"); badge.textContent = record.status; badge.style.cssText = record.status.includes("Jayyid") || record.status === "Mumtaaz" ? "background:#fef3c7;color:#b45309" : "background:#fee2e2;color:#991b1b"; } else { node.querySelector(".history-detail").textContent = `${record.halaqah} · Kls ${record.kelas} · Presensi Harian`; badge.textContent = record.kehadiran; badge.style.cssText = record.kehadiran === "Hadir" ? "background:#dcefe3;color:#17633e" : record.kehadiran === "Izin" ? "background:#fff0cb;color:#8a6310" : "background:#f9ddda;color:#9c352a"; } node.querySelector(".history-date").textContent = new Date(record.tanggal).toLocaleDateString("id-ID", {day: "numeric", month: "short", year: "numeric"}); node.querySelector(".delete-record").addEventListener("click", e => deleteActivity(record, e.currentTarget)); list.appendChild(node); });
}
function renderMutasi() { const list = byId("mutasi-list"); list.innerHTML = ""; const activeStudentNames = new Set(studentList().map(s => s.nama)); const mutasiData = (window.records || []).filter(r => r.tipe === "mutasi_tahfidz" && activeStudentNames.has(r.nama_santri)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); byId("mutasi-empty").classList.toggle("hidden", mutasiData.length > 0); mutasiData.forEach(m => { const node = byId("mutasi-item-template").content.cloneNode(true); node.querySelector(".mutasi-name").textContent = m.nama_santri; node.querySelector(".mutasi-class").textContent = `Kelas ${m.kelas}`; node.querySelector(".mutasi-date").textContent = new Date(m.tanggal).toLocaleDateString("id-ID", {day: "numeric", month: "short", year: "numeric"}); node.querySelector(".mutasi-asal").textContent = `${m.halaqah} (${m.evaluasi})`; node.querySelector(".mutasi-tujuan").textContent = `${m.juz} (${m.surah})`; node.querySelector(".delete-mutasi").addEventListener("click", e => deleteActivity(m, e.currentTarget)); list.appendChild(node); }); }
function renderTeachers() { const list = byId("teacher-list"); list.innerHTML = ""; halaqahList().forEach(h => { const node = byId("teacher-item-template").content.cloneNode(true); node.querySelector(".teacher-halaqah").textContent = h.nama; node.querySelector(".teacher-name").textContent = h.guru; node.querySelector(".edit-teacher").addEventListener("click", () => openProfileModal("teacher", h)); node.querySelector(".delete-teacher").addEventListener("click", e => deleteTeacher(h, e.currentTarget)); list.appendChild(node); }); }
function renderRekapBulanan() {
  const list = byId("rekap-grid-list"); list.innerHTML = ""; const bln = byId("rekap-bulan-input").value; const h = byId("rekap-halaqah").value, k = byId("rekap-kelas").value; if (!bln) { byId("rekap-grid-empty").textContent = "Pilih bulan."; byId("rekap-grid-empty").classList.remove("hidden"); return; } const students = studentList().filter(s => (!h || getHalaqahName(s) === h) && (!k || s.kelas === k)).sort((a, b) => a.nama.localeCompare(b.nama, "id")); if (students.length === 0) { byId("rekap-grid-empty").textContent = "Tidak ada santri."; byId("rekap-grid-empty").classList.remove("hidden"); return; } const acts = activityRecords().filter(r => r.tanggal && r.tanggal.startsWith(bln)); byId("rekap-grid-empty").classList.add("hidden");
  students.forEach((s, i) => { const sActs = acts.filter(r => r.nama_santri === s.nama); const daysMap = new Map(); sActs.forEach(r => { const d = dateKey(r.tanggal); if (!daysMap.has(d)) daysMap.set(d, {status: "Alfa", sabaq: 0, sabqi: 0, manzil: 0}); const entry = daysMap.get(d); if (r.tipe === "setoran_kehadiran") { entry.status = "Hadir"; const cat = parseCat(r.evaluasi); if (cat === "Sabaq") entry.sabaq += (Number(r.jumlah_baris) || 0); else if(cat === "Sabqi") entry.sabqi += (Number(r.jumlah_baris) || 0); else entry.manzil += (Number(r.jumlah_baris) || 0); } else if (r.tipe === "kehadiran" && entry.status !== "Hadir") entry.status = r.kehadiran; }); let hadir = 0, sakit = 0, izin = 0, alfa = 0, bSabaq = 0, bSabqi = 0, bManzil = 0; daysMap.forEach(e => { if (e.status === "Hadir") hadir++; else if (e.status === "Sakit") sakit++; else if (e.status === "Izin") izin++; else if (e.status === "Alfa") alfa++; bSabaq += e.sabaq; bSabqi += e.sabqi; bManzil += e.manzil; }); const tr = document.createElement("tr"); tr.className = "border-b border-[#e4dccb] hover:bg-[#fcfaf5]"; tr.innerHTML = ` <td class="text-center px-3 py-2 border-r border-[#e4dccb] text-stone-500">${i+1}</td> <td class="px-4 py-2 border-r border-[#e4dccb] font-semibold">${esc(s.nama)}</td> <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-emerald-700">${hadir || "-"}</td> <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-amber-600">${izin || "-"}</td> <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-rose-600">${sakit || "-"}</td> <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-pink-700">${alfa || "-"}</td> <td class="text-center px-4 py-2 border-r border-[#e4dccb] font-bold text-[#1f6f54]">${bSabaq}</td> <td class="text-center px-4 py-2 border-r border-[#e4dccb] font-bold text-amber-600">${bSabqi}</td> <td class="text-center px-4 py-2 font-bold text-indigo-700">${bManzil}</td>`; list.appendChild(tr); });
}
function renderRekapUjianGlobal() { const h = byId("rekap-ujian-halaqah").value, k = byId("rekap-ujian-kelas").value; const allUjian = (window.records || []).filter(r => r.tipe === "ujian_semester"); const filtered = allUjian.filter(r => (!h || r.halaqah === h) && (!k || r.kelas === k)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); const list = byId("rekap-ujian-list"); list.innerHTML = ""; byId("rekap-ujian-empty").classList.toggle("hidden", filtered.length > 0); filtered.forEach((u, i) => { const tr = document.createElement("tr"); tr.className = "border-b border-amber-200/50 hover:bg-amber-50/20"; let predClass = "text-indigo-700 bg-indigo-50"; if (u.status === "Roosib" || u.status === "Maqbuul") predClass = "text-rose-700 bg-rose-50"; else if (u.status.includes("Jayyid")) predClass = "text-emerald-700 bg-emerald-50"; const parts = (u.evaluasi || "").split("| Fashahah:"); const fash = parts.length > 1 ? parts[1].trim() : "-"; tr.innerHTML = ` <td class="text-center px-3 py-2 border-r border-amber-200/50 text-stone-500">${i+1}</td> <td class="px-4 py-2 border-r border-amber-200/50 font-semibold">${esc(u.nama_santri)}</td> <td class="text-center px-3 py-2 border-r border-amber-200/50 text-xs">${esc(u.kelas)}</td> <td class="text-center px-4 py-2 border-r border-amber-200/50 font-bold text-[#1f6f54] text-xs">${esc(u.surah)}</td> <td class="text-center px-3 py-2 border-r border-amber-200/50 text-xs text-stone-500">${new Date(u.tanggal).toLocaleDateString("id-ID", {day: "2-digit", month: "short"})}</td> <td class="text-center px-2 py-2 border-r border-amber-200/50 font-bold">${esc(u.juz)}</td> <td class="text-center px-2 py-2 border-r border-amber-200/50 font-bold">${esc(u.jumlah_baris)}</td> <td class="text-center px-2 py-2 border-r border-amber-200/50 font-bold">${esc(fash)}</td> <td class="text-center px-2 py-2 border-r border-amber-200/50 font-black text-lg">${esc(u.ayat)}</td> <td class="text-center px-4 py-2"><span class="px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${predClass}">${esc(u.status)}</span></td>`; list.appendChild(tr); }); }

function populateAdminFilters() {
    const selH = byId("admin-filter-halaqah"); const selK = byId("admin-filter-kelas");
    if (!selH || !selK) return;
    const curH = selH.value; const curK = selK.value;
    clearSelect(selH, "Semua Halaqah"); halaqahList().forEach(h => option(selH, h.nama, h.nama)); if ([...selH.options].some(o => o.value === curH)) selH.value = curH;
    clearSelect(selK, "Semua Kelas"); let classes = []; if (window.masterKelas && window.masterKelas.length > 0) classes = window.masterKelas.map(k => k.nama); else classes = [...new Set(studentList().map(s => s.kelas).filter(Boolean))];
    classes.sort((a,b) => a.localeCompare(b, "id", {numeric: true})).forEach(c => option(selK, c, c)); if ([...selK.options].some(o => o.value === curK)) selK.value = curK;
}
function renderAdminStudents() {
    const list = byId("admin-student-list"); if (!list) return;
    const q = byId("admin-search-student") ? byId("admin-search-student").value.toLowerCase().trim() : "";
    const h = byId("admin-filter-halaqah") ? byId("admin-filter-halaqah").value : "";
    const k = byId("admin-filter-kelas") ? byId("admin-filter-kelas").value : "";
    const filtered = studentList().filter(s => (!q || s.nama.toLowerCase().includes(q)) && (!h || s.halaqah === h) && (!k || s.kelas === k));
    list.innerHTML = filtered.map((s, i) => `
        <tr class="border-b border-[#e4dccb] hover:bg-[#fcfaf5]">
            <td class="px-3 py-2 text-center border-r border-[#e4dccb]">${i+1}</td>
            <td class="px-4 py-2 border-r border-[#e4dccb] font-semibold">${esc(s.nama)}</td>
            <td class="px-3 py-2 text-center border-r border-[#e4dccb]">${esc(s.kelas)}</td>
            <td class="px-3 py-2 text-center border-r border-[#e4dccb]">${esc(s.halaqah)}</td>
            <td class="px-4 py-2 text-right">
                <button class="text-emerald-600 hover:text-emerald-800 font-bold text-xs" onclick="openProfileModal('student', masterSantri.find(x => x.id === '${s.id}'))">Edit</button>
                <button class="text-rose-600 hover:text-rose-800 font-bold text-xs ml-2" onclick="deleteStudent(masterSantri.find(x => x.id === '${s.id}'), this)">Hapus</button>
            </td>
        </tr>
    `).join('');
}
function renderAdminClasses() {
    const list = byId("admin-class-list"); if (!list) return;
    let classes = []; if (window.masterKelas && window.masterKelas.length > 0) classes = window.masterKelas.map(k => k.nama); else classes = [...new Set(studentList().map(s => s.kelas).filter(Boolean))];
    const studentCount = {}; studentList().forEach(s => { if (s.kelas) studentCount[s.kelas] = (studentCount[s.kelas] || 0) + 1; });
    list.innerHTML = classes.sort((a,b) => a.localeCompare(b, "id", {numeric: true})).map(c => `
        <div class="canva-card p-3 rounded-xl border border-stone-200 bg-white flex flex-col justify-between shadow-sm">
            <div class="text-center mb-2">
                <p class="font-bold text-xl text-emerald-700">${esc(c)}</p>
                <p class="text-xs text-stone-500 font-semibold">${studentCount[c] || 0} Santri</p>
            </div>
            <div class="flex justify-center gap-2 mt-2 pt-2 border-t border-stone-100">
                <button class="text-emerald-600 hover:text-emerald-800 text-xs font-bold" onclick="openKelasModal('${esc(c)}')">Edit</button>
                <button class="text-rose-600 hover:text-rose-800 text-xs font-bold" onclick="deleteKelasAdmin('${esc(c)}', ${studentCount[c] || 0})">Hapus</button>
            </div>
        </div>
    `).join('');
}
function renderAdminUsers() {
    const list = byId("admin-user-list"); if (!list) return;
    list.innerHTML = '<tr><td colspan="6" class="text-center py-4">Memuat data user...</td></tr>';
    window.dataSdk.getUsers().then(res => {
        if (res.isOk) {
            list.innerHTML = res.users.map((u, i) => `
                <tr class="border-b border-[#e4dccb] hover:bg-[#fcfaf5]">
                    <td class="px-3 py-2 text-center border-r border-[#e4dccb]">${i+1}</td>
                    <td class="px-4 py-2 border-r border-[#e4dccb] font-semibold">${esc(u.username)}</td>
                    <td class="px-3 py-2 text-center border-r border-[#e4dccb]">****</td>
                    <td class="px-3 py-2 text-center border-r border-[#e4dccb]">${esc(u.role)}</td>
                    <td class="px-3 py-2 text-center border-r border-[#e4dccb]">${esc(u.halaqah)}</td>
                    <td class="px-4 py-2 text-right">
                        <button class="text-emerald-600 hover:text-emerald-800 font-bold text-xs" onclick="openUserModal('${esc(u.username)}', '${esc(u.role)}', '${esc(u.halaqah)}')">Edit</button>
                        <button class="text-rose-600 hover:text-rose-800 font-bold text-xs ml-2" onclick="deleteUserAdmin('${esc(u.username)}', this)">Hapus</button>
                    </td>
                </tr>
            `).join('');
            if (res.users.length === 0) list.innerHTML = '<tr><td colspan="6" class="text-center py-4">Belum ada akun.</td></tr>';
        }
    }).catch(e => { list.innerHTML = '<tr><td colspan="6" class="text-center text-rose-500 py-4">Gagal memuat data.</td></tr>'; });
}

async function renderAuditLog() {
    const list = byId("audit-log-list"); if (!list) return;
    list.innerHTML = '<tr><td colspan="4" class="text-center py-4">Memuat data...</td></tr>';
    try {
        const res = await window.dataSdk.getAuditLogs();
        if (res.isOk) {
            list.innerHTML = res.logs.map(l => `
                <tr class="border-b border-stone-100 hover:bg-stone-50">
                    <td class="px-4 py-2 text-xs text-stone-500">${new Date(l.timestamp).toLocaleString("id-ID")}</td>
                    <td class="px-4 py-2 font-semibold text-xs">${esc(l.user)}</td>
                    <td class="px-4 py-2 text-xs"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded">${esc(l.action)}</span></td>
                    <td class="px-4 py-2 text-xs text-stone-600">${esc(l.details)}</td>
                </tr>
            `).join('');
            if (res.logs.length === 0) list.innerHTML = '<tr><td colspan="4" class="text-center py-4">Belum ada log.</td></tr>';
        }
    } catch(e) { list.innerHTML = '<tr><td colspan="4" class="text-center text-rose-500 py-4">Gagal memuat log.</td></tr>'; }
}

async function initCalendar() { await ensureCalendarLoaded(); if (typeof FullCalendar === 'undefined') return; const calendarEl = byId('agenda-calendar-container'); if (!calendarEl) return; const agendaRecords = (window.records || []).filter(r => r.tipe === "agenda_tahfidz"); const events = agendaRecords.map(r => ({ id: r.__backendId, title: r.nama_santri, start: r.tanggal, color: r.status, extendedProps: { description: r.evaluasi } })); if (fullCalendarInstance) fullCalendarInstance.destroy(); fullCalendarInstance = new FullCalendar.Calendar(calendarEl, { initialView: 'dayGridMonth', locale: 'id', headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }, events: events, eventClick: async function(info) { const detail = info.event.extendedProps.description ? `\nKeterangan: ${info.event.extendedProps.description}` : ""; if (confirm(`Agenda: ${info.event.title}${detail}\n\nHapus jadwal ini?`)) { const rec = (window.records || []).find(r => r.__backendId === info.event.id); if (rec) await window.dataSdk.delete(rec); } } }); }

function renderAll() {
  populateAllFilters(); renderStats(); renderProgressionChart(); renderLeaderboard(); renderHistory(); renderTeachers(); renderMutasi(); renderRekapBulanan(); renderRekapUjianGlobal(); initCalendar(); 
  if (window.lucide) lucide.createIcons();
  if (typeof window.renderRoster === 'function') window.renderRoster();
  if (byId("lap-3") && !byId("lap-3").classList.contains("hidden")) { populateAdminFilters(); renderAdminStudents(); renderAdminClasses(); renderAdminUsers(); }
}
window.render = renderAll;

function openProfileModal(type, data = null) {
  modalState = {type, data}; const isStudent = type === "student"; byId("profile-modal").classList.remove("hidden"); byId("modal-kicker").textContent = isStudent ? "Data Santri" : "Manajemen Halaqah"; byId("modal-title").textContent = data ? (isStudent ? "Edit Santri" : "Edit Halaqah") : (isStudent ? "Tambah Santri" : "Tambah Halaqah"); byId("lbl-profile-name").textContent = isStudent ? "Nama Lengkap Santri" : "Nama Guru / Pengampu"; byId("modal-class-wrap").classList.toggle("hidden", !isStudent); byId("modal-foto-wrap").classList.toggle("hidden", !isStudent); byId("profile-name").value = isStudent ? (data?.nama || "") : (data?.guru || ""); byId("profile-class").value = isStudent ? (data?.kelas || "") : ""; byId("profile-foto-file").value = ""; byId("crop-container").classList.add("hidden"); if (cropper) { cropper.destroy(); cropper = null; } const foto = isStudent ? (data?.foto || "") : ""; byId("profile-foto").value = foto; if (foto && foto.length > 100) { byId("profile-foto-preview").src = foto; byId("profile-foto-preview").classList.remove("hidden"); byId("btn-hapus-foto").classList.remove("hidden"); } else { byId("profile-foto-preview").classList.add("hidden"); byId("btn-hapus-foto").classList.add("hidden"); } const hlqInput = byId("profile-halaqah"); if (isStudent) { hlqInput.value = data ? getHalaqahName(data) : (byId("f-halaqah").value.includes("Semua") ? "" : byId("f-halaqah").value); } else { hlqInput.value = data?.nama || ""; } byId("profile-error").classList.add("hidden"); byId("profile-name").focus();
}
function closeProfileModal() { byId("profile-modal").classList.add("hidden"); modalState = null; if (cropper) { cropper.destroy(); cropper = null; } }
async function deleteActivity(record, button) { if (confirm("Yakin batalkan/hapus catatan ini permanen?")) { button.disabled = true; button.textContent = "Proses..."; await window.dataSdk.delete(record); } }
async function deleteStudent(student, button) { if (confirm(`Yakin hapus santri ${student.nama}? (Riwayat tetap aman)`)) { button.disabled = true; button.textContent = "Proses..."; await window.dataSdk.deleteSantri({ id: student.id, user: window.currentUser.username }); } }
async function deleteTeacher(halaqah, button) { if (confirm(`Yakin hapus halaqah [${halaqah.nama}]?`)) { button.disabled = true; button.textContent = "Proses..."; await window.dataSdk.deleteHalaqah({ id: halaqah.id, user: window.currentUser.username }); } }

window.openKelasModal = function(namaLama = null) {
    byId("kelas-modal").classList.remove("hidden");
    byId("kelas-modal-title").textContent = namaLama ? "Edit Kelas" : "Tambah Kelas";
    byId("kelas-old-name").value = namaLama || "";
    byId("kelas-name").value = namaLama || "";
    byId("kelas-error").classList.add("hidden");
    byId("kelas-name").focus();
};

window.deleteKelasAdmin = async function(nama, count) {
    if (count > 0) { alert(`Kelas "${nama}" masih memiliki ${count} santri. Pindahkan atau hapus santri terlebih dahulu sebelum menghapus kelas.`); return; }
    if (!confirm(`Yakin ingin menghapus kelas "${nama}"?`)) return;
    try {
        const res = await window.dataSdk.deleteKelas({ nama, user: window.currentUser.username });
        if (res.isOk) showToast("Kelas dihapus"); else alert(res.message || "Gagal menghapus");
    } catch(e) { alert("Gagal menghapus"); }
};

if (byId("add-kelas-admin")) byId("add-kelas-admin").addEventListener("click", () => window.openKelasModal());
if (byId("close-kelas-modal")) byId("close-kelas-modal").addEventListener("click", () => { byId("kelas-modal").classList.add("hidden"); byId("kelas-form").reset(); });

if (byId("kelas-form")) byId("kelas-form").addEventListener("submit", async e => {
    e.preventDefault();
    const oldName = byId("kelas-old-name").value;
    const newName = byId("kelas-name").value.trim();
    const btn = byId("kelas-submit");
    const err = byId("kelas-error");
    if (!newName) return;
    btn.disabled = true; err.classList.add("hidden");
    let result;
    if (oldName) result = await window.dataSdk.updateKelas({ oldName, newName, user: window.currentUser.username });
    else result = await window.dataSdk.createKelas({ nama: newName, user: window.currentUser.username });
    btn.disabled = false;
    if (result.isOk) { byId("kelas-modal").classList.add("hidden"); e.target.reset(); showToast("Data kelas disimpan"); } 
    else { err.textContent = result.message || "Gagal menyimpan"; err.classList.remove("hidden"); }
});

window.openUserModal = function(userLama = null, role = 'Guru', halaqah = '') {
    byId("user-modal").classList.remove("hidden");
    byId("user-modal-title").textContent = userLama ? "Edit Akun" : "Tambah Akun";
    byId("user-old-username").value = userLama || "";
    byId("user-username").value = userLama || "";
    byId("user-pin").value = "";
    byId("user-role").value = role;
    const selH = byId("user-halaqah");
    clearSelect(selH, "Semua Halaqah");
    halaqahList().forEach(h => option(selH, h.nama, h.nama));
    option(selH, "Semua", "Semua");
    if ([...selH.options].some(o => o.value === halaqah)) selH.value = halaqah;
    byId("user-error").classList.add("hidden");
    byId("user-username").focus();
};

window.deleteUserAdmin = async function(username, btn) {
    if (!confirm(`Yakin ingin menghapus akun "${username}"?`)) return;
    btn.disabled = true;
    try {
        const res = await window.dataSdk.deleteUser({ username, user: window.currentUser.username });
        if (res.isOk) showToast("Akun dihapus"); else alert(res.message || "Gagal menghapus");
    } catch(e) { alert("Gagal menghapus"); }
    finally { btn.disabled = false; }
};

if (byId("add-user-admin")) byId("add-user-admin").addEventListener("click", () => window.openUserModal());
if (byId("close-user-modal")) byId("close-user-modal").addEventListener("click", () => { byId("user-modal").classList.add("hidden"); byId("user-form").reset(); });

if (byId("user-form")) byId("user-form").addEventListener("submit", async e => {
    e.preventDefault();
    const oldUsername = byId("user-old-username").value;
    const username = byId("user-username").value.trim();
    const pin = byId("user-pin").value.trim();
    const role = byId("user-role").value;
    const halaqah = byId("user-halaqah").value;
    const btn = byId("user-submit");
    const err = byId("user-error");
    if (!username || !pin) { err.textContent = "Username dan PIN wajib diisi."; err.classList.remove("hidden"); return; }
    btn.disabled = true; err.classList.add("hidden");
    let result;
    if (oldUsername) result = await window.dataSdk.updateUser({ oldUsername, username, pin, role, halaqah, user: window.currentUser.username });
    else result = await window.dataSdk.createUser({ username, pin, role, halaqah, user: window.currentUser.username });
    btn.disabled = false;
    if (result.isOk) { byId("user-modal").classList.add("hidden"); e.target.reset(); showToast("Akun disimpan"); } 
    else { err.textContent = result.message || "Gagal menyimpan"; err.classList.remove("hidden"); }
});

if (byId("import-csv-btn")) byId("import-csv-btn").addEventListener("click", () => byId("import-modal").classList.remove("hidden"));
if (byId("close-import-modal")) byId("close-import-modal").addEventListener("click", () => { byId("import-modal").classList.add("hidden"); byId("import-form").reset(); });

if (byId("import-form")) byId("import-form").addEventListener("submit", async e => {
    e.preventDefault();
    const file = byId("csv-file").files[0];
    const btn = byId("import-submit");
    const err = byId("import-error");
    if (!file) return;
    btn.disabled = true; btn.textContent = "Memproses..."; err.classList.add("hidden");
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const text = ev.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
            const dataArr = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(",");
                if (cols.length >= 3) {
                    dataArr.push({
                        nama: cols[0].trim(),
                        kelas: cols[1].trim(),
                        halaqah: cols[2].trim(),
                        user: window.currentUser.username
                    });
                }
            }
            if (dataArr.length === 0) throw new Error("Format tidak valid / tidak ada data.");
            const res = await window.dataSdk.bulkCreateSantri(dataArr);
            if (res.isOk) { byId("import-modal").classList.add("hidden"); e.target.reset(); showToast(`Berhasil import ${res.count} santri`); } 
            else throw new Error(res.message);
        } catch(ex) {
            err.textContent = ex.message; err.classList.remove("hidden");
        } finally {
            btn.disabled = false; btn.textContent = "Mulai Import";
        }
    };
    reader.readAsText(file);
});

if (byId("btn-hadir-semua")) byId("btn-hadir-semua").addEventListener("click", async function() { const students = filteredStudents(); if (students.length === 0) return alert("Tidak ada santri."); if (!confirm("Tandai HADIR semua santri di daftar ini?")) return; const btn = this; const orig = btn.innerHTML; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px"></i> Proses...`; btn.disabled = true; const isoDate = getIsoForDate(getActiveDate()); const payloads = students.map(s => ({ nama_santri: s.nama, kelas: s.kelas, halaqah: getHalaqahName(s), tanggal: isoDate, tipe: "kehadiran", kehadiran: "Hadir", user: window.currentUser.username })); const result = await window.dataSdk.bulkAttendance(payloads); btn.innerHTML = orig; btn.disabled = false; if (window.lucide) lucide.createIcons(); showToast(result.message || "Selesai", !result.isOk); });
if (byId("btn-alfa-semua")) byId("btn-alfa-semua").addEventListener("click", async function() { const students = filteredStudents(); if (students.length === 0) return alert("Tidak ada santri."); if (!confirm("Tandai ALFA semua santri di daftar ini?")) return; const btn = this; const orig = btn.innerHTML; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px"></i> Proses...`; btn.disabled = true; const isoDate = getIsoForDate(getActiveDate()); const payloads = students.map(s => ({ nama_santri: s.nama, kelas: s.kelas, halaqah: getHalaqahName(s), tanggal: isoDate, tipe: "kehadiran", kehadiran: "Alfa", user: window.currentUser.username })); const result = await window.dataSdk.bulkAttendance(payloads); btn.innerHTML = orig; btn.disabled = false; if (window.lucide) lucide.createIcons(); showToast(result.message || "Selesai", !result.isOk); });
if (byId("add-student-btn")) byId("add-student-btn").addEventListener("click", () => openProfileModal("student"));
if (byId("add-student-btn-mobile")) byId("add-student-btn-mobile").addEventListener("click", () => openProfileModal("student"));
if (byId("add-teacher-btn")) byId("add-teacher-btn").addEventListener("click", () => openProfileModal("teacher"));
if (byId("close-modal")) byId("close-modal").addEventListener("click", closeProfileModal);
if (byId("add-student-admin")) byId("add-student-admin").addEventListener("click", () => openProfileModal("student"));

if (byId("admin-search-student")) byId("admin-search-student").addEventListener("input", renderAdminStudents);
if (byId("admin-filter-halaqah")) byId("admin-filter-halaqah").addEventListener("change", renderAdminStudents);
if (byId("admin-filter-kelas")) byId("admin-filter-kelas").addEventListener("change", renderAdminStudents);

if (byId("setoran-form")) byId("setoran-form").addEventListener("submit", async e => {
  e.preventDefault(); const error = byId("setoran-error"); error.classList.add("hidden"); const tipe = byId("f-tipe-setoran").value; const isIqra = tipe === "Iqra"; const katQuran = byId("f-kategori-quran").value; const baris = byId("f-baris").value === "custom" ? Number(byId("f-baris-custom").value) : Number(byId("f-baris").value); let juzVal, surahVal, ayatVal;
  if (isIqra) { juzVal = byId("f-iqra").value; surahVal = byId("f-halaman-iqra").value; ayatVal = "1"; if (!juzVal || !surahVal || !baris || baris < 1) { error.textContent = "Lengkapi Jilid, Halaman, dan baris."; error.classList.remove("hidden"); return; } } else { juzVal = byId("f-juz").value; surahVal = byId("f-surah").value; ayatVal = byId("f-ayat").value; if (!selectedStudent || !baris || baris < 1 || !ayatVal) { error.textContent = "Lengkapi pilihan ayat dan baris."; error.classList.remove("hidden"); return; } }
  const rawEv = byId("f-evaluasi").value.trim(); const fixCat = isIqra ? "Sabaq" : katQuran; const finalEv = `[${fixCat}] ${rawEv}`; const isoDate = getIsoForDate(byId("f-tanggal-setoran").value); const row = { nama_santri: selectedStudent.nama, kelas: selectedStudent.kelas, halaqah: getHalaqahName(selectedStudent), tanggal: isoDate, juz: juzVal, surah: surahVal, ayat: ayatVal, jumlah_baris: baris, status: byId("f-status").value, evaluasi: finalEv, tipe: "setoran_kehadiran", kehadiran: "Hadir", user: window.currentUser.username };
  if (isDuplicate(row)) { error.textContent = "Setoran persis sama sudah tercatat di tanggal ini."; error.classList.remove("hidden"); return; }
  const btn = byId("submit-btn"); btn.disabled = true; const result = await window.dataSdk.create(row); btn.disabled = false;
  if (result.isOk) { e.target.reset(); populateJuz(); populateBaris(); byId("setoran-panel").classList.add("hidden"); showToast("Setoran tersimpan", false, result.id); } else { error.textContent = "Gagal menyimpan."; error.classList.remove("hidden"); }
});

if (byId("ujian-form")) byId("ujian-form").addEventListener("submit", async e => {
  e.preventDefault(); const error = byId("ujian-error"); error.classList.add("hidden"); const tipeUjian = byId("u-tipe").value; const nK = Number(byId("u-kelancaran").value) || 0; const nT = Number(byId("u-tajwid").value) || 0; const nF = Number(byId("u-fashahah").value) || 0; const catatan = byId("u-catatan").value.trim(); const avg = Math.round((nK + nT + nF) / 3); const predikat = getPredikatUjian(avg); const isoDate = getIsoForDate(byId("u-tanggal").value);
  const row = { nama_santri: selectedStudent.nama, kelas: selectedStudent.kelas, halaqah: getHalaqahName(selectedStudent), tanggal: isoDate, juz: String(nK), surah: tipeUjian, ayat: String(avg), jumlah_baris: nT, status: predikat, evaluasi: catatan + ` | Fashahah: ${nF}`, tipe: "ujian_semester", kehadiran: "Hadir", user: window.currentUser.username };
  const btn = byId("submit-ujian-btn"); btn.disabled = true; const result = await window.dataSdk.create(row); btn.disabled = false;
  if (result.isOk) { e.target.reset(); byId("ujian-panel").classList.add("hidden"); showToast("Nilai ujian tersimpan", false, result.id); } else { error.textContent = "Gagal menyimpan."; error.classList.remove("hidden"); }
});

if (byId("add-mutasi-btn")) byId("add-mutasi-btn").addEventListener("click", () => { byId("mutasi-modal").classList.remove("hidden"); let sList = filteredStudents(); if (sList.length === 0) sList = studentList(); sList.sort((a, b) => a.nama.localeCompare(b.nama, "id")); clearSelect(byId("mutasi-siswa"), "-- Pilih Santri --"); sList.forEach(s => option(byId("mutasi-siswa"), s.nama, s.nama)); clearSelect(byId("mutasi-tujuan-halaqah"), "-- Pilih Halaqah Tujuan --"); halaqahList().forEach(h => option(byId("mutasi-tujuan-halaqah"), h.nama, h.nama)); });
if (byId("close-mutasi-modal")) byId("close-mutasi-modal").addEventListener("click", () => { byId("mutasi-modal").classList.add("hidden"); byId("mutasi-form").reset(); });
if (byId("mutasi-siswa")) byId("mutasi-siswa").addEventListener("change", (e) => { const student = studentList().find(s => s.nama === e.target.value); if (student) { byId("mutasi-kelas").value = student.kelas; byId("mutasi-asal-halaqah").value = getHalaqahName(student); } });
if (byId("mutasi-tujuan-halaqah")) byId("mutasi-tujuan-halaqah").addEventListener("change", (e) => { const hData = halaqahList().find(h => h.nama === e.target.value); byId("mutasi-tujuan-guru").value = hData ? hData.guru : "-"; });
if (byId("mutasi-form")) byId("mutasi-form").addEventListener("submit", async e => {
  e.preventDefault(); const btn = byId("mutasi-submit"); btn.disabled = true; const error = byId("mutasi-error"); error.classList.add("hidden"); const namaSantri = byId("mutasi-siswa").value; const student = studentList().find(s => s.nama === namaSantri); if (!student) { error.textContent = "Santri tidak ditemukan."; error.classList.remove("hidden"); btn.disabled = false; return; }
  const originHalaqah = student.halaqah;
  const originGuru = halaqahList().find(h => h.nama === originHalaqah)?.guru || "-";
  const targetHalaqah = byId("mutasi-tujuan-halaqah").value; 
  const targetGuru = byId("mutasi-tujuan-guru").value; 
  const updRes = await window.dataSdk.updateSantri({ id: student.id, nama: student.nama, kelas: student.kelas, halaqah: targetHalaqah, foto: student.foto, status: 'Aktif', user: window.currentUser.username });
  await window.dataSdk.create({ nama_santri: student.nama, kelas: student.kelas, halaqah: originHalaqah, evaluasi: originGuru, juz: targetHalaqah, surah: targetGuru, tanggal: getIsoForDate(byId("mutasi-tanggal").value), ayat: "", jumlah_baris: 0, status: "", tipe: "mutasi_tahfidz", kehadiran: "", user: window.currentUser.username }); btn.disabled = false;
  if (updRes.isOk) { byId("mutasi-modal").classList.add("hidden"); e.target.reset(); showToast("Mutasi berhasil"); } else { error.textContent = "Gagal memproses."; error.classList.remove("hidden"); }
});

if (byId("profile-form")) byId("profile-form").addEventListener("submit", async e => {
  e.preventDefault(); const error = byId("profile-error"); error.classList.add("hidden"); const name = byId("profile-name").value.trim(); const halaqah = byId("profile-halaqah").value.trim(); const kelas = byId("profile-class").value.trim(); if (cropper) byId("btn-crop").click(); const foto = byId("profile-foto").value.trim(); const isStudent = modalState?.type === "student"; if (!name || !halaqah || (isStudent && !kelas)) { error.textContent = "Lengkapi semua kolom."; error.classList.remove("hidden"); return; } const submit = byId("profile-submit"); submit.disabled = true; let result;
  if (isStudent) { const ex = modalState.data; if (ex && ex.id) { result = await window.dataSdk.updateSantri({ id: ex.id, nama: name, kelas, halaqah, foto, status: 'Aktif', user: window.currentUser.username }); } else { result = await window.dataSdk.createSantri({ nama: name, kelas, halaqah, foto, status: 'Aktif', user: window.currentUser.username }); } } else { const ex = modalState.data; if (ex && ex.id) { result = await window.dataSdk.updateHalaqah({ id: ex.id, nama: halaqah, guru: name, status: 'Aktif', user: window.currentUser.username }); } else { result = await window.dataSdk.createHalaqah({ nama: halaqah, guru: name, status: 'Aktif', user: window.currentUser.username }); } }
  submit.disabled = false; if (result.isOk) { closeProfileModal(); showToast("Tersimpan"); } else { error.textContent = "Gagal menyimpan."; error.classList.remove("hidden"); }
});

if (byId("export-csv-btn")) byId("export-csv-btn").addEventListener("click", () => {
  const h = byId("riwayat-filter-halaqah").value, k = byId("riwayat-filter-kelas").value, n = byId("riwayat-filter-nama").value; const allLogs = (window.records || []).filter(r => r.tipe === "setoran_kehadiran" || r.tipe === "kehadiran" || r.tipe === "ujian_semester"); const filtered = allLogs.filter(r => (!h || r.halaqah === h) && (!k || r.kelas === k) && (!n || r.nama_santri === n)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const headers = ["Tanggal","Nama","Halaqah","Kelas","Tipe","Kategori","Kehadiran","Juz/Kelancaran","Surah/Tipe_Ujian","Ayat/Rata2","Baris/Tajwid","Status/Predikat","Evaluasi"];
  const rows = filtered.length ? filtered.map(r => [ dateKey(r.tanggal), r.nama_santri, r.halaqah, r.kelas, r.tipe, r.tipe === "setoran_kehadiran" ? parseCat(r.evaluasi) : "", r.kehadiran, r.juz, r.surah, r.ayat, r.jumlah_baris, r.status, cleanEv(r.evaluasi) ]) : [["Tidak ada data","","","","","","","","","","","",""]];
  const escapeCsv = val => `"${String(val ?? "").replace(/"/g, '""')}"`; const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\r\n"); const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `rekap_santri_${todayKey()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

if (byId("generate-report-btn")) byId("generate-report-btn").addEventListener("click", () => {
  const nama = byId("laporan-siswa").value; 
  if (!nama) { byId("report-poster-wrapper").classList.add("hidden"); byId("print-rapor-btn").classList.add("hidden"); return; } 
  
  const targetZiyadah = Number(byId("laporan-target").value) || 1; 
  const targetMurojaah = Number(byId("laporan-hafalan-saat-ini").value) || 1; 
  const start = byId("laporan-start").value, end = byId("laporan-end").value; 
  const student = studentList().find(s => s.nama === nama); 
  const all = (window.records || []).filter(r => r.nama_santri === nama && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end));

  const hadir = all.filter(r => (r.kehadiran === "Hadir" || r.tipe === "setoran_kehadiran") && r.tipe !== "ujian_semester").length; 
  const sakit = all.filter(r => r.kehadiran === "Sakit").length; 
  const izin = all.filter(r => r.kehadiran === "Izin").length; 
  const alfa = all.filter(r => r.kehadiran === "Alfa").length; 
  const total = hadir + sakit + izin + alfa; 
  const pct = total ? Math.round(hadir / total * 100) : 0;
  
  byId("rpt-attendance-percent").textContent = pct + "%"; 
  byId("rpt-hadir").textContent = hadir; 
  byId("rpt-sakit").textContent = sakit; 
  byId("rpt-izin").textContent = izin; 
  byId("rpt-alfa").textContent = alfa; 
  
  byId("report-student-name").textContent = nama; 
  byId("report-student-meta").textContent = `${getHalaqahName(student)} · Kelas ${student?.kelas || ""}`; 
  byId("report-period-text").textContent = `${start || "Awal"} — ${end || "Sekarang"}`;
  
  byId("report-student-name-p2").textContent = nama;
  byId("report-student-meta-p2").textContent = `${getHalaqahName(student)} · Kelas ${student?.kelas || ""}`;
  byId("rpt-print-date").textContent = new Date().toLocaleDateString("id-ID", {day: 'numeric', month: 'long', year: 'numeric'});

  const allSetor = all.filter(r => r.tipe === "setoran_kehadiran").sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); 
  const ziyadahAsc = [...allSetor].filter(r => parseCat(r.evaluasi) === "Sabaq").sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal)); 
  const murojaah = allSetor.filter(r => parseCat(r.evaluasi) === "Sabqi"); 
  const firstZ = ziyadahAsc[0], lastZ = ziyadahAsc[ziyadahAsc.length - 1];
  
  const formatLoc = z => !z ? "—" : z.juz?.startsWith("Iqra") ? `${z.juz} Hal ${z.surah}` : `Juz ${z.juz} - ${z.surah} (${z.ayat})`; 
  byId("rpt-batas-awal").textContent = formatLoc(firstZ); 
  byId("rpt-batas-akhir").textContent = formatLoc(lastZ);
  
  const totalZ = ziyadahAsc.reduce((s, r) => s + (Number(r.jumlah_baris) || 0), 0); 
  const targetZ = targetZiyadah * 300; 
  let pctZ = Math.round((totalZ / targetZ) * 100); if (pctZ > 100) pctZ = 100; 
  byId("rpt-progress-text").textContent = `${pctZ}%`; 
  byId("rpt-progress-bar").style.width = `${pctZ}%`; 
  byId("rpt-progress-baris").textContent = totalZ; 
  byId("rpt-target-baris").textContent = targetZ; 
  byId("rpt-total-baris").textContent = totalZ;
  
  const totalM = murojaah.reduce((s, r) => s + (Number(r.jumlah_baris) || 0), 0); 
  const targetM = targetMurojaah * 300; 
  let pctM = Math.round((totalM / targetM) * 100); if (pctM > 100) pctM = 100; 
  byId("rpt-murojaah-progress-text").textContent = `${pctM}%`; 
  byId("rpt-murojaah-bar").style.width = `${pctM}%`; 
  byId("rpt-murojaah-baris").textContent = totalM; 
  byId("rpt-murojaah-target-baris").textContent = targetM;

  const mapHafalan = new Map(); 
  [...allSetor].reverse().forEach(r => { 
    const isIqra = r.juz?.startsWith("Iqra"); 
    const loc = `${isIqra ? r.juz : 'Juz ' + (r.juz || '')} - ${r.surah} ${r.ayat ? `(Ayat ${r.ayat})` : ''}`; 
    mapHafalan.set(loc, r.status); 
  });
  
  const lstK = byId("rpt-hafalan-kuat"); 
  lstK.innerHTML = ""; 
  const lstL = byId("rpt-hafalan-lemah"); 
  lstL.innerHTML = ""; 
  let hasK = false, hasL = false; 
  
  mapHafalan.forEach((status, loc) => { 
    if (status === "Lancar") { hasK = true; lstK.innerHTML += `<li>${esc(loc)}</li>`; } 
    else { hasL = true; lstL.innerHTML += `<li>${esc(loc)}</li>`; } 
  }); 
  
  if (!hasK) lstK.innerHTML = `<li class="list-none opacity-50 italic">Belum ada data</li>`; 
  if (!hasL) lstL.innerHTML = `<li class="list-none opacity-50 italic">Aman / Tidak ada</li>`;

  const allUjian = all.filter(r => r.tipe === "ujian_semester").sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); 
  const examContainer = byId("rpt-exam-container"); 
  examContainer.innerHTML = "";
  
  if (allUjian.length > 0) { 
    byId("rpt-exam-section").classList.remove("hidden"); 
    allUjian.forEach(u => { 
      const node = byId("rpt-exam-card-template").content.cloneNode(true); 
      node.querySelector(".exam-title").textContent = u.surah; 
      node.querySelector(".exam-date").textContent = new Date(u.tanggal).toLocaleDateString("id-ID", {day: '2-digit', month: 'short', year: 'numeric'}); 
      node.querySelector(".exam-score").textContent = u.ayat; 
      const pred = node.querySelector(".exam-predicate"); 
      pred.textContent = u.status; 
      if (u.status === "Roosib" || u.status === "Maqbuul") { pred.className = "exam-predicate"; pred.style.cssText = "margin:0;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:#fef2f2;color:#b91c1c;text-transform:uppercase;"; }
      else if (u.status.includes("Jayyid")) { pred.className = "exam-predicate"; pred.style.cssText = "margin:0;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:#ecfdf5;color:#047857;text-transform:uppercase;"; }
      else { pred.className = "exam-predicate"; pred.style.cssText = "margin:0;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:#eef2ff;color:#4338ca;text-transform:uppercase;"; }
      
      node.querySelector(".exam-kel").textContent = u.juz; 
      node.querySelector(".exam-taj").textContent = u.jumlah_baris; 
      const parts = (u.evaluasi || "").split("| Fashahah:"); 
      node.querySelector(".exam-fas").textContent = parts.length > 1 ? parts[1].trim() : "-"; 
      examContainer.appendChild(node); 
    }); 
  } else { 
    byId("rpt-exam-section").classList.add("hidden"); 
  }

  const body = byId("rpt-history-body"); 
  body.innerHTML = ""; 
  allSetor.slice(0, 10).forEach(r => { 
    const tr = document.createElement("tr"); 
    const cat = parseCat(r.evaluasi); 
    tr.innerHTML = `
      <td style="padding:6px 8px;font-size:10px;text-align:center;border-bottom:1px solid #f5f5f4;">${new Date(r.tanggal).toLocaleDateString("id-ID", {day: "2-digit", month: "short"})}</td>
      <td style="padding:6px 8px;font-size:9px;text-transform:uppercase;text-align:center;border-bottom:1px solid #f5f5f4;font-weight:700;color:${cat === "Sabaq" ? "#047857" : cat === "Sabqi" ? "#b45309" : "#4f46e5"};">${cat}</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;border-bottom:1px solid #f5f5f4;font-weight:600;color:${r.status === "Lancar" ? "#047857" : "#b91c1c"};">${esc(r.status || "-")}</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;border-bottom:1px solid #f5f5f4;">${esc(r.juz || "-")}</td>
      <td style="padding:6px 8px;font-size:10px;border-bottom:1px solid #f5f5f4;">${esc(r.surah || "-")} : ${esc(r.ayat || "-")}</td>
      <td style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;border-bottom:1px solid #f5f5f4;">${esc(r.jumlah_baris || "-")}</td>
    `; 
    body.appendChild(tr); 
  });
  
  if (allSetor.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-stone-500">Belum ada data setoran.</td></tr>`;
  }

  byId("report-poster-wrapper").classList.remove("hidden"); 
  byId("print-rapor-btn").classList.remove("hidden"); 
  byId("report-poster-wrapper").scrollIntoView({behavior: "smooth", block: "start"});
});

// === PRINT RAPOR via NEW WINDOW (POPUP) ===
if (byId("print-rapor-btn")) byId("print-rapor-btn").addEventListener("click", () => {
  const printArea = byId("print-area");
  if (!printArea || !printArea.innerHTML.trim()) return alert("Rapor belum di-generate. Klik 'Tampilkan Rapor' dulu.");
  
  const content = printArea.outerHTML;
  
  const printWin = window.open('', '_blank', 'width=1000,height=900');
  if (!printWin) return alert("Popup diblokir. Izinkan popup untuk aplikasi ini di pengaturan browser Anda.");
  
  printWin.document.open();
  printWin.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Rapor Perkembangan Santri</title>
  <script src="https://cdn.tailwindcss.com/3.4.17"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/lucide@0.263.0/dist/umd/lucide.min.js"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --forest:#1f6f54; --paper:#fffdf8; --ink:#2e2a20; --line:#d6cdb8; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Work Sans', sans-serif; color: var(--ink); }
    @page { size: A4 portrait; margin: 0; }
    #print-area { width: 210mm; background: white; }
    .page-break {
      width: 210mm;
      min-height: 260mm;
      padding: 10mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: white;
      page-break-after: always;
      break-after: page;
    }
    .page-break:last-child { page-break-after: auto; break-after: auto; }
    @media screen {
      body { background: #e5e5e5; padding: 20px; }
      #print-area { margin: 0 auto; }
      .page-break { box-shadow: 0 4px 20px rgba(0,0,0,0.15); margin-bottom: 20px; }
    }
  </style>
</head>
<body>
${content}
<script>
  window.onload = function() {
    if (window.lucide) try { lucide.createIcons(); } catch(e) {}
    setTimeout(function() { window.focus(); window.print(); }, 1500);
  };
<\/script>
</body>
</html>`);
  printWin.document.close();
});

if (byId("print-rekap-btn")) byId("print-rekap-btn").addEventListener("click", () => { const listHtml = byId("rekap-grid-list").innerHTML; if (!listHtml || byId("rekap-grid-list").children.length === 0) return alert("Tabel kosong."); const bln = byId("rekap-bulan-input").value; const h = byId("rekap-halaqah").value || "Semua Halaqah"; const k = byId("rekap-kelas").value || "Semua Kelas"; const printWin = window.open('', '_blank'); printWin.document.write(`<!DOCTYPE html><html><head><title>Rekap Bulanan</title><style>@page{size:A4 portrait;margin:15mm}body{font-family:Arial,sans-serif;color:#333;margin:0;padding:0}.header{text-align:center;border-bottom:2px solid #1f6f54;padding-bottom:10px;margin-bottom:20px}.header h1{font-size:20px;margin:0;color:#1f6f54;text-transform:uppercase}.header p{font-size:13px;margin:5px 0 0 0;color:#555}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px 6px;text-align:center}th{background-color:#f7f5f0;color:#1f6f54;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}td:nth-child(2){text-align:left;font-weight:bold}tr:nth-child(even){background-color:#fcfaf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class="header"><h1>Rekap Kehadiran & Hafalan Bulanan</h1><p>Periode: <strong>${bln}</strong> | Halaqah: <strong>${h}</strong> | Kelas: <strong>${k}</strong></p></div><table><thead><tr><th>No</th><th>Nama Santri</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alfa</th><th>Sabaq</th><th>Sabqi</th><th>Manzil</th></tr></thead><tbody>${listHtml}</tbody></table><script>window.onload=function(){setTimeout(()=>{window.print()},400)}<\/script></body></html>`); printWin.document.close(); });
if (byId("print-leaderboard-btn")) byId("print-leaderboard-btn").addEventListener("click", () => { if (currentLeaderboardData.length === 0) return alert("Tidak ada data."); if (activeLeaderboardTab === "wanted") return alert("Mode Wanted: gunakan screenshot."); if (activeLeaderboardTab === "kandidat") return alert("Mode kandidat: gunakan CSV."); const start = byId("leaderboard-start").value, end = byId("leaderboard-end").value; const catText = activeLeaderboardTab === "quran" ? "AL-QURAN" : activeLeaderboardTab === "iqra" ? "IQRA" : "NILAI UJIAN"; const periodText = (start || end) ? `Periode: ${start || 'Awal'} s/d ${end || 'Sekarang'}` : 'Semua Waktu'; let rowsHtml = ""; currentLeaderboardData.forEach((item, i) => { let scoreText = ""; if (item.type === "quran") scoreText = `${item.baris} baris`; else if (item.type === "iqra") scoreText = `Jilid ${item.maxJilid} - Hal ${item.maxHalaman}`; else scoreText = `Nilai: ${item.maxScore} (${item.predicate})`; const rankCol = item.rank === "-" ? i + 1 : item.rank; rowsHtml += `<tr><td style="font-weight:bold;font-size:14px;">${rankCol}</td><td style="text-align:left;padding-left:12px;font-weight:600;">${esc(item.nama)}</td><td>${esc(item.kelas)}</td><td>${esc(item.halaqah)}</td><td style="font-weight:bold;color:#1f6f54;">${scoreText}</td></tr>`; }); const printWin = window.open('', '_blank'); printWin.document.write(`<!DOCTYPE html><html><head><title>Leaderboard ${catText}</title><style>@page{size:A4 portrait;margin:20mm}body{font-family:Arial,sans-serif;color:#333;margin:0;padding:0}.header{text-align:center;border-bottom:2px solid #1f6f54;padding-bottom:15px;margin-bottom:25px}.header h1{font-size:22px;margin:0;color:#1f6f54;letter-spacing:1px}.header p{font-size:13px;margin:6px 0 0 0;color:#555;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:10px 6px;text-align:center}th{background-color:#f7f5f0;color:#1f6f54;font-weight:bold;text-transform:uppercase;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even){background-color:#fcfaf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class="header"><h1>${catText}</h1><p>${periodText}</p></div><table><thead><tr><th>No</th><th style="text-align:left;padding-left:12px;">Nama Santri</th><th>Kelas</th><th>Halaqah</th><th>Pencapaian</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=function(){setTimeout(()=>{window.print()},400)}<\/script></body></html>`); printWin.document.close(); });
if (byId("print-blanko-btn")) byId("print-blanko-btn").addEventListener("click", () => { const students = filteredStudents(); if (students.length === 0) return alert("Tidak ada santri pada filter ini."); const halaqahName = byId("f-halaqah").value || "Semua Halaqah"; let guruName = "-"; if (halaqahName !== "Semua Halaqah") { const hData = halaqahList().find(h => h.nama === halaqahName); if (hData) guruName = hData.guru; } let rowsHtml = ""; students.forEach((s, i) => { rowsHtml += `<tr><td>${i+1}</td><td style="text-align:left;padding-left:8px;">${esc(s.nama)}</td><td>${esc(s.kelas)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`; }); const printWin = window.open('', '_blank'); printWin.document.write(`<!DOCTYPE html><html><head><title>Mutaba'ah - ${halaqahName}</title><style>@page{size:A4 landscape;margin:15mm}body{font-family:Arial,sans-serif;color:#000;margin:0;padding:0;background:white}.header{text-align:center;margin-bottom:20px}.header h1{font-size:18px;margin:0;letter-spacing:1px;text-transform:uppercase}.header p{font-size:13px;margin:5px 0 0 0;color:#333}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1.5px solid #333;padding:8px 4px;text-align:center;vertical-align:middle}th{background-color:#f1f5f9;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}.footer{margin-top:40px;text-align:right;padding-right:50px;font-size:13px}.footer-sig{margin-top:60px;font-weight:bold;text-decoration:underline}</style></head><body><div class="header"><h1>LEMBAR MUTABA'AH MINGGUAN (OFFLINE)</h1><p>Halaqah: <strong>${halaqahName}</strong> | Kelas: <strong>${byId("f-kelas").value || 'Semua'}</strong> | Tanggal: ..... s/d .....</p></div><table><thead><tr><th rowspan="2" style="width:4%;">No</th><th rowspan="2" style="width:20%;">Nama Santri</th><th rowspan="2" style="width:6%;">Kls</th><th colspan="2">Senin</th><th colspan="2">Selasa</th><th colspan="2">Rabu</th><th colspan="2">Kamis</th><th colspan="2">Jum'at</th></tr><tr><th>H</th><th>Hafalan</th><th>H</th><th>Hafalan</th><th>H</th><th>Hafalan</th><th>H</th><th>Hafalan</th><th>H</th><th>Hafalan</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="footer"><p>Guru Pengampu,</p><p class="footer-sig">${esc(guruName)}</p></div><script>window.onload=function(){setTimeout(()=>{window.print()},400)}<\/script></body></html>`); printWin.document.close(); });

// GLOBAL EVENT LISTENERS
if (byId("global-input-date")) byId("global-input-date").addEventListener("change", () => { renderRoster(); renderStats(); renderLeaderboard(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("global-input-date-roster")) byId("global-input-date-roster").addEventListener("change", () => { if(byId("global-input-date")) byId("global-input-date").value = byId("global-input-date-roster").value; renderRoster(); renderStats(); renderLeaderboard(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("f-search")) byId("f-search").addEventListener("input", () => { renderRoster(); renderStats(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("f-halaqah")) byId("f-halaqah").addEventListener("change", () => { populateClassFilters(); renderRoster(); renderStats(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("f-kelas")) byId("f-kelas").addEventListener("change", () => { renderRoster(); renderStats(); if(window.renderInputCepat) renderInputCepat(); });

['prog-start','prog-end','prog-halaqah','prog-kelas','prog-nama'].forEach(id => { if (byId(id)) byId(id).addEventListener('change', renderProgressionChart); });
if (byId("leaderboard-jenjang")) byId("leaderboard-jenjang").addEventListener("change", renderLeaderboard);
if (byId("leaderboard-halaqah")) byId("leaderboard-halaqah").addEventListener("change", () => { populateClassFilters(); renderLeaderboard(); });
if (byId("leaderboard-kelas")) byId("leaderboard-kelas").addEventListener("change", renderLeaderboard);
if (byId("leaderboard-start")) byId("leaderboard-start").addEventListener("change", renderLeaderboard);
if (byId("leaderboard-end")) byId("leaderboard-end").addEventListener("change", renderLeaderboard);
if (byId("rekap-bulan-input")) byId("rekap-bulan-input").addEventListener("change", renderRekapBulanan);
if (byId("rekap-halaqah")) byId("rekap-halaqah").addEventListener("change", () => { populateClassFilters(); renderRekapBulanan(); });
if (byId("rekap-kelas")) byId("rekap-kelas").addEventListener("change", renderRekapBulanan);
if (byId("rekap-ujian-halaqah")) byId("rekap-ujian-halaqah").addEventListener("change", () => { populateClassFilters(); renderRekapUjianGlobal(); });
if (byId("rekap-ujian-kelas")) byId("rekap-ujian-kelas").addEventListener("change", renderRekapUjianGlobal);
if (byId("riwayat-filter-halaqah")) byId("riwayat-filter-halaqah").addEventListener("change", () => { populateClassFilters(); populateHistoryNames(); renderHistory(); });
if (byId("riwayat-filter-kelas")) byId("riwayat-filter-kelas").addEventListener("change", () => { populateHistoryNames(); renderHistory(); });
if (byId("riwayat-filter-nama")) byId("riwayat-filter-nama").addEventListener("change", renderHistory);

if (byId("f-juz")) byId("f-juz").addEventListener("change", populateSurah);
if (byId("f-surah")) byId("f-surah").addEventListener("change", populateAyat);
if (byId("f-baris")) byId("f-baris").addEventListener("change", () => byId("f-baris-custom").classList.toggle("hidden", byId("f-baris").value !== "custom"));
if (byId("close-setoran")) byId("close-setoran").addEventListener("click", () => byId("setoran-panel").classList.add("hidden"));
if (byId("close-ujian")) byId("close-ujian").addEventListener("click", () => byId("ujian-panel").classList.add("hidden"));
if (byId("laporan-halaqah")) byId("laporan-halaqah").addEventListener("change", () => { populateClassFilters(); });
if (byId("laporan-kelas")) byId("laporan-kelas").addEventListener("change", populateLaporanSiswa);

const setTabStyle = (activeId) => { ["tab-leaderboard-quran","tab-leaderboard-iqra","tab-leaderboard-ujian","tab-leaderboard-wanted","tab-leaderboard-kandidat"].forEach(id => { const el = byId(id); if (!el) return; if (id === activeId) { if (id === "tab-leaderboard-wanted") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-rose-700 text-white shadow-sm transition-all"; else if (id === "tab-leaderboard-kandidat") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-indigo-600 text-white shadow-sm transition-all"; else el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-[#1f6f54] text-white transition-all"; } else { if (id === "tab-leaderboard-wanted") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-200 transition-all hover:bg-rose-100 flex items-center gap-1"; else if (id === "tab-leaderboard-kandidat") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 transition-all hover:bg-indigo-100 flex items-center gap-1"; else el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-[#f3eee2] text-[#4a4436] transition-all"; } }); };
if (byId("tab-leaderboard-quran")) byId("tab-leaderboard-quran").addEventListener("click", () => { activeLeaderboardTab = "quran"; setTabStyle("tab-leaderboard-quran"); renderLeaderboard(); });
if (byId("tab-leaderboard-iqra")) byId("tab-leaderboard-iqra").addEventListener("click", () => { activeLeaderboardTab = "iqra"; setTabStyle("tab-leaderboard-iqra"); renderLeaderboard(); });
if (byId("tab-leaderboard-ujian")) byId("tab-leaderboard-ujian").addEventListener("click", () => { activeLeaderboardTab = "ujian"; setTabStyle("tab-leaderboard-ujian"); renderLeaderboard(); });
if (byId("tab-leaderboard-wanted")) byId("tab-leaderboard-wanted").addEventListener("click", () => { activeLeaderboardTab = "wanted"; setTabStyle("tab-leaderboard-wanted"); renderLeaderboard(); });
if (byId("tab-leaderboard-kandidat")) byId("tab-leaderboard-kandidat").addEventListener("click", () => { activeLeaderboardTab = "kandidat"; setTabStyle("tab-leaderboard-kandidat"); renderLeaderboard(); });

if (byId("add-kandidat-btn")) byId("add-kandidat-btn").addEventListener("click", () => byId("kandidat-modal").classList.remove("hidden"));
if (byId("close-kandidat-modal")) byId("close-kandidat-modal").addEventListener("click", () => { byId("kandidat-modal").classList.add("hidden"); byId("kandidat-form").reset(); });
if (byId("kandidat-form")) byId("kandidat-form").addEventListener("submit", async e => { e.preventDefault(); const btn = byId("kandidat-submit"); btn.disabled = true; const error = byId("kandidat-error"); error.classList.add("hidden"); const row = { nama_santri: byId("kandidat-nama").value.trim(), halaqah: byId("kandidat-halaqah").value.trim(), kelas: byId("kandidat-kelas").value.trim(), tanggal: new Date().toISOString(), evaluasi: byId("kandidat-evaluasi").value.trim(), tipe: "kandidat_tes", kehadiran: "", user: window.currentUser.username }; const result = await window.dataSdk.create(row); btn.disabled = false; if (result.isOk) { byId("kandidat-modal").classList.add("hidden"); e.target.reset(); showToast("Kandidat tersimpan"); } else { error.textContent = "Gagal."; error.classList.remove("hidden"); } });
if (byId("add-agenda-btn")) byId("add-agenda-btn").addEventListener("click", () => byId("agenda-modal").classList.remove("hidden"));
if (byId("close-agenda-modal")) byId("close-agenda-modal").addEventListener("click", () => { byId("agenda-modal").classList.add("hidden"); byId("agenda-form").reset(); });
if (byId("agenda-form")) byId("agenda-form").addEventListener("submit", async e => { e.preventDefault(); const btn = byId("agenda-submit"); btn.disabled = true; const error = byId("agenda-error"); error.classList.add("hidden"); const row = { nama_santri: byId("agenda-title").value.trim(), tanggal: getIsoForDate(byId("agenda-start").value), status: byId("agenda-color").value, evaluasi: byId("agenda-desc").value.trim(), tipe: "agenda_tahfidz", kehadiran: "", user: window.currentUser.username }; const result = await window.dataSdk.create(row); btn.disabled = false; if (result.isOk) { byId("agenda-modal").classList.add("hidden"); e.target.reset(); initCalendar(); showToast("Agenda tersimpan"); } else { error.textContent = "Gagal."; error.classList.remove("hidden"); } });

// INIT PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
  });
}

// INIT APP
window.addEventListener("DOMContentLoaded", () => {
  if (byId("global-input-date")) byId("global-input-date").value = todayKey();
  if (byId("global-input-date-roster")) byId("global-input-date-roster").value = todayKey();
  if (byId("rekap-bulan-input")) byId("rekap-bulan-input").value = new Date().toISOString().slice(0, 7);
  populateJuz(); populateBaris(); setupTipeSetoranToggle();
  checkAuth();
});