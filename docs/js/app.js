// === LAZY LOADER UNTUK IPHONE ===
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  });
}
async function ensureChartLoaded() {
  if (typeof Chart === 'undefined') await loadScript('https://cdn.jsdelivr.net/npm/chart.js');
}
async function ensureCalendarLoaded() {
  if (typeof FullCalendar === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js');
  }
}

let selectedStudent = null;
let modalState = null;
let attendanceChart = null;
let setoranChart = null;
let ujianChart = null;
let progressionChart = null;
let cropper = null;
let fullCalendarInstance = null;
let activeLeaderboardTab = "quran";
let currentLeaderboardData = [];

const byId = id => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(message, isError = false) {
  const container = byId("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  if (isError) toast.style.backgroundColor = "#dc2626";
  toast.innerHTML = `<i data-lucide="${isError ? 'alert-circle' : 'check-circle'}" style="width:18px;height:18px"></i><span>${esc(message)}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const todayKey = () => new Date().toLocaleDateString("en-CA");
const dateKey = v => v ? new Date(v).toLocaleDateString("en-CA") : "";
const getActiveDate = () => { const el = byId("global-input-date"); return el && el.value ? el.value : todayKey(); };
const getIsoForDate = (dateStr) => { const d = new Date(dateStr); d.setHours(12, 0, 0, 0); return d.toISOString(); };

const getJenjang = (kelasStr) => {
  if (!kelasStr) return "";
  const k = parseInt(kelasStr);
  if (k >= 7 && k <= 9) return "SMP";
  if (k >= 10 && k <= 12) return "SMA";
  return "";
};

const getPredikatUjian = (nilai) => {
  if (nilai >= 91) return "Mumtaaz";
  if (nilai >= 81) return "Jayyid Jiddan";
  if (nilai >= 71) return "Jayyid";
  if (nilai >= 61) return "Maqbuul";
  return "Roosib";
};

const isProfile = r => ["profil_santri","profil_guru","hapus_santri","hapus_guru","snapshot","mutasi_tahfidz","ujian_semester","kandidat_tes","agenda_tahfidz"].includes(r.tipe);
const activityRecords = () => window.records ? window.records.filter(r => !isProfile(r)) : [];
const parseCat = ev => (ev && ev.startsWith("[Murojaah]")) ? "Murojaah" : "Ziyadah";
const cleanEv = ev => ev ? ev.replace(/\[(Ziyadah|Murojaah)\]\s*/, "") : "";

const option = (sel, val, lbl) => { const o = document.createElement("option"); o.value = val; o.textContent = lbl; sel.appendChild(o); };
const clearSelect = (sel, txt) => { if (!sel) return; sel.innerHTML = ""; option(sel, "", txt); };

const EXCLUDED_TAHSIN_HALAQAH = ["Halaqah 3","Halaqah 4","Halaqah 5","Halaqah 7","Halaqah 8","Halaqah 11","Halaqah 12","Halaqah 15","Halaqah 16"];

function studentList() {
  if (!window.masterSantri) return [];
  return window.masterSantri.filter(s => s.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

function halaqahList() {
  if (!window.masterHalaqah) return [];
  return window.masterHalaqah.filter(h => h.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, "id", {numeric: true}));
}

function getHalaqahName(s) { return s.halaqah || ''; }

const navBtns = document.querySelectorAll('.nav-btn');
const views = ['view-dashboard', 'view-input', 'view-laporan', 'view-agenda'];
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => {
      b.classList.remove('bg-white', 'shadow-sm', 'text-[#1f6f54]', 'font-bold');
      b.classList.add('text-stone-300', 'font-semibold');
    });
    btn.classList.add('bg-white', 'shadow-sm', 'text-[#1f6f54]', 'font-bold');
    btn.classList.remove('text-stone-300', 'font-semibold');
    const targetView = 'view-' + btn.id.split('-')[1];
    views.forEach(v => { if(byId(v)) byId(v).classList.add('hidden'); });
    if(byId(targetView)) byId(targetView).classList.remove('hidden');
    if (targetView === 'view-agenda' && fullCalendarInstance) setTimeout(() => fullCalendarInstance.render(), 150);
    if (targetView === 'view-input' && typeof window.renderInputCepat === 'function') setTimeout(window.renderInputCepat, 100);
  });
});

if (byId('toggle-filter-btn')) {
  byId('toggle-filter-btn').addEventListener('click', () => {
    const body = byId('filter-body'); const chev = byId('filter-chevron');
    body.classList.toggle('hidden');
    chev.style.transform = body.classList.contains('hidden') ? 'rotate(180deg)' : 'rotate(0deg)';
  });
}

if (byId("profile-foto-file")) {
  byId("profile-foto-file").addEventListener("change", async function(e) {
    await ensureCalendarLoaded(); // Load cropper js
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Hanya format gambar!"); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      byId("crop-image").src = event.target.result;
      byId("crop-container").classList.remove("hidden");
      byId("profile-foto-preview").classList.add("hidden");
      byId("btn-hapus-foto").classList.add("hidden");
      if (cropper) cropper.destroy();
      cropper = new Cropper(byId("crop-image"), { aspectRatio: 4/3, viewMode: 1, autoCropArea: 1 });
    };
    reader.readAsDataURL(file);
  });
}

if (byId("btn-crop")) {
  byId("btn-crop").addEventListener("click", function() {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: 320, imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    byId("profile-foto").value = dataUrl;
    byId("profile-foto-preview").src = dataUrl;
    byId("profile-foto-preview").classList.remove("hidden");
    byId("btn-hapus-foto").classList.remove("hidden");
    byId("crop-container").classList.add("hidden");
    cropper.destroy(); cropper = null;
  });
}

if (byId("btn-hapus-foto")) {
  byId("btn-hapus-foto").addEventListener("click", () => {
    byId("profile-foto").value = "";
    byId("profile-foto-file").value = "";
    byId("profile-foto-preview").src = "";
    byId("profile-foto-preview").classList.add("hidden");
    byId("btn-hapus-foto").classList.add("hidden");
    byId("crop-container").classList.add("hidden");
    if (cropper) { cropper.destroy(); cropper = null; }
  });
}

function populateHalaqahSelect(sel, placeholder, cur) {
  clearSelect(sel, placeholder);
  halaqahList().forEach(h => option(sel, h.nama, `${h.nama} · ${h.guru}`));
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  
  if (sel.id === "f-halaqah") {
    const dl = byId("halaqah-datalist");
    if (dl) { dl.innerHTML = ""; halaqahList().forEach(h => option(dl, h.nama, h.nama)); }
    const tH = byId("mutasi-tujuan-halaqah");
    if (tH) { clearSelect(tH, "-- Pilih Halaqah Tujuan --"); halaqahList().forEach(h => option(tH, h.nama, h.nama)); }
  }
}

function populateAllFilters() {
  const mH = byId("f-halaqah").value, lH = byId("leaderboard-halaqah").value, hH = byId("riwayat-filter-halaqah").value;
  const gH = byId("rekap-halaqah").value, uH = byId("rekap-ujian-halaqah").value, pH = byId("prog-halaqah").value;
  populateHalaqahSelect(byId("f-halaqah"), "-- Semua Halaqah --", mH);
  populateHalaqahSelect(byId("leaderboard-halaqah"), "Semua halaqah", lH);
  populateHalaqahSelect(byId("riwayat-filter-halaqah"), "Semua halaqah", hH);
  populateHalaqahSelect(byId("rekap-halaqah"), "Semua halaqah", gH);
  populateHalaqahSelect(byId("rekap-ujian-halaqah"), "Semua halaqah", uH);
  populateHalaqahSelect(byId("laporan-halaqah"), "-- Semua Halaqah --", byId("laporan-halaqah").value);
  populateHalaqahSelect(byId("prog-halaqah"), "Semua halaqah", pH);
  populateClassFilters();
  populateHistoryNames();
}

function classesFor(h) {
  return [...new Set(studentList().filter(s => !h || getHalaqahName(s) === h).map(s => s.kelas).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "id", {numeric: true}));
}

function populateClassSelect(sel, h, cur, ph) {
  clearSelect(sel, ph);
  classesFor(h).forEach(k => option(sel, k, `Kelas ${k}`));
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function populateClassFilters() {
  populateClassSelect(byId("f-kelas"), byId("f-halaqah").value, byId("f-kelas").value, "Semua kelas");
  populateClassSelect(byId("leaderboard-kelas"), byId("leaderboard-halaqah").value, byId("leaderboard-kelas").value, "Semua kelas");
  populateClassSelect(byId("riwayat-filter-kelas"), byId("riwayat-filter-halaqah").value, byId("riwayat-filter-kelas").value, "Semua kelas");
  populateClassSelect(byId("rekap-kelas"), byId("rekap-halaqah").value, byId("rekap-kelas").value, "Semua kelas");
  populateClassSelect(byId("rekap-ujian-kelas"), byId("rekap-ujian-halaqah").value, byId("rekap-ujian-kelas").value, "Semua kelas");
  populateClassSelect(byId("laporan-kelas"), byId("laporan-halaqah").value, byId("laporan-kelas").value, "Semua kelas");
  populateClassSelect(byId("prog-kelas"), byId("prog-halaqah").value, byId("prog-kelas").value, "Semua kelas");
  populateLaporanSiswa();
}

function populateHistoryNames() {
  const selR = byId("riwayat-filter-nama"), curR = selR.value;
  const hR = byId("riwayat-filter-halaqah").value, kR = byId("riwayat-filter-kelas").value;
  const selP = byId("prog-nama"), curP = selP.value;
  const hP = byId("prog-halaqah").value, kP = byId("prog-kelas").value;
  const allLogs = window.records ? window.records.filter(r => r.tipe === "setoran_kehadiran" || r.tipe === "kehadiran" || r.tipe === "ujian_semester") : [];
  const namesR = [...new Set(allLogs.filter(r => (!hR || r.halaqah === hR) && (!kR || r.kelas === kR)).map(r => r.nama_santri).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  clearSelect(selR, "Semua nama"); namesR.forEach(n => option(selR, n, n));
  if ([...selR.options].some(o => o.value === curR)) selR.value = curR;
  const namesP = [...new Set(allLogs.filter(r => (!hP || r.halaqah === hP) && (!kP || r.kelas === kP)).map(r => r.nama_santri).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  clearSelect(selP, "Semua nama"); namesP.forEach(n => option(selP, n, n));
  if ([...selP.options].some(o => o.value === curP)) selP.value = curP;
}

function populateLaporanSiswa() {
  const sel = byId("laporan-siswa"), cur = sel.value;
  const h = byId("laporan-halaqah").value, k = byId("laporan-kelas").value;
  const students = studentList().filter(s => (!h || getHalaqahName(s) === h) && (!k || s.kelas === k)).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  clearSelect(sel, "-- Pilih Siswa --");
  students.forEach(s => option(sel, s.nama, s.nama));
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function filteredStudents() {
  const h = byId("f-halaqah").value;
  const k = byId("f-kelas").value;
  const q = byId("f-search").value.toLowerCase().trim();
  return studentList().filter(s => (!h || getHalaqahName(s) === h) && (!k || s.kelas === k) && (!q || s.nama.toLowerCase().includes(q)))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

const JUZ_MAPPING = {1:[["Al-Fatihah",1,7],["Al-Baqarah",1,141]],2:[["Al-Baqarah",142,252]],3:[["Al-Baqarah",253,286],["Ali Imran",1,92]],4:[["Ali Imran",93,200],["An-Nisa",1,23]],5:[["An-Nisa",24,147]],6:[["An-Nisa",148,176],["Al-Ma'idah",1,81]],7:[["Al-Ma'idah",82,120],["Al-An'am",1,110]],8:[["Al-An'am",111,165],["Al-A'raf",1,87]],9:[["Al-A'raf",88,206],["Al-Anfal",1,40]],10:[["Al-Anfal",41,75],["At-Taubah",1,92]],11:[["At-Taubah",93,129],["Yunus",1,109],["Hud",1,5]],12:[["Hud",6,123],["Yusuf",1,52]],13:[["Yusuf",53,111],["Ar-Ra'd",1,43],["Ibrahim",1,52]],14:[["Al-Hijr",1,99],["An-Nahl",1,128]],15:[["Al-Isra",1,111],["Al-Kahf",1,74]],16:[["Al-Kahf",75,110],["Maryam",1,98],["Taha",1,135]],17:[["Al-Anbiya",1,112],["Al-Hajj",1,78]],18:[["Al-Mu'minun",1,118],["An-Nur",1,64],["Al-Furqan",1,20]],19:[["Al-Furqan",21,77],["Asy-Syu'ara",1,227],["An-Naml",1,55]],20:[["An-Naml",56,93],["Al-Qasas",1,88],["Al-Ankabut",1,45]],21:[["Al-Ankabut",46,69],["Ar-Rum",1,60],["Luqman",1,34],["As-Sajdah",1,30],["Al-Ahzab",1,30]],22:[["Al-Ahzab",31,73],["Saba'",1,54],["Fatir",1,45],["Yasin",1,27]],23:[["Yasin",28,83],["As-Saffat",1,182],["Sad",1,88],["Az-Zumar",1,31]],24:[["Az-Zumar",32,75],["Ghafir",1,85],["Fussilat",1,46]],25:[["Fussilat",47,54],["Asy-Syura",1,53],["Az-Zukhruf",1,89],["Ad-Dukhan",1,59],["Al-Jasiyah",1,37]],26:[["Al-Ahqaf",1,35],["Muhammad",1,38],["Al-Fath",1,29],["Al-Hujurat",1,18],["Qaf",1,45],["Adz-Dzariyat",1,30]],27:[["Adz-Dzariyat",31,60],["At-Tur",1,49],["An-Najm",1,62],["Al-Qamar",1,55],["Ar-Rahman",1,78],["Al-Waqi'ah",1,96],["Al-Hadid",1,29]],28:[["Al-Mujadilah",1,22],["Al-Hasyr",1,24],["Al-Mumtahanah",1,13],["As-Saff",1,14],["Al-Jumu'ah",1,11],["Al-Munafiqun",1,11],["At-Taghabun",1,18],["At-Talaq",1,12],["At-Tahrim",1,12]],29:[["Al-Mulk",1,30],["Al-Qalam",1,52],["Al-Haqqah",1,52],["Al-Ma'arij",1,44],["Nuh",1,28],["Al-Jinn",1,28],["Al-Muzzammil",1,20],["Al-Mudassir",1,56],["Al-Qiyamah",1,40],["Al-Insan",1,31],["Al-Mursalat",1,50]],30:[["An-Naba",1,40],["An-Nazi'at",1,46],["'Abasa",1,42],["At-Takwir",1,29],["Al-Infitar",1,19],["Al-Mutaffifin",1,36],["Al-Insyigaq",1,25],["Al-Buruj",1,22],["At-Tariq",1,17],["Al-A'la",1,19],["Al-Ghasyiyah",1,26],["Al-Fajr",1,30],["Al-Balad",1,20],["Asy-Syams",1,15],["Al-Lail",1,21],["Ad-Duha",1,11],["Asy-Syarh",1,8],["At-Tin",1,8],["Al-'Alaq",1,19],["Al-Qadr",1,5],["Al-Bayyinah",1,8],["Al-Zalzalah",1,8],["Al-'Adiyat",1,11],["Al-Qari'ah",1,11],["At-Takasur",1,8],["Al-'Asr",1,3],["Al-Humazah",1,9],["Al-Fil",1,5],["Quraisy",1,4],["Al-Ma'un",1,7],["Al-Kausar",1,3],["Al-Kafirun",1,6],["An-Nasr",1,3],["Al-Lahab",1,5],["Al-Ikhlas",1,4],["Al-Falaq",1,5],["An-Nas",1,6]]};

window.openSetoran = function(student) {
  selectedStudent = student;
  // Fungsi ini mungkin tidak dipakai lagi karena input cepat, tapi tetap dibiarkan untuk kompatibilitas
  if (typeof window.renderPanelRiwayat === 'function') window.renderPanelRiwayat(student.nama);
};

async function renderCharts(hadir, sakit, izin, alfa, lancar, perbaikan, diulang, dataUjian) {
  await ensureChartLoaded();
  if (typeof Chart === 'undefined') return;
  const ctxAtt = byId('attendanceChart');
  if (attendanceChart) attendanceChart.destroy();
  attendanceChart = new Chart(ctxAtt, { type: 'doughnut', data: { labels: ['Hadir','Sakit','Izin','Alfa'], datasets: [{ data: [hadir, sakit, izin, alfa], backgroundColor: ['#20744e','#d97706','#eab308','#a24c38'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {boxWidth: 12, font: {size: 10}} } }, cutout: '70%' } });
  const ctxSet = byId('setoranChart');
  if (setoranChart) setoranChart.destroy();
  setoranChart = new Chart(ctxSet, { type: 'bar', data: { labels: ['Lancar','Perbaikan','Diulang'], datasets: [{ label: 'Jumlah', data: [lancar, perbaikan, diulang], backgroundColor: ['#1f6f54','#f59e0b','#ef4444'], borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{stepSize:1}} } } });
  const ctxUjian = byId('ujianChart');
  if (ujianChart) ujianChart.destroy();
  let uM = 0, uJJ = 0, uJ = 0, uMq = 0, uR = 0;
  dataUjian.forEach(r => {
    if (r.status === "Mumtaaz") uM++;
    else if (r.status === "Jayyid Jiddan") uJJ++;
    else if (r.status === "Jayyid") uJ++;
    else if (r.status === "Maqbuul") uMq++;
    else if (r.status === "Roosib") uR++;
  });
  ujianChart = new Chart(ctxUjian, { type: 'doughnut', data: { labels: ['Mumtaaz','Jayyid J.','Jayyid','Maqbuul','Roosib'], datasets: [{ data: [uM, uJJ, uJ, uMq, uR], backgroundColor: ['#047857','#059669','#34d399','#fbbf24','#ef4444'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {boxWidth: 12, font: {size: 10}} } }, cutout: '60%' } });
}

function renderStats() {
  const students = filteredStudents();
  const targetDate = getActiveDate();
  let hadir = 0, sakit = 0, izin = 0, alfa = 0, lancar = 0, perbaikan = 0, diulang = 0, totalBaris = 0;
  const keys = new Set(students.map(s => `${s.nama}|${getHalaqahName(s)}`));
  const currentActivity = activityRecords().filter(r => dateKey(r.tanggal) === targetDate && keys.has(`${r.nama_santri}|${r.halaqah}`));
  students.forEach(s => {
    const sActs = currentActivity.filter(r => r.nama_santri === s.nama);
    const setoranList = sActs.filter(r => r.tipe === "setoran_kehadiran");
    const kehadiranList = sActs.filter(r => r.tipe === "kehadiran");
    let finalStatus = "Alfa";
    if (setoranList.length > 0) {
      finalStatus = "Hadir";
      setoranList.forEach(r => {
        if (r.status === "Lancar") lancar++;
        else if (r.status === "Perlu Perbaikan") perbaikan++;
        else if (r.status === "Diulang") diulang++;
        if (parseCat(r.evaluasi) === "Ziyadah") totalBaris += (Number(r.jumlah_baris) || 0);
      });
    } else if (kehadiranList.length > 0) {
      finalStatus = kehadiranList[kehadiranList.length - 1].kehadiran;
    }
    if (finalStatus === "Hadir") hadir++;
    else if (finalStatus === "Sakit") sakit++;
    else if (finalStatus === "Izin") izin++;
    else alfa++;
  });
  const h = byId("f-halaqah").value, k = byId("f-kelas").value;
  const allUjian = (window.records || []).filter(r => r.tipe === "ujian_semester" && (!h || r.halaqah === h) && (!k || r.kelas === k));
  byId("stat-santri").textContent = students.length;
  byId("stat-hadir").textContent = hadir;
  byId("stat-baris").textContent = totalBaris;
  renderCharts(hadir, sakit, izin, alfa, lancar, perbaikan, diulang, allUjian);
}

function renderProgressionChart() {
  if (typeof Chart === 'undefined') return;
  const h = byId("prog-halaqah").value, k = byId("prog-kelas").value, n = byId("prog-nama").value;
  const start = byId("prog-start").value, end = byId("prog-end").value;
  const acts = activityRecords().filter(r => r.tipe === "setoran_kehadiran");
  const filteredActs = acts.filter(r => {
    const d = dateKey(r.tanggal);
    return (!h || r.halaqah === h) && (!k || r.kelas === k) && (!n || r.nama_santri === n) && (!start || d >= start) && (!end || d <= end);
  }).sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  if (filteredActs.length === 0) {
    byId("progressionChart").classList.add("hidden"); byId("prog-empty").classList.remove("hidden"); return;
  }
  byId("progressionChart").classList.remove("hidden"); byId("prog-empty").classList.add("hidden");
  const dateMap = new Map();
  filteredActs.forEach(r => {
    const d = dateKey(r.tanggal);
    const cat = parseCat(r.evaluasi);
    const baris = Number(r.jumlah_baris) || 0;
    if (!dateMap.has(d)) dateMap.set(d, { ziyadah: 0, murojaah: 0 });
    const obj = dateMap.get(d);
    if (cat === "Ziyadah") obj.ziyadah += baris; else obj.murojaah += baris;
  });
  const labels = Array.from(dateMap.keys()).map(d => new Date(d).toLocaleDateString("id-ID", {day: '2-digit', month: 'short'}));
  const zData = Array.from(dateMap.values()).map(v => v.ziyadah);
  const mData = Array.from(dateMap.values()).map(v => v.murojaah);
  const ctx = byId('progressionChart');
  if (progressionChart) progressionChart.destroy();
  progressionChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [ { label: 'Ziyadah (Baris)', data: zData, borderColor: '#1f6f54', backgroundColor: 'rgba(31,111,84,0.1)', fill: true, tension: 0.3 }, { label: 'Murojaah (Baris)', data: mData, borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.1)', fill: true, tension: 0.3 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } } });
}

function renderLeaderboard() {
  const jenjangFilter = byId("leaderboard-jenjang").value;
  const h = byId("leaderboard-halaqah").value, k = byId("leaderboard-kelas").value;
  const start = byId("leaderboard-start").value, end = byId("leaderboard-end").value;
  const list = byId("leaderboard-list"); list.innerHTML = "";
  currentLeaderboardData = [];
  const activeStudentNames = new Set(studentList().map(s => s.nama));
  
  if (activeLeaderboardTab === "kandidat") {
    byId("add-kandidat-btn").classList.remove("hidden"); byId("filter-start-wrap").classList.add("hidden"); byId("filter-end-wrap").classList.add("hidden"); byId("filter-jenjang-wrap").classList.add("hidden");
    const kDatas = (window.records || []).filter(r => r.tipe === "kandidat_tes" && (!h || r.halaqah === h) && (!k || r.kelas === k)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    byId("leaderboard-empty").classList.toggle("hidden", kDatas.length > 0);
    kDatas.forEach(item => {
      const node = byId("kandidat-item-template").content.cloneNode(true);
      node.querySelector(".kandidat-name").textContent = item.nama_santri;
      node.querySelector(".kandidat-meta").textContent = `${item.halaqah} · Kelas ${item.kelas}`;
      node.querySelector(".kandidat-note").textContent = item.evaluasi || "";
      node.querySelector(".delete-kandidat").addEventListener("click", e => deleteActivity(item, e.currentTarget));
      list.appendChild(node);
    });
  } else {
    byId("add-kandidat-btn").classList.add("hidden"); byId("filter-start-wrap").classList.remove("hidden"); byId("filter-end-wrap").classList.remove("hidden"); byId("filter-jenjang-wrap").classList.remove("hidden");
    
    if (activeLeaderboardTab === "quran") {
      const map = new Map();
      activityRecords().filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "setoran_kehadiran" && parseCat(r.evaluasi) === "Ziyadah" && r.surah && !r.juz?.startsWith("Iqra") && (!h || r.halaqah === h) && (!k || r.kelas === k) && (!jenjangFilter || getJenjang(r.kelas) === jenjangFilter) && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end)).forEach(r => {
        const key = `${r.nama_santri}|${r.halaqah}|${r.kelas}`;
        const c = map.get(key) || {nama: r.nama_santri, halaqah: r.halaqah, kelas: r.kelas, baris: 0, setoran: 0};
        c.baris += Number(r.jumlah_baris) || 0; c.setoran += 1; map.set(key, c);
      });
      const ranking = [...map.values()].sort((a, b) => b.baris - a.baris || b.setoran - a.setoran).slice(0, 12);
      byId("leaderboard-empty").classList.toggle("hidden", ranking.length > 0);
      ranking.forEach((item, i) => {
        const node = byId("leaderboard-item-template").content.cloneNode(true);
        const rank = node.querySelector(".rank-number"); rank.textContent = i + 1;
        rank.style.cssText = i === 0 ? "background:#f7df91;color:#785211" : i === 1 ? "background:#e7e7e7;color:#555" : i === 2 ? "background:#f0d4b9;color:#83451b" : "background:#e7f0ea;color:#1f6f54";
        node.querySelector(".leader-name").textContent = item.nama;
        node.querySelector(".leader-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`;
        node.querySelector(".leader-lines").textContent = item.baris;
        node.querySelector(".leader-sub").textContent = "baris";
        list.appendChild(node); currentLeaderboardData.push({...item, rank: i + 1, type: 'quran'});
      });
    } else if (activeLeaderboardTab === "iqra") {
      const map = new Map();
      activityRecords().filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "setoran_kehadiran" && r.juz && r.juz.startsWith("Iqra") && (!h || r.halaqah === h) && (!k || r.kelas === k) && (!jenjangFilter || getJenjang(r.kelas) === jenjangFilter) && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end)).forEach(r => {
        const key = `${r.nama_santri}|${r.halaqah}|${r.kelas}`;
        const jn = parseInt(r.juz.replace("Iqra Jilid ", "")) || 1; const hn = parseInt(r.surah) || 1;
        const c = map.get(key) || {nama: r.nama_santri, halaqah: r.halaqah, kelas: r.kelas, maxJilid: 0, maxHalaman: 0};
        if (jn > c.maxJilid) { c.maxJilid = jn; c.maxHalaman = hn; } else if (jn === c.maxJilid && hn > c.maxHalaman) { c.maxHalaman = hn; }
        map.set(key, c);
      });
      const ranking = [...map.values()].sort((a, b) => b.maxJilid - a.maxJilid || b.maxHalaman - a.maxHalaman).slice(0, 12);
      byId("leaderboard-empty").classList.toggle("hidden", ranking.length > 0);
      ranking.forEach((item, i) => {
        const node = byId("leaderboard-item-template").content.cloneNode(true);
        const rank = node.querySelector(".rank-number"); rank.textContent = i + 1;
        rank.style.cssText = i === 0 ? "background:#f7df91;color:#785211" : i === 1 ? "background:#e7e7e7;color:#555" : i === 2 ? "background:#f0d4b9;color:#83451b" : "background:#e7f0ea;color:#1f6f54";
        node.querySelector(".leader-name").textContent = item.nama;
        node.querySelector(".leader-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`;
        node.querySelector(".leader-lines").textContent = `Jld ${item.maxJilid}`; node.querySelector(".leader-sub").textContent = `Hal ${item.maxHalaman}`;
        list.appendChild(node); currentLeaderboardData.push({...item, rank: i + 1, type: 'iqra'});
      });
    } else if (activeLeaderboardTab === "ujian") {
      const map = new Map();
      (window.records || []).filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "ujian_semester" && (!h || r.halaqah === h) && (!k || r.kelas === k) && (!jenjangFilter || getJenjang(r.kelas) === jenjangFilter) && (!start || dateKey(r.tanggal) >= start) && (!end || dateKey(r.tanggal) <= end)).forEach(r => {
        const key = `${r.nama_santri}|${r.halaqah}|${r.kelas}`;
        const score = parseInt(r.ayat) || 0;
        const c = map.get(key) || {nama: r.nama_santri, halaqah: r.halaqah, kelas: r.kelas, maxScore: 0, predicate: "", tipeUjian: ""};
        if (score > c.maxScore) { c.maxScore = score; c.predicate = r.status; c.tipeUjian = r.surah; }
        map.set(key, c);
      });
      const ranking = [...map.values()].sort((a, b) => b.maxScore - a.maxScore).slice(0, 12);
      byId("leaderboard-empty").classList.toggle("hidden", ranking.length > 0);
      ranking.forEach((item, i) => {
        const node = byId("leaderboard-item-template").content.cloneNode(true);
        const rank = node.querySelector(".rank-number"); rank.textContent = i + 1;
        rank.style.cssText = i === 0 ? "background:#f7df91;color:#785211" : i === 1 ? "background:#e7e7e7;color:#555" : i === 2 ? "background:#f0d4b9;color:#83451b" : "background:#e7f0ea;color:#1f6f54";
        node.querySelector(".leader-name").textContent = item.nama;
        node.querySelector(".leader-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`;
        node.querySelector(".leader-lines").textContent = item.maxScore; node.querySelector(".leader-sub").textContent = `${item.predicate} · ${item.tipeUjian}`;
        list.appendChild(node); currentLeaderboardData.push({...item, rank: i + 1, type: 'ujian'});
      });
    } else if (activeLeaderboardTab === "wanted") {
      const targetDateStr = getActiveDate(); const targetDateObj = new Date(targetDateStr + "T12:00:00");
      let earliestRecordDate = new Date();
      if ((window.records || []).length > 0) {
        const times = (window.records || []).map(r => new Date(dateKey(r.tanggal) + "T12:00:00").getTime()).filter(t => !isNaN(t));
        if (times.length > 0) earliestRecordDate = new Date(Math.min(...times));
      }
      const map = new Map();
      activityRecords().filter(r => activeStudentNames.has(r.nama_santri) && r.tipe === "setoran_kehadiran").forEach(r => {
        const rDateStr = dateKey(r.tanggal);
        if (rDateStr <= targetDateStr) { const curr = map.get(r.nama_santri); if (!curr || rDateStr > curr.lastDateStr) map.set(r.nama_santri, {lastDateStr: rDateStr, halaqah: r.halaqah, kelas: r.kelas}); }
      });
      const students = studentList().filter(s => {
        const hName = getHalaqahName(s);
        if (EXCLUDED_TAHSIN_HALAQAH.includes(hName)) return false;
        return (!h || hName === h) && (!k || s.kelas === k) && (!jenjangFilter || getJenjang(s.kelas) === jenjangFilter);
      });
      let wantedList = [];
      students.forEach(s => {
        const record = map.get(s.nama);
        let diffDays = 0;
        if (record) { const lastD = new Date(record.lastDateStr + "T12:00:00"); diffDays = Math.floor((targetDateObj - lastD) / (1000 * 60 * 60 * 24)); }
        else { diffDays = Math.floor((targetDateObj - earliestRecordDate) / (1000 * 60 * 60 * 24)); if (diffDays < 0) diffDays = 0; }
        if (diffDays >= 5) wantedList.push({nama: s.nama, halaqah: getHalaqahName(s), kelas: s.kelas, daysMissed: diffDays});
      });
      wantedList.sort((a, b) => b.daysMissed - a.daysMissed);
      byId("leaderboard-empty").classList.toggle("hidden", wantedList.length > 0);
      wantedList.slice(0, 16).forEach(item => {
        const node = byId("leaderboard-wanted-template").content.cloneNode(true);
        node.querySelector(".wanted-name").textContent = item.nama; node.querySelector(".wanted-meta").textContent = `${item.halaqah} · Kls ${item.kelas}`;
        const s = students.find(x => x.nama === item.nama);
        if (s && s.foto && s.foto.length > 100) { const img = node.querySelector(".wanted-photo"); img.src = s.foto; img.classList.remove("hidden"); node.querySelector(".wanted-placeholder").classList.add("hidden"); }
        node.querySelector(".wanted-days").textContent = `${item.daysMissed} HARI`;
        list.appendChild(node); currentLeaderboardData.push({...item, rank: "-", type: 'wanted'});
      });
    }
  }
  if (window.lucide) lucide.createIcons();
}

