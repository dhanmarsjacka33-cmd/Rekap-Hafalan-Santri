/**
 * ==========================================
 * FITUR BARU (SINKRON DENGAN GOOGLE SHEETS)
 * Bergantung pada variabel global: masterSantri, records
 * Bergantung pada API: window.dataSdk
 * ==========================================
 */

// State untuk Modal Pecah Halaqah
let pecahState = {
  asal: '',
  tujuan: '',
  selectedIds: new Set(),
  allSantri: []
};

// State untuk Undo (Menyimpan data sebelum diubah)
let undoState = {
  santriBackup: [],
  isAvailable: false
};

/**
 * Tampilkan Toast Notification (Menggunakan fungsi dari app.js jika ada, atau buat sendiri)
 */
function showToastBaru(message, type = 'success') {
  if (typeof showToast === 'function') {
    showToast(message, type === 'error'); // memanggil toast dari app.js
  } else {
    alert(message);
  }
}

/**
 * ==========================================
 * FITUR 1: PECAH HALAQAH
 * ==========================================
 */
function openPecahModal(presetAsal = '', presetTujuan = '') {
  // KODE BARU (Ambil dari fungsi halaqahList bawaan app.js)
  const halaqahData = halaqahList(); 
  const halaqahList = halaqahData.map(h => h.nama).sort((a,b) => a.localeCompare(b, "id", {numeric: true}));

function loadSantriPecah(asal) {
  pecahState.asal = asal;
  pecahState.selectedIds.clear();
  // Filter dari masterSantri (hanya yang aktif)
  pecahState.allSantri = masterSantri.filter(s => s.halaqah === asal && s.status === 'Aktif');
  renderSantriPecah();
}

function renderSantriPecah() {
  const query = document.getElementById('search-santri-pecah').value.toLowerCase();
  const container = document.getElementById('list-santri-pecah');
  
  const filtered = pecahState.allSantri.filter(s => s.nama.toLowerCase().includes(query));
  
  container.innerHTML = filtered.map(s => `
    <label class="flex items-center gap-2 p-2 hover:bg-stone-100 cursor-pointer rounded-lg">
      <input type="checkbox" value="${s.id}" ${pecahState.selectedIds.has(s.id) ? 'checked' : ''} 
        onchange="toggleSelectSantri('${s.id}', this.checked)" class="w-4 h-4 text-emerald-600 rounded">
      <span>${s.nama}</span>
    </label>
  `).join('') || '<p class="text-stone-500 text-center py-4">Tidak ada santri ditemukan.</p>';
  
  updatePreviewPecah();
}

window.toggleSelectSantri = function(id, isChecked) {
  if (isChecked) pecahState.selectedIds.add(id);
  else pecahState.selectedIds.delete(id);
  updatePreviewPecah();
};

function updatePreviewPecah() {
  const totalAsal = pecahState.allSantri.length;
  const dipilih = pecahState.selectedIds.size;
  const sisa = totalAsal - dipilih;
  const tujuan = document.getElementById('select-tujuan').value || '[Belum dipilih]';
  
  document.getElementById('preview-pecah').innerHTML = 
    `<strong>${dipilih}</strong> santri akan dipindah dari <strong>${pecahState.asal}</strong> ke <strong>${tujuan}</strong>.<br>Sisa di ${pecahState.asal}: <strong>${sisa}</strong>.`;
}

/**
 * Eksekusi Pindah Halaqah ke Google Sheets via API
 */
async function prosesPecahHalaqah() {
  const asal = document.getElementById('select-asal').value;
  const tujuan = document.getElementById('select-tujuan').value;
  const ids = Array.from(pecahState.selectedIds);

  if (!tujuan) { showToastBaru('Pilih halaqah tujuan!', 'error'); return; }
  if (ids.length === 0) { showToastBaru('Pilih minimal 1 santri!', 'error'); return; }
  if (asal === tujuan) { showToastBaru('Asal dan tujuan tidak boleh sama!', 'error'); return; }

  if (!confirm(`Yakin ingin memindahkan ${ids.length} santri dari ${asal} ke ${tujuan}?`)) return;

  const btn = document.getElementById('btn-confirm-pecah');
  btn.disabled = true;
  btn.innerHTML = 'Memproses...';

  // Simpan state untuk Undo
  undoState.santriBackup = masterSantri.filter(s => ids.includes(s.id)).map(s => ({...s}));
  undoState.isAvailable = true;

  try {
    // Loop memanggil API updateSantri
    for (const id of ids) {
      const santri = masterSantri.find(s => s.id === id);
      if (santri) {
        await window.dataSdk.updateSantri({
          id: santri.id,
          nama: santri.nama,
          kelas: santri.kelas,
          halaqah: tujuan,
          foto: santri.foto,
          status: 'Aktif'
        });
      }
    }

    showToastBaru(`Berhasil memindah ${ids.length} santri ke ${tujuan}`, 'success');
    document.getElementById('btn-close-pecah').click();
    showUndoToast(); // Tampilkan tombol Undo

  } catch (err) {
    console.error(err);
    showToastBaru('Gagal memindahkan santri. Cek koneksi.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Konfirmasi Pindah';
  }
}

/**
 * Undo Pindah Halaqah
 */
function showUndoToast() {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast bg-stone-800 text-white flex justify-between items-center gap-4`;
  toast.innerHTML = `
    <span>Data berhasil diubah.</span>
    <button onclick="undoPecahHalaqah()" class="bg-white text-black px-2 py-1 rounded text-xs font-bold">Undo</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 10000); // 10 detik undo
}

window.undoPecahHalaqah = async function() {
  if (!undoState.isAvailable || undoState.santriBackup.length === 0) return;
  if (!confirm('Kembalikan data ke halaqah sebelumnya?')) return;

  try {
    for (const santri of undoState.santriBackup) {
      await window.dataSdk.updateSantri({
        id: santri.id, nama: santri.nama, kelas: santri.kelas,
        halaqah: santri.halaqah, foto: santri.foto, status: santri.status
      });
    }
    showToastBaru('Berhasil dikembalikan (Undo).', 'success');
    undoState.isAvailable = false;
  } catch (err) {
    showToastBaru('Undo gagal.', 'error');
  }
};

/**
 * ==========================================
 * FITUR 2: RIWAYAT SETORAN
 * ==========================================
 */
function getRiwayatSetoran(namaSantri, limit = 5) {
  // Filter dari variabel global records (Database)
  return records
    .filter(r => r.nama_santri === namaSantri && r.tipe === 'setoran_kehadiran')
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
    .slice(0, limit);
}

function renderPanelRiwayat(namaSantri) {
  const panel = document.getElementById('panel-riwayat');
  const list = document.getElementById('list-riwayat');
  const btnSalin = document.getElementById('btn-salin-riwayat');
  
  if (!panel) return;
  const riwayat = getRiwayatSetoran(namaSantri);
  
  panel.classList.remove('hidden');
  
  if (riwayat.length === 0) {
    list.innerHTML = '<li class="text-stone-500 italic">Belum ada setoran.</li>';
    btnSalin.classList.add('hidden');
    return;
  }

  btnSalin.classList.remove('hidden');
  btnSalin.onclick = () => prefillDariSetoranTerakhir(riwayat[0]);

  list.innerHTML = riwayat.map(r => {
    const kat = String(r.evaluasi).includes('[Ziyadah]') ? 'Ziyadah' : 'Murojaah';
    const color = kat === 'Ziyadah' ? 'text-emerald-600' : 'text-indigo-600';
    return `
    <li class="border-b border-stone-200 pb-1 mb-1">
      <span class="font-bold text-stone-700">${new Date(r.tanggal).toLocaleDateString('id-ID')}</span> | 
      <span class="uppercase text-xs font-bold ${color}">${kat}</span> | 
      Juz ${r.juz} Hal/Ayat ${r.surah}:${r.ayat} | Nilai: ${r.status || '-'}
      ${r.evaluasi && r.evaluasi.replace(/\[(Ziyadah|Murojaah)\]\s*/, '') ? `<br><span class="text-stone-500 italic">"${r.evaluasi.replace(/\[(Ziyadah|Murojaah)\]\s*/, '')}"</span>` : ''}
    </li>
  `}).join('');
}

function prefillDariSetoranTerakhir(last) {
  // Asumsi ID elemen form di app.js
  const isZiyadah = String(last.evaluasi).includes('[Ziyadah]');
  
  if (document.getElementById('f-juz') && last.juz) {
    document.getElementById('f-juz').value = last.juz;
    document.getElementById('f-juz').dispatchEvent(new Event('change')); // trigger populate surah
  }
  
  if (document.getElementById('f-kategori-quran')) {
    document.getElementById('f-kategori-quran').value = isZiyadah ? 'Ziyadah' : 'Murojaah';
  }
  
  // Fokus ke input ayat/halaman
  const targetFocus = document.getElementById('f-ayat') || document.getElementById('f-halaman-iqra');
  if (targetFocus) {
    targetFocus.value = '';
    targetFocus.focus();
  }
  
  showToastBaru('Disalin dari setoran terakhir. Silakan ubah ayat/halaman.');
}

/**
 * ==========================================
 * FITUR 3: MIGRASI SKENARIO
 * ==========================================
 */
async function jalankanMigrasiSkenario() {
  if (!confirm('Yakin ingin menjalankan Migrasi Skenario?\n\nLangkah 1: Semua santri Ibrahim pindah ke Ilham.\nLangkah 2: Pilih 16 santri Isyaka pindah ke Ibrahim.')) return;

  const btn = document.getElementById('btn-migrasi');
  btn.disabled = true;
  btn.innerHTML = 'Memproses Langkah 1...';

  try {
    // LANGKAH 1: Ibrahim -> Ilham
    const santriIbrahim = masterSantri.filter(s => s.halaqah === 'Ibrahim' && s.status === 'Aktif');
    
    if (santriIbrahim.length === 0) {
      showToastBaru('Tidak ada santri di halaqah Ibrahim.', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Migrasi Skenario';
      return;
    }

    // Simpan untuk undo
    undoState.santriBackup = santriIbrahim.map(s => ({...s}));
    undoState.isAvailable = true;

    for (const santri of santriIbrahim) {
      await window.dataSdk.updateSantri({
        id: santri.id, nama: santri.nama, kelas: santri.kelas,
        halaqah: 'Ilham', foto: santri.foto, status: 'Aktif'
      });
    }

    showToastBaru(`Langkah 1 Selesai: ${santriIbrahim.length} santri Ibrahim dipindah ke Ilham.`);
    
    // LANGKAH 2: Buka Modal Pecah
    btn.disabled = false;
    btn.innerHTML = 'Migrasi Skenario (Isyaka/Ibrahim)';
    
    // Buka modal dengan preset Isyaka -> Ibrahim
    openPecahModal('Isyaka', 'Ibrahim');
    
    // Tambahkan info bahwa ini bagian dari migrasi
    document.getElementById('modal-pecah-title').innerHTML = 'Langkah 2: Pilih 16 Santri Isyaka &rarr; Ibrahim';

  } catch (err) {
    console.error(err);
    showToastBaru('Migrasi Gagal di Langkah 1.', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Migrasi Skenario';
  }
}

/**
 * ==========================================
 * INISIALISASI EVENT LISTENER
 * ==========================================
 */
document.addEventListener('DOMContentLoaded', () => {
  // Tombol Utama
  const btnPecah = document.getElementById('btn-pecah-halaqah');
  const btnMigrasi = document.getElementById('btn-migrasi');
  
  if (btnPecah) btnPecah.addEventListener('click', () => openPecahModal());
  if (btnMigrasi) btnMigrasi.addEventListener('click', jalankanMigrasiSkenario);
  
  // Modal Events
  const btnClose = document.getElementById('btn-close-pecah');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      document.getElementById('modal-pecah').classList.add('hidden');
      document.getElementById('modal-pecah').classList.remove('flex');
      document.getElementById('modal-pecah-title').innerHTML = 'Pecah / Pindah Halaqah'; // Reset title
    });
  }

  const selAsal = document.getElementById('select-asal');
  if (selAsal) selAsal.addEventListener('change', (e) => loadSantriPecah(e.target.value));
  
  const selTujuan = document.getElementById('select-tujuan');
  if (selTujuan) selTujuan.addEventListener('change', updatePreviewPecah);
  
  const search = document.getElementById('search-santri-pecah');
  if (search) search.addEventListener('input', renderSantriPecah);
  
  const btnSelectAll = document.getElementById('btn-select-all');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      const isAllSelected = pecahState.selectedIds.size === pecahState.allSantri.length;
      pecahState.selectedIds.clear();
      if (!isAllSelected) {
        pecahState.allSantri.forEach(s => pecahState.selectedIds.add(s.id));
      }
      renderSantriPecah();
    });
  }

  const btnConfirm = document.getElementById('btn-confirm-pecah');
  if (btnConfirm) btnConfirm.addEventListener('click', prosesPecahHalaqah);
});

// Hook ke fungsi openSetoran di app.js agar panel riwayat muncul
// (Tempelkan ini di akhir app.js jika ingin otomatis terpanggil)
const originalOpenSetoran = window.openSetoran;
if (originalOpenSetoran) {
  window.openSetoran = function(student) {
    originalOpenSetoran(student);
    renderPanelRiwayat(student.nama);
  };
}