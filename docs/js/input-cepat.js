let filterMode = 'semua';
let searchQuery = '';
let isFastMode = true; 

// Peta Maksimal Ayat per Surah
const SURAH_MAX_AYAT = {
  "Al-Fatihah": 7, "Al-Baqarah": 286, "Ali Imran": 200, "An-Nisa": 176, "Al-Ma'idah": 120,
  "Al-An'am": 165, "Al-A'raf": 206, "Al-Anfal": 75, "At-Taubah": 129, "Yunus": 109,
  "Hud": 123, "Yusuf": 111, "Ar-Ra'd": 43, "Ibrahim": 52, "Al-Hijr": 99,
  "An-Nahl": 128, "Al-Isra": 111, "Al-Kahf": 110, "Maryam": 98, "Taha": 135,
  "Al-Anbiya": 112, "Al-Hajj": 78, "Al-Mu'minun": 118, "An-Nur": 64, "Al-Furqan": 77,
  "Asy-Syu'ara": 227, "An-Naml": 93, "Al-Qasas": 88, "Al-Ankabut": 69, "Ar-Rum": 60,
  "Luqman": 34, "As-Sajdah": 30, "Al-Ahzab": 73, "Saba'": 54, "Fatir": 45,
  "Yasin": 83, "As-Saffat": 182, "Sad": 88, "Az-Zumar": 75, "Ghafir": 85,
  "Fussilat": 54, "Asy-Syura": 53, "Az-Zukhruf": 89, "Ad-Dukhan": 59, "Al-Jasiyah": 37,
  "Al-Ahqaf": 35, "Muhammad": 38, "Al-Fath": 29, "Al-Hujurat": 18, "Qaf": 45,
  "Adz-Dzariyat": 60, "At-Tur": 49, "An-Najm": 62, "Al-Qamar": 55, "Ar-Rahman": 78,
  "Al-Waqi'ah": 96, "Al-Hadid": 29, "Al-Mujadilah": 22, "Al-Hasyr": 24, "Al-Mumtahanah": 13,
  "As-Saff": 14, "Al-Jumu'ah": 11, "Al-Munafiqun": 11, "At-Taghabun": 18, "At-Talaq": 12,
  "At-Tahrim": 12, "Al-Mulk": 30, "Al-Qalam": 52, "Al-Haqqah": 52, "Al-Ma'arij": 44,
  "Nuh": 28, "Al-Jinn": 28, "Al-Muzzammil": 20, "Al-Mudassir": 56, "Al-Qiyamah": 40,
  "Al-Insan": 31, "Al-Mursalat": 50, "An-Naba": 40, "An-Nazi'at": 46, "'Abasa": 42,
  "At-Takwir": 29, "Al-Infitar": 19, "Al-Mutaffifin": 36, "Al-Insyigaq": 25, "Al-Buruj": 22,
  "At-Tariq": 17, "Al-A'la": 19, "Al-Ghasyiyah": 26, "Al-Fajr": 30, "Al-Balad": 20,
  "Asy-Syams": 15, "Al-Lail": 21, "Ad-Duha": 11, "Asy-Syarh": 8, "At-Tin": 8,
  "Al-'Alaq": 19, "Al-Qadr": 5, "Al-Bayyinah": 8, "Al-Zalzalah": 8, "Al-'Adiyat": 11,
  "Al-Qari'ah": 11, "At-Takasur": 8, "Al-'Asr": 3, "Al-Humazah": 9, "Al-Fil": 5,
  "Quraisy": 4, "Al-Ma'un": 7, "Al-Kausar": 3, "Al-Kafirun": 6, "An-Nasr": 3,
  "Al-Lahab": 5, "Al-Ikhlas": 4, "Al-Falaq": 5, "An-Nas": 6
};

