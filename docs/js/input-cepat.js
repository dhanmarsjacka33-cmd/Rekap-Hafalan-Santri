let filterMode = 'semua';
let searchQuery = '';
let isFastMode = true; // Default ke mode cepat untuk HP

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
    card.className = `roster-card bg-white border border-stone-200 rounded-xl p-3 shadow-sm ${hasSetoran ? 'sudah-setor' : ''}`;
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
      
      <div class="grid grid-cols-2 gap-2 mb-3">
        <select class="input-base input-jenis" ${hasSetoran ? 'disabled' : ''}>
          <option value="Ziyadah">Ziyadah (Baru)</option>
          <option value="Murojaah">Murojaah (Ulang)</option>
        </select>
        <select class="input-base input-nilai" ${hasSetoran ? 'disabled' : ''}>
          <option value="Lancar">Lancar</option>
          <option value="Perlu Perbaikan">Perbaikan</option>
          <option value="Diulang">Diulang</option>
        </select>
        <input type="number" class="input-base input-juz focus:ring-emerald-500" placeholder="Juz" inputmode="numeric" ${hasSetoran ? 'disabled' : ''}>
        <input type="text" class="input-base input-hal" placeholder="Hal / Ayat" ${hasSetoran ? 'disabled' : ''}>
      </div>

      <div class="flex gap-2">
        <button class="btn-secondary px-3 text-xs btn-salin" title="Salin setoran terakhir" ${!lastSetoran || hasSetoran ? 'disabled' : ''}>
          <i data-lucide="clipboard-paste" style="width:14px;height:14px"></i> Salin
        </button>
        <button class="btn-primary flex-1 text-sm btn-simpan" ${hasSetoran ? 'disabled' : ''}>
          ${hasSetoran ? 'Tersimpan ✓' : 'Simpan Setoran'}
        </button>
      </div>
    `;

    card.querySelector('.btn-salin').addEventListener('click', () => {
      if (!lastSetoran) return;
      card.querySelector('.input-juz').value = lastSetoran.juz || '';
      card.querySelector('.input-hal').value = lastSetoran.surah || '';
      card.querySelector('.input-jenis').value = String(lastSetoran.evaluasi).includes('[Murojaah]') ? 'Murojaah' : 'Ziyadah';
      card.querySelector('.input-nilai').value = lastSetoran.status || 'Lancar';
      card.querySelector('.input-hal').focus();
      showToast("Data disalin, silakan ubah Hal/Ayat");
    });

    card.querySelector('.btn-simpan').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const juzInput = card.querySelector('.input-juz');
      const halInput = card.querySelector('.input-hal');
      const juz = juzInput.value.trim(); const hal = halInput.value.trim();

      juzInput.classList.remove('input-error'); halInput.classList.remove('input-error');
      if (!juz) { juzInput.classList.add('input-error'); juzInput.focus(); return; }
      if (!hal) { halInput.classList.add('input-error'); halInput.focus(); return; }

      btn.innerHTML = 'Menyimpan...'; btn.disabled = true;

      const payload = {
        nama_santri: s.nama, kelas: s.kelas, halaqah: s.halaqah,
        tanggal: getIsoForDate(targetDate), juz: juz, surah: hal, ayat: "",
        jumlah_baris: 1, status: card.querySelector('.input-nilai').value,
        evaluasi: `[${card.querySelector('.input-jenis').value}]`,
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
              const nextJuz = nextCard.querySelector('.input-juz');
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
    btnRoster.className = "btn-primary px-4 py-2 text-sm flex items-center gap-2";
    btnCepat.className = "btn-secondary px-4 py-2 text-sm flex items-center gap-2 border-stone-300 text-stone-600 bg-white";
    renderRoster(); // Panggil fungsi render tabel
  } else {
    isFastMode = true;
    rosterContainer.classList.add('hidden');
    fastContainer.classList.remove('hidden');
    btnRoster.className = "btn-secondary px-4 py-2 text-sm flex items-center gap-2 border-stone-300 text-stone-600 bg-white";
    btnCepat.className = "btn-primary px-4 py-2 text-sm flex items-center gap-2";
    renderInputCepat();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Cek layar (default: Cepat untuk HP, Roster untuk Desktop)
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
      document.querySelectorAll('.input-juz').forEach(input => { if (!input.value && !input.disabled) input.value = juz; });
      showToast("Juz berhasil diisi massal");
    }
  });

  // Patch render utama
  const originalRender = window.render;
  window.render = function() { originalRender(); if (isFastMode) renderInputCepat(); else renderRoster(); };
});