function renderHistory() {
  const h = byId("riwayat-filter-halaqah").value, k = byId("riwayat-filter-kelas").value, n = byId("riwayat-filter-nama").value;
  const allLogs = (window.records || []).filter(r => r.tipe === "setoran_kehadiran" || r.tipe === "kehadiran" || r.tipe === "ujian_semester");
  const filtered = allLogs.filter(r => (!h || r.halaqah === h) && (!k || r.kelas === k) && (!n || r.nama_santri === n)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const list = byId("riwayat-list"); list.innerHTML = "";
  byId("riwayat-empty").classList.toggle("hidden", filtered.length > 0);
  filtered.slice(0, 40).forEach(record => {
    const node = byId("history-row-template").content.cloneNode(true);
    node.querySelector(".history-name").textContent = record.nama_santri;
    const badge = node.querySelector(".history-badge"); const evNode = node.querySelector(".history-evaluation");
    if (record.tipe === "setoran_kehadiran") {
      const cat = parseCat(record.evaluasi); const note = cleanEv(record.evaluasi);
      node.querySelector(".history-detail").textContent = `${record.halaqah} · Kls ${record.kelas} · Juz ${record.juz} · ${record.surah} : ${record.ayat} · ${record.jumlah_baris} baris`;
      if (note) { evNode.textContent = `Catatan: ${note}`; evNode.classList.remove("hidden"); }
      badge.textContent = cat; badge.style.cssText = cat === "Ziyadah" ? "background:#dcefe3;color:#17633e" : "background:#e0e7ff;color:#3730a3";
    } else if (record.tipe === "ujian_semester") {
      node.querySelector(".history-detail").textContent = `${record.halaqah} · Kls ${record.kelas} · ${record.surah}`;
      evNode.textContent = `${record.evaluasi} · Avg: ${record.ayat}`; evNode.classList.remove("hidden");
      badge.textContent = record.status; badge.style.cssText = record.status.includes("Jayyid") || record.status === "Mumtaaz" ? "background:#fef3c7;color:#b45309" : "background:#fee2e2;color:#991b1b";
    } else {
      node.querySelector(".history-detail").textContent = `${record.halaqah} · Kls ${record.kelas} · Presensi Harian`;
      badge.textContent = record.kehadiran; badge.style.cssText = record.kehadiran === "Hadir" ? "background:#dcefe3;color:#17633e" : record.kehadiran === "Izin" ? "background:#fff0cb;color:#8a6310" : "background:#f9ddda;color:#9c352a";
    }
    node.querySelector(".history-date").textContent = new Date(record.tanggal).toLocaleDateString("id-ID", {day: "numeric", month: "short", year: "numeric"});
    node.querySelector(".delete-record").addEventListener("click", e => deleteActivity(record, e.currentTarget));
    list.appendChild(node);
  });
}

function renderMutasi() {
  const list = byId("mutasi-list"); list.innerHTML = "";
  const activeStudentNames = new Set(studentList().map(s => s.nama));
  const mutasiData = (window.records || []).filter(r => r.tipe === "mutasi_tahfidz" && activeStudentNames.has(r.nama_santri)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  byId("mutasi-empty").classList.toggle("hidden", mutasiData.length > 0);
  mutasiData.forEach(m => {
    const node = byId("mutasi-item-template").content.cloneNode(true);
    node.querySelector(".mutasi-name").textContent = m.nama_santri; node.querySelector(".mutasi-class").textContent = `Kelas ${m.kelas}`;
    node.querySelector(".mutasi-date").textContent = new Date(m.tanggal).toLocaleDateString("id-ID", {day: "numeric", month: "short", year: "numeric"});
    node.querySelector(".mutasi-asal").textContent = `${m.halaqah} (${m.evaluasi})`; node.querySelector(".mutasi-tujuan").textContent = `${m.juz} (${m.surah})`;
    node.querySelector(".delete-mutasi").addEventListener("click", e => deleteActivity(m, e.currentTarget));
    list.appendChild(node);
  });
}

function renderTeachers() {
  const list = byId("teacher-list"); list.innerHTML = "";
  halaqahList().forEach(h => {
    const node = byId("teacher-item-template").content.cloneNode(true);
    node.querySelector(".teacher-halaqah").textContent = h.nama; node.querySelector(".teacher-name").textContent = h.guru;
    node.querySelector(".edit-teacher").addEventListener("click", () => openProfileModal("teacher", h));
    node.querySelector(".delete-teacher").addEventListener("click", e => deleteTeacher(h, e.currentTarget));
    list.appendChild(node);
  });
}

function renderRekapBulanan() {
  const list = byId("rekap-grid-list"); list.innerHTML = "";
  const bln = byId("rekap-bulan-input").value; const h = byId("rekap-halaqah").value, k = byId("rekap-kelas").value;
  if (!bln) { byId("rekap-grid-empty").textContent = "Pilih bulan."; byId("rekap-grid-empty").classList.remove("hidden"); return; }
  const students = studentList().filter(s => (!h || getHalaqahName(s) === h) && (!k || s.kelas === k)).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  if (students.length === 0) { byId("rekap-grid-empty").textContent = "Tidak ada santri."; byId("rekap-grid-empty").classList.remove("hidden"); return; }
  const acts = activityRecords().filter(r => r.tanggal && r.tanggal.startsWith(bln));
  byId("rekap-grid-empty").classList.add("hidden");
  students.forEach((s, i) => {
    const sActs = acts.filter(r => r.nama_santri === s.nama);
    const daysMap = new Map();
    sActs.forEach(r => {
      const d = dateKey(r.tanggal);
      if (!daysMap.has(d)) daysMap.set(d, {status: "Alfa", ziyadah: 0, murojaah: 0});
      const entry = daysMap.get(d);
      if (r.tipe === "setoran_kehadiran") {
        entry.status = "Hadir";
        if (parseCat(r.evaluasi) === "Ziyadah") entry.ziyadah += (Number(r.jumlah_baris) || 0);
        if (parseCat(r.evaluasi) === "Murojaah") entry.murojaah += (Number(r.jumlah_baris) || 0);
      } else if (r.tipe === "kehadiran" && entry.status !== "Hadir") entry.status = r.kehadiran;
    });
    let hadir = 0, sakit = 0, izin = 0, alfa = 0, bZ = 0, bM = 0;
    daysMap.forEach(e => {
      if (e.status === "Hadir") hadir++; else if (e.status === "Sakit") sakit++; else if (e.status === "Izin") izin++; else if (e.status === "Alfa") alfa++;
      bZ += e.ziyadah; bM += e.murojaah;
    });
    const tr = document.createElement("tr");
    tr.className = "border-b border-[#e4dccb] hover:bg-[#fcfaf5]";
    tr.innerHTML = `
      <td class="text-center px-3 py-2 border-r border-[#e4dccb] text-stone-500">${i+1}</td>
      <td class="px-4 py-2 border-r border-[#e4dccb] font-semibold">${esc(s.nama)}</td>
      <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-emerald-700">${hadir || "-"}</td>
      <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-amber-600">${izin || "-"}</td>
      <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-rose-600">${sakit || "-"}</td>
      <td class="text-center px-2 py-2 border-r border-[#e4dccb] font-bold text-pink-700">${alfa || "-"}</td>
      <td class="text-center px-4 py-2 border-r border-[#e4dccb] font-bold text-[#1f6f54]">${bZ}</td>
      <td class="text-center px-4 py-2 font-bold text-indigo-700">${bM}</td>`;
    list.appendChild(tr);
  });
}

function renderRekapUjianGlobal() {
  const h = byId("rekap-ujian-halaqah").value, k = byId("rekap-ujian-kelas").value;
  const allUjian = (window.records || []).filter(r => r.tipe === "ujian_semester");
  const filtered = allUjian.filter(r => (!h || r.halaqah === h) && (!k || r.kelas === k)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const list = byId("rekap-ujian-list"); list.innerHTML = "";
  byId("rekap-ujian-empty").classList.toggle("hidden", filtered.length > 0);
  filtered.forEach((u, i) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-amber-200/50 hover:bg-amber-50/20";
    let predClass = "text-indigo-700 bg-indigo-50"; if (u.status === "Roosib" || u.status === "Maqbuul") predClass = "text-rose-700 bg-rose-50"; else if (u.status.includes("Jayyid")) predClass = "text-emerald-700 bg-emerald-50";
    const parts = (u.evaluasi || "").split("| Fashahah:"); const fash = parts.length > 1 ? parts[1].trim() : "-";
    tr.innerHTML = `
      <td class="text-center px-3 py-2 border-r border-amber-200/50 text-stone-500">${i+1}</td>
      <td class="px-4 py-2 border-r border-amber-200/50 font-semibold">${esc(u.nama_santri)}</td>
      <td class="text-center px-3 py-2 border-r border-amber-200/50 text-xs">${esc(u.kelas)}</td>
      <td class="text-center px-4 py-2 border-r border-amber-200/50 font-bold text-[#1f6f54] text-xs">${esc(u.surah)}</td>
      <td class="text-center px-3 py-2 border-r border-amber-200/50 text-xs text-stone-500">${new Date(u.tanggal).toLocaleDateString("id-ID", {day: "2-digit", month: "short"})}</td>
      <td class="text-center px-2 py-2 border-r border-amber-200/50 font-bold">${esc(u.juz)}</td>
      <td class="text-center px-2 py-2 border-r border-amber-200/50 font-bold">${esc(u.jumlah_baris)}</td>
      <td class="text-center px-2 py-2 border-r border-amber-200/50 font-bold">${esc(fash)}</td>
      <td class="text-center px-2 py-2 border-r border-amber-200/50 font-black text-lg">${esc(u.ayat)}</td>
      <td class="text-center px-4 py-2"><span class="px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${predClass}">${esc(u.status)}</span></td>`;
    list.appendChild(tr);
  });
}

async function initCalendar() {
  await ensureCalendarLoaded();
  if (typeof FullCalendar === 'undefined') return;
  const calendarEl = byId('agenda-calendar-container'); if (!calendarEl) return;
  const agendaRecords = (window.records || []).filter(r => r.tipe === "agenda_tahfidz");
  const events = agendaRecords.map(r => ({ id: r.__backendId, title: r.nama_santri, start: r.tanggal, color: r.status, extendedProps: { description: r.evaluasi } }));
  if (fullCalendarInstance) fullCalendarInstance.destroy();
  fullCalendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth', locale: 'id',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
    events: events,
    eventClick: async function(info) {
      const detail = info.event.extendedProps.description ? `\nKeterangan: ${info.event.extendedProps.description}` : "";
      if (confirm(`Agenda: ${info.event.title}${detail}\n\nHapus jadwal ini?`)) {
        const rec = (window.records || []).find(r => r.__backendId === info.event.id);
        if (rec) await window.dataSdk.delete(rec);
      }
    }
  });
}