function renderInputCepat() {
  const container = document.getElementById('list-input-cepat');
  if (!container) return;

  const targetDate = getActiveDate();
  const students = filteredStudents().filter(s => {
    const key = s.nama.toLowerCase();
    if (searchQuery && !key.includes(searchQuery)) return false;
    
    const hasSetoran = window.records.some(r => r.nama_santri === s.nama && r.tipe === "setoran_kehadiran" && dateKey(r.tanggal) === targetDate);
    const hasAbsen = window.records.find(r => r.nama_santri === s.nama && r.tipe === "kehadiran" && dateKey(r.tanggal) === targetDate);
    const isAlfa = hasAbsen && hasAbsen.kehadiran === 'Alfa';

    if (filterMode === 'belum') return !hasSetoran && !isAlfa;
    if (filterMode === 'sudah') return hasSetoran;
    if (filterMode === 'alfa') return isAlfa;
    return true;
  });

  const displayStudents = students.slice(0, 50);
  container.innerHTML = '';

  if (students.length > 50) {
     const info = document.createElement('div');
     info.className = "text-center text-xs text-stone-500 py-2 mb-2 bg-stone-100 rounded-lg";
     info.innerText = `Menampilkan 50 dari ${students.length} santri. Gunakan pencarian/filter untuk mempersempit.`;
     container.appendChild(info);
  }

  if (displayStudents.length === 0) {
    container.innerHTML = `<p class="text-center text-stone-500 py-10">Tidak ada santri yang cocok dengan filter.</p>`;
    return;
  }

  displayStudents.forEach((s, index) => {
    const hasSetoran = window.records.some(r => r.nama_santri === s.nama && r.tipe === "setoran_kehadiran" && dateKey(r.tanggal) === targetDate);
    const lastSetoran = window.records.filter(r => r.nama_santri === s.nama && r.tipe === "setoran_kehadiran").sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))[0];

    const card = document.createElement('div');
    card.className = `roster-card bg-white border border-stone-200 rounded-xl p-4 shadow-sm ${hasSetoran ? 'sudah-setor' : ''}`;
    card.dataset.nama = s.nama; card.dataset.kelas = s.kelas; card.dataset.halaqah = s.halaqah; card.dataset.index = index;

    card.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <div>
          <h3 class="font-bold text-stone-800 text-sm leading-tight">${esc(s.nama)}</h3>
          <p class="text-[11px] text-stone-500 mt-0.5">${esc(s.halaqah)} · Kls ${esc(s.kelas)}</p>
        </div>
        <div class="check-icon text-emerald-600 font-bold text-xs flex items-center gap-1 ${hasSetoran ? '' : 'hidden'}">
          <i data-lucide="check-circle" style="width:16px;height:16px"></i> Tersimpan
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-2 mb-2">
        <select class="input-base fm-tipe" ${hasSetoran ? 'disabled' : ''}>
          <option value="Al-Quran">Al-Qur'an</option>
          <option value="Iqra">Iqra</option>
        </select>
        <select class="input-base fm-kat" ${hasSetoran ? 'disabled' : ''}>
          <option value="Ziyadah">Ziyadah (Baru)</option>
          <option value="Murojaah">Murojaah (Ulang)</option>
        </select>
      </div>
      
      <div class="grid grid-cols-2 gap-2 mb-2">
        <select class="input-base fm-juz" ${hasSetoran ? 'disabled' : ''}></select>
        <select class="input-base fm-surah" ${hasSetoran ? 'disabled' : ''}></select>
      </div>
      
      <div class="grid grid-cols-2 gap-2 mb-2">
        <input type="number" class="input-base fm-ayat" placeholder="Ayat" min="1" ${hasSetoran ? 'disabled' : ''}>
        <input type="number" class="input-base fm-baris" placeholder="Baris" min="1" ${hasSetoran ? 'disabled' : ''}>
      </div>
      
      <div class="grid grid-cols-2 gap-2 mb-3">
        <select class="input-base fm-status" ${hasSetoran ? 'disabled' : ''}>
          <option value="Lancar">Lancar</option>
          <option value="Perlu Perbaikan">Perbaikan</option>
          <option value="Diulang">Diulang</option>
        </select>
        <input type="text" class="input-base fm-catatan" placeholder="Catatan (Opsional)" ${hasSetoran ? 'disabled' : ''}>
      </div>

      <div class="flex gap-2">
        <button class="btn-outline px-3 text-xs btn-salin" title="Salin setoran terakhir" ${!lastSetoran || hasSetoran ? 'disabled' : ''}>
          <i data-lucide="clipboard-paste" style="width:14px;height:14px"></i> Salin
        </button>
        <button class="btn-main flex-1 text-sm btn-simpan" ${hasSetoran ? 'disabled' : ''}>
          ${hasSetoran ? 'Tersimpan ✓' : 'Simpan Setoran'}
        </button>
      </div>
    `;

    // Inisialisasi Dropdown Juz & Surah untuk Card ini
    const juzSel = card.querySelector('.fm-juz');
    const surahSel = card.querySelector('.fm-surah');
    const tipeSel = card.querySelector('.fm-tipe');
    const ayatInp = card.querySelector('.fm-ayat');

    function populateJuzSelect() {
       juzSel.innerHTML = '<option value="">Juz</option>';
       for(let j=30; j>=1; j--) juzSel.innerHTML += `<option value="${j}">Juz ${j}</option>`;
    }
    populateJuzSelect();

    juzSel.addEventListener('change', () => {
       const j = juzSel.value;
       surahSel.innerHTML = '<option value="">Surah</option>';
       if (JUZ_MAPPING[j]) JUZ_MAPPING[j].forEach(item => surahSel.innerHTML += `<option value="${item[0]}">${item[0]}</option>`);
       ayatInp.placeholder = "Ayat"; ayatInp.max = ""; ayatInp.value = "";
    });

    // LOGIKA MAKS AYAT DINAMIS
    surahSel.addEventListener('change', () => {
        const surahName = surahSel.value;
        const maxAyat = SURAH_MAX_AYAT[surahName];
        if (maxAyat) {
            ayatInp.max = maxAyat;
            ayatInp.placeholder = `Ayat (1-${maxAyat})`;
        } else {
            ayatInp.max = "";
            ayatInp.placeholder = "Ayat";
        }
    });

    tipeSel.addEventListener('change', () => {
        if (tipeSel.value === 'Iqra') {
            juzSel.innerHTML = '<option value="">Jilid</option><option value="Iqra Jilid 1">Iqra Jilid 1</option><option value="Iqra Jilid 2">Iqra Jilid 2</option><option value="Iqra Jilid 3">Iqra Jilid 3</option><option value="Iqra Jilid 4">Iqra Jilid 4</option><option value="Iqra Jilid 5">Iqra Jilid 5</option><option value="Iqra Jilid 6">Iqra Jilid 6</option>';
            surahSel.innerHTML = '<option value="">Halaman</option>';
            for(let p=1; p<=32; p++) surahSel.innerHTML += `<option value="${p}">Hal ${p}</option>`;
            ayatInp.value = "1"; ayatInp.disabled = true; ayatInp.max = ""; ayatInp.placeholder = "Ayat";
        } else {
            populateJuzSelect();
            surahSel.innerHTML = '<option value="">Surah</option>';
            ayatInp.disabled = false; ayatInp.value = "";
        }
    });

    card.querySelector('.btn-salin').addEventListener('click', () => {
      if (!lastSetoran) return;
      if (lastSetoran.juz?.startsWith("Iqra")) {
          tipeSel.value = "Iqra"; tipeSel.dispatchEvent(new Event('change'));
          juzSel.value = lastSetoran.juz;
          setTimeout(() => surahSel.value = lastSetoran.surah, 50);
      } else {
          tipeSel.value = "Al-Quran"; tipeSel.dispatchEvent(new Event('change'));
          juzSel.value = lastSetoran.juz; juzSel.dispatchEvent(new Event('change'));
          setTimeout(() => {
              surahSel.value = lastSetoran.surah;
              surahSel.dispatchEvent(new Event('change'));
              ayatInp.value = lastSetoran.ayat || "";
          }, 50);
      }
      card.querySelector('.fm-kat').value = String(lastSetoran.evaluasi).includes('[Murojaah]') ? 'Murojaah' : 'Ziyadah';
      card.querySelector('.fm-status').value = lastSetoran.status || 'Lancar';
      card.querySelector('.fm-baris').value = lastSetoran.jumlah_baris || 1;
      card.querySelector('.fm-catatan').focus();
      showToast("Data disalin, silakan ubah detailnya");
    });

    card.querySelector('.btn-simpan').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const tipe = tipeSel.value;
      const kat = card.querySelector('.fm-kat').value;
      const juz = juzSel.value;
      const surah = surahSel.value;
      const ayat = ayatInp.value;
      const baris = card.querySelector('.fm-baris').value;
      const status = card.querySelector('.fm-status').value;
      const catatan = card.querySelector('.fm-catatan').value.trim();

      [juzSel, surahSel, ayatInp, card.querySelector('.fm-baris')].forEach(el => el.classList.remove('input-error'));

      if (!juz) { juzSel.classList.add('input-error'); juzSel.focus(); return; }
      if (!surah) { surahSel.classList.add('input-error'); surahSel.focus(); return; }
      if (!baris || baris < 1) { card.querySelector('.fm-baris').classList.add('input-error'); card.querySelector('.fm-baris').focus(); return; }
      if (tipe === 'Al-Quran' && (!ayat || ayat < 1)) { ayatInp.classList.add('input-error'); ayatInp.focus(); return; }

      btn.innerHTML = 'Menyimpan...'; btn.disabled = true;

      const payload = {
        nama_santri: s.nama, kelas: s.kelas, halaqah: s.halaqah,
        tanggal: getIsoForDate(targetDate),
        juz: juz, surah: surah, ayat: tipe === 'Iqra' ? "1" : ayat,
        jumlah_baris: baris, status: status,
        evaluasi: `[${kat}] ${catatan}`,
        tipe: "setoran_kehadiran", kehadiran: "Hadir"
      };

      try {
        const res = await window.dataSdk.create(payload, true);
        if (res.isOk) {
          card.classList.add('sudah-setor');
          card.querySelector('.check-icon').classList.remove('hidden');
          btn.innerHTML = 'Tersimpan ✓';
          
          window.records.push({ ...payload, __backendId: res.id, tanggal: getIsoForDate(targetDate) });
          showToast("Setoran tersimpan!");

          setTimeout(() => {
            const nextCard = container.querySelector('.roster-card:not(.sudah-setor)');
            if (nextCard) {
              nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const nextJuz = nextCard.querySelector('.fm-juz');
              if (nextJuz) nextJuz.focus();
            }
          }, 300);
        } else {
          showToast(res.message || "Gagal menyimpan", true);
          btn.innerHTML = 'Simpan Setoran'; btn.disabled = false;
        }
      } catch (err) {
        showToast("Koneksi gagal", true);
        btn.innerHTML = 'Simpan Setoran'; btn.disabled = false;
      }
    });

    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function toggleMode(mode) {
  const rosterContainer = document.getElementById('roster-mode-container');
  const fastContainer = document.getElementById('fast-mode-container');
  const btnRoster = document.getElementById('mode-roster-btn');
  const btnCepat = document.getElementById('mode-cepat-btn');

  if (!rosterContainer || !fastContainer) return;

  if (mode === 'roster') {
    isFastMode = false;
    rosterContainer.classList.remove('hidden');
    fastContainer.classList.add('hidden');
    btnRoster.className = "btn-main px-4 py-2 text-sm flex items-center gap-2";
    btnCepat.className = "btn-outline px-4 py-2 text-sm flex items-center gap-2 border-stone-300 text-stone-600 bg-white";
    renderRoster();
  } else {
    isFastMode = true;
    rosterContainer.classList.add('hidden');
    fastContainer.classList.remove('hidden');
    btnRoster.className = "btn-outline px-4 py-2 text-sm flex items-center gap-2 border-stone-300 text-stone-600 bg-white";
    btnCepat.className = "btn-main px-4 py-2 text-sm flex items-center gap-2";
    renderInputCepat();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isMobile = window.innerWidth < 768;
  toggleMode(isMobile ? 'cepat' : 'roster');

  if (document.getElementById('mode-roster-btn')) document.getElementById('mode-roster-btn').addEventListener('click', () => toggleMode('roster'));
  if (document.getElementById('mode-cepat-btn')) document.getElementById('mode-cepat-btn').addEventListener('click', () => toggleMode('cepat'));

  const searchInput = document.getElementById('search-input-cepat');
  if (searchInput) searchInput.addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase(); renderInputCepat(); });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      filterMode = e.target.dataset.filter;
      renderInputCepat();
    });
  });

  const btnMassal = document.getElementById('btn-isi-massal');
  if (btnMassal) btnMassal.addEventListener('click', () => {
    const juz = prompt("Masukkan angka Juz untuk MENGISI SEMUA BARIS yang kosong:");
    if (juz) {
      document.querySelectorAll('.fm-juz').forEach(select => {
          if (!select.value && !select.disabled) {
              select.value = juz;
              select.dispatchEvent(new Event('change'));
          }
      });
      showToast("Juz berhasil diisi massal");
    }
  });

  const originalRender = window.render;
  window.render = function() { originalRender(); if (isFastMode) renderInputCepat(); else renderRoster(); };
});