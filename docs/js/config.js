// ============================================================
// KONFIGURASI GLOBAL
// ============================================================
// Ganti dengan URL deployment Apps Script Anda
// (yang berakhiran /exec)
window.APP_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzd0nAN62cpSg2HAhVtrbKQEQYZ_-TXRl9ABTQTnqo1Rhs3FEVaciMLvikUdnKV0l_dLg/exec',
  appName: 'Rekap Hafalan Santri',
  version: '2.0.0'
};

// Global state (diakses oleh app.js & api.js)
let records = [];
let masterSantri = [];
let masterHalaqah = [];

// Flag debugging
window.DEBUG = false;