function render() {
  populateAllFilters();
  renderStats();
  renderProgressionChart();
  renderLeaderboard();
  renderHistory();
  renderTeachers();
  renderMutasi();
  renderRekapBulanan();
  renderRekapUjianGlobal();
  initCalendar();
  if (window.lucide) lucide.createIcons();
}

window.render = render;

function openProfileModal(type, data = null) {
  modalState = {type, data};
  const isStudent = type === "student";
  byId("profile-modal").classList.remove("hidden");
  byId("modal-kicker").textContent = isStudent ? "Data Santri" : "Manajemen Halaqah";
  byId("modal-title").textContent = data ? (isStudent ? "Edit Santri" : "Edit Halaqah") : (isStudent ? "Tambah Santri" : "Tambah Halaqah");
  byId("lbl-profile-name").textContent = isStudent ? "Nama Lengkap Santri" : "Nama Guru / Pengampu";
  byId("modal-class-wrap").classList.toggle("hidden", !isStudent); byId("modal-foto-wrap").classList.toggle("hidden", !isStudent);
  byId("profile-name").value = isStudent ? (data?.nama || "") : (data?.guru || ""); byId("profile-class").value = isStudent ? (data?.kelas || "") : "";
  byId("profile-foto-file").value = ""; byId("crop-container").classList.add("hidden");
  if (cropper) { cropper.destroy(); cropper = null; }
  const foto = isStudent ? (data?.foto || "") : ""; byId("profile-foto").value = foto;
  if (foto && foto.length > 100) { byId("profile-foto-preview").src = foto; byId("profile-foto-preview").classList.remove("hidden"); byId("btn-hapus-foto").classList.remove("hidden"); }
  else { byId("profile-foto-preview").classList.add("hidden"); byId("btn-hapus-foto").classList.add("hidden"); }
  const hlqInput = byId("profile-halaqah");
  if (isStudent) hlqInput.value = data ? getHalaqahName(data) : (byId("f-halaqah").value.includes("Semua") ? "" : byId("f-halaqah").value);
  else hlqInput.value = data?.nama || "";
  byId("profile-error").classList.add("hidden"); byId("profile-name").focus();
}

