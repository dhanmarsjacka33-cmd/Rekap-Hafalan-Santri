// ============================================================
// KONFIGURASI GLOBAL
// ============================================================
// Ganti dengan URL deployment Apps Script Anda
// (yang berakhiran /exec)
window.APP_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzN7HX2xctDHUxYYHlh7DG2J-VZLoxJYm8rlWrNfjRc1pNXeL4qXd4WlxxTcb7uLw_fGw/exec',
  appName: 'Rekap Hafalan Santri',
  version: '2.0.0'
};

// Global state (diakses oleh app.js & api.js)
let records = [];
let masterSantri = [];
let masterHalaqah = [];

// Flag debugging
window.DEBUG = false;