function closeProfileModal() { byId("profile-modal").classList.add("hidden"); modalState = null; if (cropper) { cropper.destroy(); cropper = null; } }

async function deleteActivity(record, button) {
  if (confirm("Yakin batalkan/hapus catatan ini permanen?")) { button.disabled = true; button.textContent = "Proses..."; await window.dataSdk.delete(record); }
}

async function deleteStudent(student, button) {
  if (confirm(`Yakin hapus santri ${student.nama}? (Riwayat tetap aman)`)) { button.disabled = true; button.textContent = "Proses..."; await window.dataSdk.deleteSantri({ id: student.id }); }
}

async function deleteTeacher(halaqah, button) {
  if (confirm(`Yakin hapus halaqah [${halaqah.nama}]?`)) { button.disabled = true; button.textContent = "Proses..."; await window.dataSdk.deleteHalaqah({ id: halaqah.id }); }
}

// --- EVENT LISTENERS (Aman dari Error Null) ---
if (byId("global-input-date")) byId("global-input-date").addEventListener("change", () => { renderStats(); renderLeaderboard(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("f-search")) byId("f-search").addEventListener("input", () => { renderStats(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("f-halaqah")) byId("f-halaqah").addEventListener("change", () => { populateClassFilters(); renderStats(); if(window.renderInputCepat) renderInputCepat(); });
if (byId("f-kelas")) byId("f-kelas").addEventListener("change", () => { renderStats(); if(window.renderInputCepat) renderInputCepat(); });

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

if (byId("close-setoran")) byId("close-setoran").addEventListener("click", () => byId("setoran-panel").classList.add("hidden"));
if (byId("close-ujian")) byId("close-ujian").addEventListener("click", () => byId("ujian-panel").classList.add("hidden"));
if (byId("add-student-btn")) byId("add-student-btn").addEventListener("click", () => openProfileModal("student"));
if (byId("add-teacher-btn")) byId("add-teacher-btn").addEventListener("click", () => openProfileModal("teacher"));
if (byId("close-modal")) byId("close-modal").addEventListener("click", closeProfileModal);
if (byId("laporan-halaqah")) byId("laporan-halaqah").addEventListener("change", () => { populateClassFilters(); });
if (byId("laporan-kelas")) byId("laporan-kelas").addEventListener("change", populateLaporanSiswa);

const setTabStyle = (activeId) => {
  ["tab-leaderboard-quran","tab-leaderboard-iqra","tab-leaderboard-ujian","tab-leaderboard-wanted","tab-leaderboard-kandidat"].forEach(id => {
    const el = byId(id); if (!el) return;
    if (id === activeId) {
      if (id === "tab-leaderboard-wanted") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-rose-700 text-white shadow-sm transition-all";
      else if (id === "tab-leaderboard-kandidat") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-indigo-600 text-white shadow-sm transition-all";
      else el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-[#1f6f54] text-white transition-all";
    } else {
      if (id === "tab-leaderboard-wanted") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-200 transition-all hover:bg-rose-100 flex items-center gap-1";
      else if (id === "tab-leaderboard-kandidat") el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 transition-all hover:bg-indigo-100 flex items-center gap-1";
      else el.className = "px-4 py-1.5 text-xs font-semibold rounded-full bg-[#f3eee2] text-[#4a4436] transition-all";
    }
  });
};
if (byId("tab-leaderboard-quran")) byId("tab-leaderboard-quran").addEventListener("click", () => { activeLeaderboardTab = "quran"; setTabStyle("tab-leaderboard-quran"); renderLeaderboard(); });
if (byId("tab-leaderboard-iqra")) byId("tab-leaderboard-iqra").addEventListener("click", () => { activeLeaderboardTab = "iqra"; setTabStyle("tab-leaderboard-iqra"); renderLeaderboard(); });
if (byId("tab-leaderboard-ujian")) byId("tab-leaderboard-ujian").addEventListener("click", () => { activeLeaderboardTab = "ujian"; setTabStyle("tab-leaderboard-ujian"); renderLeaderboard(); });
if (byId("tab-leaderboard-wanted")) byId("tab-leaderboard-wanted").addEventListener("click", () => { activeLeaderboardTab = "wanted"; setTabStyle("tab-leaderboard-wanted"); renderLeaderboard(); });
if (byId("tab-leaderboard-kandidat")) byId("tab-leaderboard-kandidat").addEventListener("click", () => { activeLeaderboardTab = "kandidat"; setTabStyle("tab-leaderboard-kandidat"); renderLeaderboard(); });

if (byId("add-kandidat-btn")) byId("add-kandidat-btn").addEventListener("click", () => byId("kandidat-modal").classList.remove("hidden"));
if (byId("close-kandidat-modal")) byId("close-kandidat-modal").addEventListener("click", () => { byId("kandidat-modal").classList.add("hidden"); byId("kandidat-form").reset(); });
if (byId("kandidat-form")) byId("kandidat-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = byId("kandidat-submit"); btn.disabled = true;
  const error = byId("kandidat-error"); error.classList.add("hidden");
  const row = { nama_santri: byId("kandidat-nama").value.trim(), halaqah: byId("kandidat-halaqah").value.trim(), kelas: byId("kandidat-kelas").value.trim(), tanggal: new Date().toISOString(), evaluasi: byId("kandidat-evaluasi").value.trim(), tipe: "kandidat_tes", kehadiran: "" };
  const result = await window.dataSdk.create(row);
  btn.disabled = false;
  if (result.isOk) { byId("kandidat-modal").classList.add("hidden"); e.target.reset(); showToast("Kandidat tersimpan"); }
  else { error.textContent = "Gagal."; error.classList.remove("hidden"); }
});

if (byId("add-agenda-btn")) byId("add-agenda-btn").addEventListener("click", () => byId("agenda-modal").classList.remove("hidden"));
if (byId("close-agenda-modal")) byId("close-agenda-modal").addEventListener("click", () => { byId("agenda-modal").classList.add("hidden"); byId("agenda-form").reset(); });
if (byId("agenda-form")) byId("agenda-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = byId("agenda-submit"); btn.disabled = true;
  const error = byId("agenda-error"); error.classList.add("hidden");
  const row = { nama_santri: byId("agenda-title").value.trim(), tanggal: getIsoForDate(byId("agenda-start").value), status: byId("agenda-color").value, evaluasi: byId("agenda-desc").value.trim(), tipe: "agenda_tahfidz", kehadiran: "" };
  const result = await window.dataSdk.create(row);
  btn.disabled = false;
  if (result.isOk) { byId("agenda-modal").classList.add("hidden"); e.target.reset(); initCalendar(); showToast("Agenda tersimpan"); }
  else { error.textContent = "Gagal."; error.classList.remove("hidden"); }
});

if (byId("add-mutasi-btn")) byId("add-mutasi-btn").addEventListener("click", () => {
  byId("mutasi-modal").classList.remove("hidden");
  let sList = filteredStudents(); if (sList.length === 0) sList = studentList();
  sList.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  clearSelect(byId("mutasi-siswa"), "-- Pilih Santri --"); sList.forEach(s => option(byId("mutasi-siswa"), s.nama, s.nama));
  clearSelect(byId("mutasi-tujuan-halaqah"), "-- Pilih Halaqah Tujuan --"); halaqahList().forEach(h => option(byId("mutasi-tujuan-halaqah"), h.nama, h.nama));
});
if (byId("close-mutasi-modal")) byId("close-mutasi-modal").addEventListener("click", () => { byId("mutasi-modal").classList.add("hidden"); byId("mutasi-form").reset(); });
if (byId("mutasi-siswa")) byId("mutasi-siswa").addEventListener("change", (e) => {
  const student = studentList().find(s => s.nama === e.target.value);
  if (student) { byId("mutasi-kelas").value = student.kelas; byId("mutasi-asal-halaqah").value = getHalaqahName(student); }
});
if (byId("mutasi-tujuan-halaqah")) byId("mutasi-tujuan-halaqah").addEventListener("change", (e) => {
  const hData = halaqahList().find(h => h.nama === e.target.value);
  byId("mutasi-tujuan-guru").value = hData ? hData.guru : "-";
});
if (byId("mutasi-form")) byId("mutasi-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = byId("mutasi-submit"); btn.disabled = true;
  const error = byId("mutasi-error"); error.classList.add("hidden");
  const namaSantri = byId("mutasi-siswa").value; const student = studentList().find(s => s.nama === namaSantri);
  if (!student) { error.textContent = "Santri tidak ditemukan."; error.classList.remove("hidden"); btn.disabled = false; return; }
  const targetHalaqah = byId("mutasi-tujuan-halaqah").value; const targetGuru = byId("mutasi-tujuan-guru").value;
  const updRes = await window.dataSdk.updateSantri({ id: student.id, nama: student.nama, kelas: student.kelas, halaqah: targetHalaqah, foto: student.foto, status: 'Aktif' });
  await window.dataSdk.create({ nama_santri: student.nama, kelas: student.kelas, halaqah: student.halaqah, evaluasi: targetGuru, juz: targetHalaqah, surah: targetGuru, tanggal: getIsoForDate(byId("mutasi-tanggal").value), ayat: "", jumlah_baris: 0, status: "", tipe: "mutasi_tahfidz", kehadiran: "" });
  btn.disabled = false;
  if (updRes.isOk) { byId("mutasi-modal").classList.add("hidden"); e.target.reset(); showToast("Mutasi berhasil"); }
  else { error.textContent = "Gagal memproses."; error.classList.remove("hidden"); }
});

if (byId("profile-form")) byId("profile-form").addEventListener("submit", async e => {
  e.preventDefault();
  const error = byId("profile-error"); error.classList.add("hidden");
  const name = byId("profile-name").value.trim(); const halaqah = byId("profile-halaqah").value.trim(); const kelas = byId("profile-class").value.trim();
  if (cropper) byId("btn-crop").click();
  const foto = byId("profile-foto").value.trim(); const isStudent = modalState?.type === "student";
  if (!name || !halaqah || (isStudent && !kelas)) { error.textContent = "Lengkapi semua kolom."; error.classList.remove("hidden"); return; }
  const submit = byId("profile-submit"); submit.disabled = true; let result;
  if (isStudent) {
    const ex = modalState.data;
    if (ex && ex.id) result = await window.dataSdk.updateSantri({ id: ex.id, nama: name, kelas, halaqah, foto, status: 'Aktif' });
    else result = await window.dataSdk.createSantri({ nama: name, kelas, halaqah, foto, status: 'Aktif' });
  } else {
    const ex = modalState.data;
    if (ex && ex.id) result = await window.dataSdk.updateHalaqah({ id: ex.id, nama: halaqah, guru: name, status: 'Aktif' });
    else result = await window.dataSdk.createHalaqah({ nama: halaqah, guru: name, status: 'Aktif' });
  }
  submit.disabled = false;
  if (result.isOk) { closeProfileModal(); showToast("Tersimpan"); }
  else { error.textContent = "Gagal menyimpan."; error.classList.remove("hidden"); }
});

if (byId("export-csv-btn")) byId("export-csv-btn").addEventListener("click", () => {
  const h = byId("riwayat-filter-halaqah").value, k = byId("riwayat-filter-kelas").value, n = byId("riwayat-filter-nama").value;
  const allLogs = (window.records || []).filter(r => r.tipe === "setoran_kehadiran" || r.tipe === "kehadiran" || r.tipe === "ujian_semester");
  const filtered = allLogs.filter(r => (!h || r.halaqah === h) && (!k || r.kelas === k) && (!n || r.nama_santri === n)).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const headers = ["Tanggal","Nama","Halaqah","Kelas","Tipe","Kategori","Kehadiran","Juz/Kelancaran","Surah/Tipe_Ujian","Ayat/Rata2","Baris/Tajwid","Status/Predikat","Evaluasi"];
  const rows = filtered.length ? filtered.map(r => [ dateKey(r.tanggal), r.nama_santri, r.halaqah, r.kelas, r.tipe, r.tipe === "setoran_kehadiran" ? parseCat(r.evaluasi) : "", r.kehadiran, r.juz, r.surah, r.ayat, r.jumlah_baris, r.status, cleanEv(r.evaluasi) ]) : [["Tidak ada data","","","","","","","","","","","",""]];
  const escapeCsv = val => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"}); const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = `rekap_santri_${todayKey()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

if (byId("generate-report-btn")) byId("generate-report-btn").addEventListener("click", () => {
  // Biarkan fungsi lama Anda di sini (disembunyikan agar hemat tempat, biarkan tetap ada di kode Anda)
  // ...
});

function init() {
  if (byId("global-input-date")) byId("global-input-date").value = todayKey();
  if (byId("rekap-bulan-input")) byId("rekap-bulan-input").value = new Date().toISOString().slice(0, 7);
  populateAllFilters();
  window.dataSdk.init({ onDataChanged(data) { render(); } });
}
window.addEventListener("DOMContentLoaded", init);