// =============================================================================
//  peta-kapal.js — LATAR PETA PERAIRAN INDONESIA DENGAN KAPAL AIS & OCEAN CRIME
//
//  Gayanya seperti peta lalu lintas kapal (AIS): peta dilihat dari atas, ratusan
//  ikon kapal berwarna menurut jenisnya, dan semuanya terus berlayar tanpa berhenti.
//  Beberapa kapal sedang melakukan pelanggaran (ocean crime) dan ditandai merah:
//     LOITERING, TRANSSHIPMENT, GO DARK, SPOOFING, ILLEGAL FISHING.
//
//  Layar 0 (Welcome)          : peta jauh, seluruh kawasan Indonesia terlihat.
//  Layar 1 (Login)            : peta MENDEKAT (zoom in) ke perairan Indonesia, kapal membesar.
//  Layar 2 (Choose Your Path) : tetap di tampilan dekat.
//
//  Diadaptasi dari desain UI/UX "homepage-peta-terbaru" (versi Streamlit) untuk index.html.
//  index.html mengirim pengaturan lewat atribut data-... pada <div id="peta-kapal">:
//     data-layar  : 0 / 1 / 2, diubah oleh showScreen() setiap kali layar berganti
//     data-bahasa : en / id, diubah oleh setLanguage()
//  Skrip ini MENGAMATI atribut tersebut (MutationObserver), jadi peta ikut berganti
//  tanpa memuat ulang halaman. Kamera berpindah mulus dari pandangan lama ke yang baru.
//  Gaya peta bisa dipilih lewat alamat: index.html?peta=gelap | peta | satelit (bawaan: gelap).
//
//  Semua kapal dan pelanggarannya adalah SIMULASI untuk tampilan (latar sebelum login),
//  bukan data AIS sungguhan. Legenda di index.html menuliskannya dengan jelas.
//  Data asli tetap hanya ada di dashboard.html (di balik login).
// =============================================================================

(() => {
"use strict";

// ---------------------------------------------------------------------------
// 1. PENGATURAN DARI PYTHON
// ---------------------------------------------------------------------------
const wadah = document.getElementById("peta-kapal");
if (!wadah) return;                                       // halaman tanpa latar peta: tidak melakukan apa-apa
const bacaLayar = () => { const n = Number(wadah.dataset.layar); return n === 1 || n === 2 ? n : 0; };
const bacaBahasa = () => (wadah.dataset.bahasa === "id" ? "id" : "en");
let LAYAR = bacaLayar();
// Dibuka langsung di Login/Menu (misalnya kembali dari dashboard lewat index.html#menu): jangan putar zoom lagi
let SUDAH_ZOOM = LAYAR !== 0;
let BAHASA = bacaBahasa();
const GERAK_HALUS = !matchMedia("(prefers-reduced-motion: reduce)").matches;

// Suasana: "" = ikut jam WIB. Malam memakai peta gelap.
function suasanaSekarang() {
  const s = (wadah.dataset.suasana || "").toLowerCase();
  if (["pagi", "siang", "sore", "senja", "malam"].includes(s)) return s;
  const jam = (new Date().getUTCHours() + 7) % 24;          // WIB = UTC+7
  if (jam >= 5 && jam < 10) return "pagi";
  if (jam >= 10 && jam < 15) return "siang";
  if (jam >= 15 && jam < 17) return "sore";
  if (jam >= 17 && jam < 19) return "senja";
  return "malam";
}
const SUASANA = suasanaSekarang();

// ---------------------------------------------------------------------------
// 2. GAYA PETA (sumber gambar peta / "ubin" peta)
// ---------------------------------------------------------------------------
const ESRI = (layanan) => (z, x, y) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${layanan}/MapServer/tile/${z}/${y}/${x}`;
const GAYA_PETA = {
  peta: {     // peta jalan biasa, mirip Google Maps
    url: ESRI("World_Street_Map"),
    laut: "#a5bfdd", grid: "rgba(40,90,120,.10)", garisKapal: "rgba(20,30,40,.7)",
    atribusi: "Map © Esri, HERE, Garmin, © OpenStreetMap contributors",
  },
  gelap: {    // peta malam
    url: ESRI("Canvas/World_Dark_Gray_Base"),
    laut: "#262a2e", grid: "rgba(140,190,230,.07)", garisKapal: "rgba(0,0,0,.75)",
    atribusi: "Map © Esri, HERE, Garmin, © OpenStreetMap contributors",
  },
  satelit: {  // foto satelit, mirip Google Earth
    url: ESRI("World_Imagery"),
    laut: "#0b2a45", grid: "rgba(160,210,255,.07)", garisKapal: "rgba(0,0,0,.75)",
    atribusi: "Imagery © Esri, Maxar, Earthstar Geographics",
  },
};
const gayaDiminta = wadah.dataset.gaya || new URLSearchParams(location.search).get("peta") || "";
const namaGaya = Object.prototype.hasOwnProperty.call(GAYA_PETA, gayaDiminta) ? gayaDiminta
  : (SUASANA === "malam" ? "gelap" : "peta");
const GAYA = GAYA_PETA[namaGaya];
const atribusi = document.getElementById("peta-atribusi");
if (atribusi) atribusi.textContent = GAYA.atribusi;

// Lapisan warna tipis sesuai suasana (pagi kekuningan, senja jingga)
const TINTA = { pagi: "rgba(255,214,160,.10)", siang: null, sore: "rgba(255,180,100,.10)",
                senja: "rgba(255,120,60,.18)", malam: "rgba(10,20,50,.15)" }[SUASANA];

// ---------------------------------------------------------------------------
// 3. PROYEKSI MERCATOR: (lintang, bujur) -> (u, v) antara 0 dan 1
//    Rumus yang sama dipakai Google Maps. u = kiri-kanan, v = atas-bawah.
// ---------------------------------------------------------------------------
const keUV = (lat, lon) => {
  const s = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
};
const DERAJAT = 1 / 360;                                  // 1 derajat bujur dalam satuan u

// ---------------------------------------------------------------------------
// 4. KANVAS
// ---------------------------------------------------------------------------
const kanvas = document.createElement("canvas");
kanvas.setAttribute("aria-hidden", "true");
const ctx = kanvas.getContext("2d");
if (!ctx) return;                                         // browser tanpa canvas 2D: latar gradasi CSS saja
wadah.appendChild(kanvas);
// Browser lama tanpa roundRect: pakai kotak biasa
if (typeof ctx.roundRect !== "function") ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
let W = 1, H = 1, DPR = 1;
function ukurUlang() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = wadah.clientWidth || innerWidth;
  H = wadah.clientHeight || innerHeight;
  kanvas.width = Math.round(W * DPR);
  kanvas.height = Math.round(H * DPR);
  kanvas.style.width = W + "px";
  kanvas.style.height = H + "px";
}
addEventListener("resize", ukurUlang);
ukurUlang();

// ---------------------------------------------------------------------------
// 5. KAMERA: titik tengah (u, v) + tingkat zoom z
//    Lebar pandang ditulis dalam derajat bujur supaya pas di layar besar maupun kecil.
// ---------------------------------------------------------------------------
function kamera(lat, lon, lebarDerajat) {
  const [u, v] = keUV(lat, lon);
  const lebar = Math.max(lebarDerajat * Math.max(1, 900 / W) ** 0.6, lebarDerajat);
  return { u, v, z: Math.log2(W / (256 * lebar * DERAJAT)) };
}
const pandangJauh = () => kamera(-1.5, 113.5, 62);      // Welcome: seluruh Indonesia
const pandangDekat = () => kamera(0.2, 111.0, 27);      // Login & menu: perairan Indonesia lebih dekat

const LEBAR_IKUTI = 3.2;                                 // lebar pandangan (derajat) saat mengikuti kapal
const LAMA_ZOOM = 6.5;                                 // detik animasi zoom in saat Login
const JEDA_ZOOM = 0.5;
const mulusan = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// Seberapa jauh animasi zoom Login sudah berjalan: 0 = belum, 1 = selesai
let mulaiLayar = 0;                                       // detik saat layar sekarang dibuka
function progresZoom(t) {
  if (LAYAR !== 1) return 0;
  if (SUDAH_ZOOM || !GERAK_HALUS) return 1;
  const p = Math.min(1, Math.max(0, (t - mulaiLayar - JEDA_ZOOM) / LAMA_ZOOM));
  if (p >= 1) SUDAH_ZOOM = true;                          // zoom cukup diputar sekali per kunjungan
  return mulusan(p);
}

// Tempat kapal utama di layar setelah zoom: di tengah-kiri, tidak tertutup kotak login
const tempatKapalDiLayar = () => (W < 900 ? [W * 0.5, H * 0.28] : [W * 0.42, H * 0.56]);

function kameraIkutiKapal(t) {
  // Kamera ZOOM IN mengarah ke kapal loitering, lalu MENGIKUTINYA:
  // kapal tetap di tempat yang sama di layar, petanya yang bergeser (seperti video peta TikTok).
  const jauh = pandangJauh();
  const zDekat = kamera(LOITER_LAT, LOITER_LON, LEBAR_IKUTI).z;
  const p = progresZoom(t);
  const [ku, kv] = posisiLoiter(t);
  const z = jauh.z + (zDekat - jauh.z) * p;
  // posisi kapal di layar saat masih jauh, lalu digeser pelan ke tempat akhirnya
  const skalaJauh = 256 * Math.pow(2, jauh.z);
  const awalX = (ku - jauh.u) * skalaJauh + W / 2, awalY = (kv - jauh.v) * skalaJauh + H / 2;
  const [akhirX, akhirY] = tempatKapalDiLayar();
  const sx = awalX + (akhirX - awalX) * p, sy = awalY + (akhirY - awalY) * p;
  const skala = 256 * Math.pow(2, z);
  return { u: ku - (sx - W / 2) / skala, v: kv - (sy - H / 2) / skala, z };
}

// Perpindahan kamera yang mulus saat layar berganti (index.html tidak memuat ulang halaman)
const LAMA_PINDAH = 1.6;
let kameraAwal = null, mulaiPindah = 0;
function kameraPada(t) {
  const tujuan = kameraTujuan(t);
  if (!kameraAwal || !GERAK_HALUS) return tujuan;
  const p = (t - mulaiPindah) / LAMA_PINDAH;
  if (p >= 1) { kameraAwal = null; return tujuan; }
  const m = mulusan(Math.max(0, p));
  return { u: kameraAwal.u + (tujuan.u - kameraAwal.u) * m, v: kameraAwal.v + (tujuan.v - kameraAwal.v) * m,
           z: kameraAwal.z + (tujuan.z - kameraAwal.z) * m };
}
function kameraTujuan(t) {
  if (LAYAR === 1) return kameraIkutiKapal(t);
  const k = LAYAR === 0 ? pandangJauh() : pandangDekat();
  // Kamera bergeser pelan sekali supaya peta terasa hidup
  const goyang = Math.pow(2, -(k.z - 4)) * 0.0011;
  k.u += Math.sin(t * 0.045) * goyang;
  k.v += Math.sin(t * 0.031 + 1) * goyang * 0.6;
  return k;
}

// Mengubah posisi (u, v) menjadi titik di layar (piksel)
let KAM = pandangJauh();
const keLayar = (u, v) => {
  const skala = 256 * Math.pow(2, KAM.z);
  return [(u - KAM.u) * skala + W / 2, (v - KAM.v) * skala + H / 2];
};

// ---------------------------------------------------------------------------
// 6. UBIN PETA: gambar 256x256 yang disusun seperti keramik
// ---------------------------------------------------------------------------
const simpanan = new Map();
function ambilUbin(z, x, y) {
  const n = 1 << z;
  if (y < 0 || y >= n) return null;
  x = ((x % n) + n) % n;
  const kunci = z + "/" + x + "/" + y;
  let ubin = simpanan.get(kunci);
  if (!ubin) {
    const img = new Image();
    ubin = { img, siap: false };
    img.onload = () => { ubin.siap = true; };
    img.src = GAYA.url(z, x, y);
    simpanan.set(kunci, ubin);
    if (simpanan.size > 700) simpanan.delete(simpanan.keys().next().value);   // buang yang paling lama
  }
  return ubin;
}
function sudahAda(z, x, y) {
  const n = 1 << z;
  const u = simpanan.get(z + "/" + (((x % n) + n) % n) + "/" + y);
  return u && u.siap ? u : null;
}

function gambarPeta() {
  ctx.fillStyle = GAYA.laut;
  ctx.fillRect(0, 0, W, H);
  const tz = Math.max(2, Math.min(11, Math.round(KAM.z)));
  const skala = Math.pow(2, KAM.z - tz);
  const sisi = 256 * skala;
  const pusatX = KAM.u * 256 * (1 << tz), pusatY = KAM.v * 256 * (1 << tz);
  const kiri = pusatX - W / 2 / skala, atas = pusatY - H / 2 / skala;
  const x0 = Math.floor(kiri / 256), x1 = Math.floor((kiri + W / skala) / 256);
  const y0 = Math.floor(atas / 256), y1 = Math.floor((atas + H / skala) / 256);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const sx = (tx * 256 - kiri) * skala, sy = (ty * 256 - atas) * skala;
      const ubin = ambilUbin(tz, tx, ty);
      if (ubin && ubin.siap) {
        ctx.drawImage(ubin.img, sx, sy, sisi + 0.6, sisi + 0.6);
        continue;
      }
      // Belum termuat: pinjam ubin tingkat di atasnya (lebih buram) supaya tidak bolong
      for (let naik = 1; naik <= 3; naik++) {
        const induk = sudahAda(tz - naik, tx >> naik, ty >> naik);
        if (!induk) continue;
        const bagian = 256 >> naik, f = induk.img.naturalWidth / 256;
        const ox = (tx - ((tx >> naik) << naik)) * bagian, oy = (ty - ((ty >> naik) << naik)) * bagian;
        ctx.drawImage(induk.img, ox * f, oy * f, bagian * f, bagian * f, sx, sy, sisi + 0.6, sisi + 0.6);
        break;
      }
    }
  }
  if (TINTA) { ctx.fillStyle = TINTA; ctx.fillRect(0, 0, W, H); }

  // Garis lintang-bujur tipis (seperti peta navigasi). Saat zoom dekat, garisnya lebih rapat
  // supaya gerakan peta tetap terasa walaupun di tengah laut yang polos.
  const jarakGaris = KAM.z > 7 ? 0.5 : 5;
  ctx.strokeStyle = GAYA.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = 60; lon <= 170; lon += jarakGaris) {
    const [x] = keLayar((lon + 180) / 360, 0);
    if (x > -2 && x < W + 2) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  }
  for (let lat = -40; lat <= 40; lat += jarakGaris) {
    const [, y] = keLayar(0, keUV(lat, 0)[1]);
    if (y > -2 && y < H + 2) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  }
  ctx.stroke();
}

// Muat lebih dulu ubin untuk tampilan dekat, supaya zoom in langsung tajam
function muatLebihDulu() {
  // Login: daerah kapal loitering (ditambah ruang untuk kapal berputar). Lainnya: tampilan dekat.
  const k = LAYAR === 1 ? kamera(LOITER_LAT, LOITER_LON, LEBAR_IKUTI) : pandangDekat();
  if (LAYAR === 1) [k.u, k.v] = keUV(LOITER_LAT, LOITER_LON);
  const tz = Math.max(2, Math.min(11, Math.round(k.z)));
  const n = 1 << tz, cx = k.u * n, cy = k.v * n, rx = W / 256 + 1.5, ry = H / 256 + 1.5;
  for (let y = Math.floor(cy - ry); y <= Math.floor(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.floor(cx + rx); x++) ambilUbin(tz, x, y);
}

// ---------------------------------------------------------------------------
// 7. JENIS KAPAL (warna seperti peta AIS pada umumnya)
// ---------------------------------------------------------------------------
const JENIS = {
  kargo:     { warna: "#8cc63f", ukuran: 1.0,  laju: [0.17, 0.24] },
  tanker:    { warna: "#e8443a", ukuran: 1.05, laju: [0.14, 0.2] },
  penumpang: { warna: "#2f6fe4", ukuran: 0.95, laju: [0.24, 0.32] },
  ikan:      { warna: "#f28b82", ukuran: 0.72, laju: [0.06, 0.1] },
  tunda:     { warna: "#22c3d6", ukuran: 0.68, laju: [0.14, 0.2] },
  wisata:    { warna: "#d946ef", ukuran: 0.66, laju: [0.18, 0.26] },
  lainnya:   { warna: "#9aa4ad", ukuran: 0.85, laju: [0.14, 0.2] },
};
const acak = (a, b) => a + Math.random() * (b - a);
const pilih = (daftar) => daftar[Math.floor(Math.random() * daftar.length)];

// ---------------------------------------------------------------------------
// 8. JALUR PELAYARAN (titik [lintang, bujur, lebar jalur dalam derajat])
//    Semua titik ada di laut. Kapal berlayar di sisi kanan jalur, seperti
//    aturan lalu lintas laut, jadi kapal yang berpapasan tidak saling tembus.
// ---------------------------------------------------------------------------
const JALUR = [
  // Selat Malaka -> Singapura -> Laut Cina Selatan -> Hong Kong
  { jenis: ["kargo", "kargo", "tanker", "tanker", "lainnya"], jumlah: 26, titik: [
    [5.8, 80.0, 0.8], [5.9, 88.0, 0.8], [6.2, 94.6, 0.5], [5.9, 96.6, 0.5], [5.0, 98.8, 0.35], [3.6, 100.0, 0.3],
    [2.5, 101.3, 0.22], [1.8, 102.5, 0.14], [1.38, 103.25, 0.08], [1.2, 103.75, 0.05], [1.29, 104.05, 0.05],
    [1.25, 104.3, 0.06], [1.45, 104.7, 0.12], [3.0, 105.4, 0.3], [6.0, 106.0, 0.5], [9.0, 107.5, 0.5],
    [12.0, 110.0, 0.5], [16.0, 110.6, 0.5], [20.5, 113.5, 0.4], [22.0, 114.6, 0.2]] },
  // Laut Cina Selatan -> Filipina / Jepang
  { jenis: ["kargo", "tanker", "kargo"], jumlah: 10, titik: [
    [1.45, 104.7, 0.12], [3.0, 105.4, 0.3], [6.0, 106.0, 0.5], [8.0, 110.0, 0.6], [10.0, 114.0, 0.6], [13.5, 119.5, 0.5]] },
  // Singapura -> Selat Karimata -> Laut Jawa -> Selat Lombok -> Australia
  { jenis: ["kargo", "tanker", "kargo", "lainnya"], jumlah: 18, titik: [
    [1.45, 104.7, 0.1], [0.5, 105.15, 0.2], [-1.2, 106.2, 0.25], [-2.2, 107.0, 0.2], [-3.2, 107.2, 0.25],
    [-4.6, 108.2, 0.4], [-5.2, 110.5, 0.4], [-5.4, 113.0, 0.4], [-6.2, 115.4, 0.3], [-7.6, 115.85, 0.12],
    [-8.55, 115.8, 0.08], [-9.2, 115.75, 0.15], [-12.5, 115.5, 0.5], [-19.5, 115.5, 0.5]] },
  // Selat Sunda -> Samudra Hindia barat Sumatra -> Laut Andaman
  { jenis: ["kargo", "tanker", "lainnya"], jumlah: 12, titik: [
    [-3.2, 107.2, 0.2], [-5.0, 106.0, 0.2], [-5.85, 105.9, 0.04], [-6.3, 105.6, 0.08], [-6.9, 104.9, 0.2],
    [-8.0, 104.0, 0.5], [-5.5, 99.5, 0.6], [-1.0, 96.5, 0.6], [3.5, 94.8, 0.5], [6.2, 94.6, 0.4]] },
  // Selatan Jawa: Selat Sunda -> Selat Lombok
  { jenis: ["kargo", "tanker"], jumlah: 8, titik: [
    [-6.9, 104.9, 0.15], [-8.0, 104.0, 0.4], [-9.5, 108.0, 0.5], [-9.6, 112.0, 0.5], [-9.2, 115.75, 0.2]] },
  // Laut Jawa -> Selat Makassar -> Laut Sulawesi -> Samudra Pasifik
  { jenis: ["kargo", "tanker", "kargo", "lainnya"], jumlah: 14, titik: [
    [-6.2, 115.4, 0.3], [-4.8, 117.2, 0.4], [-2.5, 117.8, 0.3], [-0.5, 118.6, 0.3], [1.1, 119.45, 0.18],
    [3.0, 120.8, 0.5], [4.2, 123.5, 0.5], [5.2, 126.3, 0.25], [7.5, 129.0, 0.5], [12.0, 130.0, 0.5]] },
  // Laut Flores -> Laut Banda -> Laut Arafura
  { jenis: ["kargo", "tanker", "ikan"], jumlah: 10, titik: [
    [-4.8, 117.2, 0.3], [-6.8, 120.0, 0.25], [-6.8, 124.2, 0.4], [-6.4, 128.0, 0.3], [-5.9, 130.6, 0.2],
    [-6.3, 132.0, 0.15], [-7.8, 133.4, 0.3], [-9.8, 136.5, 0.5], [-10.3, 140.5, 0.4]] },
  // ---- Pelayaran dalam negeri (antar pelabuhan) ----
  { jenis: ["kargo", "penumpang", "tunda", "kargo"], jumlah: 9, titik: [         // Jakarta -> Surabaya
    [-5.95, 106.85, 0.05], [-5.6, 108.5, 0.2], [-5.8, 111.0, 0.2], [-6.55, 112.4, 0.1], [-6.75, 112.55, 0.04]] },
  { jenis: ["kargo", "penumpang", "kargo"], jumlah: 6, titik: [                  // Surabaya -> Makassar
    [-6.75, 112.6, 0.04], [-6.3, 113.5, 0.15], [-5.6, 116.5, 0.25], [-5.15, 119.25, 0.04]] },
  { jenis: ["kargo", "penumpang", "tunda"], jumlah: 5, titik: [                  // Jakarta -> Pontianak
    [-5.95, 106.85, 0.05], [-4.5, 107.4, 0.15], [-2.2, 108.1, 0.15], [-0.3, 108.9, 0.08], [-0.1, 108.98, 0.03]] },
  { jenis: ["kargo", "tunda", "tanker"], jumlah: 4, titik: [                     // Surabaya -> Banjarmasin
    [-6.75, 112.6, 0.04], [-5.0, 113.8, 0.15], [-3.85, 114.45, 0.04]] },
  { jenis: ["kargo", "tanker", "penumpang"], jumlah: 4, titik: [                 // Makassar -> Balikpapan
    [-5.15, 119.25, 0.04], [-3.6, 118.4, 0.15], [-1.45, 117.2, 0.04]] },
  { jenis: ["penumpang"], jumlah: 3, titik: [[-8.55, 115.55, 0.02], [-8.7, 115.98, 0.02]] },     // Bali -> Lombok
  { jenis: ["penumpang"], jumlah: 3, titik: [[-5.93, 105.97, 0.01], [-5.86, 105.77, 0.01]] },    // Merak -> Bakauheni
  { jenis: ["wisata", "penumpang", "tunda"], jumlah: 4, titik: [[1.2, 104.05, 0.02], [1.05, 104.2, 0.02], [0.92, 104.42, 0.02]] }, // Batam -> Bintan
];

// Menghaluskan sudut jalur (cara Chaikin): setiap sudut dipotong menjadi lengkungan
function haluskan(titik, ulang = 3) {
  let p = titik;
  for (let i = 0; i < ulang; i++) {
    const baru = [p[0]];
    for (let j = 0; j < p.length - 1; j++) {
      const a = p[j], b = p[j + 1];
      baru.push(a.map((n, k) => n * 0.75 + b[k] * 0.25), a.map((n, k) => n * 0.25 + b[k] * 0.75));
    }
    baru.push(p[p.length - 1]);
    p = baru;
  }
  return p;
}

function siapkanJalur(titikLatLon) {
  const titik = haluskan(titikLatLon.map(([lat, lon, lebar]) => [...keUV(lat, lon), lebar * DERAJAT]));
  const jarak = [0];
  for (let i = 1; i < titik.length; i++) {
    jarak.push(jarak[i - 1] + Math.hypot(titik[i][0] - titik[i - 1][0], titik[i][1] - titik[i - 1][1]));
  }
  return { titik, jarak, panjang: jarak[jarak.length - 1] };
}

// Posisi dan arah pada jarak s di sepanjang jalur
function titikPada(jalur, s) {
  const { titik, jarak } = jalur;
  let kiri = 0, kanan = jarak.length - 1;
  while (kanan - kiri > 1) { const m = (kiri + kanan) >> 1; if (jarak[m] <= s) kiri = m; else kanan = m; }
  const a = titik[kiri], b = titik[kanan];
  const f = Math.min(1, Math.max(0, (s - jarak[kiri]) / ((jarak[kanan] - jarak[kiri]) || 1)));
  const du = b[0] - a[0], dv = b[1] - a[1], d = Math.hypot(du, dv) || 1;
  return { u: a[0] + du * f, v: a[1] + dv * f, lebar: a[2] + (b[2] - a[2]) * f, au: du / d, av: dv / d };
}

// ---------------------------------------------------------------------------
// 9. MEMBUAT SEMUA KAPAL
// ---------------------------------------------------------------------------
const kapal = [];

// 9a. Kapal yang berlayar di jalur
for (const j of JALUR) {
  const jalur = siapkanJalur(j.titik);
  for (let i = 0; i < j.jumlah; i++) {
    const jenis = pilih(j.jenis);
    const arah = Math.random() < 0.5 ? 1 : -1;
    kapal.push({
      macam: "jalur", jenis, jalur, arah,
      s: Math.random() * jalur.panjang,
      laju: acak(...JENIS[jenis].laju) * DERAJAT,
      sisi: acak(0.2, 0.95),                         // seberapa jauh dari garis tengah jalur
      u: 0, v: 0, sudut: 0, alfa: 1,
    });
  }
}

// 9b. Kapal ikan yang berkeliaran di daerah penangkapan
const DAERAH_IKAN = [
  [-5.3, 107.8], [-5.0, 110.0], [-4.3, 112.0], [-6.5, 114.3], [-2.0, 109.3], [3.4, 100.7], [4.5, 106.9],
  [-3.3, 117.6], [-7.2, 122.5], [-9.0, 134.0], [2.0, 120.5], [-9.3, 122.5], [-4.6, 107.6],
  [5.4, 108.2], [4.1, 109.7],                    // kapal ikan lain di sekitar kapal loitering (Natuna)
];
for (const [lat, lon] of DAERAH_IKAN) {
  const [cu, cv] = keUV(lat, lon);
  const banyak = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < banyak; i++) {
    kapal.push({
      macam: "keliling", jenis: Math.random() < 0.8 ? "ikan" : "lainnya",
      cu, cv, jari: acak(0.08, 0.25) * DERAJAT,
      fa: acak(0, 6.28), fb: acak(0, 6.28), wa: acak(0.02, 0.05) * (Math.random() < 0.5 ? 1 : -1), wb: acak(0.03, 0.07),
      u: cu, v: cv, sudut: 0, alfa: 1,
    });
  }
}

// 9c. Kapal yang lego jangkar di dekat pelabuhan (ikon belah ketupat)
const LABUH = [
  [-5.98, 106.85, 0.08, 9], [-6.72, 112.58, 0.05, 6], [1.24, 104.0, 0.025, 5], [1.32, 104.55, 0.04, 6],
  [-5.1, 119.27, 0.04, 4], [-1.42, 117.1, 0.05, 4], [-0.05, 108.95, 0.03, 3], [-3.9, 114.45, 0.04, 3],
];
for (const [lat, lon, r, n] of LABUH) {
  for (let i = 0; i < n; i++) {
    const [u, v] = keUV(lat + acak(-r, r) * 0.6, lon + acak(-r, r));
    kapal.push({ macam: "labuh", jenis: pilih(["kargo", "tanker", "kargo", "tunda"]), u, v,
                 sudut: acak(0, 6.28), putar: acak(-0.02, 0.02), alfa: 1 });
  }
}

// 9d. Rambu navigasi (lingkaran kecil) di selat-selat sibuk
const RAMBU = [[1.22, 103.7], [1.3, 104.25], [2.3, 101.6], [-5.92, 105.86], [-8.6, 115.8], [-6.0, 106.8],
               [-6.8, 112.6], [3.1, 100.6], [-1.3, 117.0], [-5.2, 119.3]].map(([a, b]) => keUV(a, b));

// ---------------------------------------------------------------------------
// 10. OCEAN CRIME (kapal pelanggar yang diberi tanda merah)
// ---------------------------------------------------------------------------
const SEMUA_TEKS = {
  en: {
    LOITERING: "Circling inside Natuna EEZ", TRANSSHIPMENT: "Ship-to-ship transfer at sea",
    "GO DARK": "AIS switched off", SPOOFING: "Fake AIS position", "ILLEGAL FISHING": "Foreign vessels in no-take zone",
    zona: "NO-TAKE ZONE", palsu: "fake position",
    kapalAsing: "Foreign fishing vessel · Natuna EEZ",
    durasi: (j, m, kn) => `Circling for ${j}h ${m}m · ${kn} kn`,
  },
  id: {
    LOITERING: "Berputar-putar di ZEE Natuna", TRANSSHIPMENT: "Bongkar muat di tengah laut",
    "GO DARK": "AIS dimatikan", SPOOFING: "Posisi AIS dipalsukan", "ILLEGAL FISHING": "Kapal asing di zona terlarang",
    zona: "ZONA TERLARANG", palsu: "posisi palsu",
    kapalAsing: "Kapal ikan asing · ZEE Natuna",
    durasi: (j, m, kn) => `Berputar ${j} jam ${m} mnt · ${kn} knot`,
  },
};
let TEKS = SEMUA_TEKS[BAHASA];

const kejahatan = [];       // daftar kejadian, masing-masing punya kapal dan label

// a) LOITERING: kapal ikan asing berputar-putar lama di ZEE Natuna.
//    Inilah kapal "utama" yang diikuti kamera saat Login (seperti mobil di video peta TikTok).
//    Jalurnya gabungan beberapa gerak melingkar, jadi bentuknya simpul-simpul tak beraturan
//    seperti jejak AIS kapal loitering sungguhan.
const LOITER_LAT = 4.65, LOITER_LON = 108.95;
const T_GESER = 140;                                 // supaya kapal tidak selalu mulai dari titik yang sama
function posisiLoiter(t) {
  t += T_GESER;
  const a = t * 0.21, b = t * 0.53 + 1.3, c = t * 0.027;
  const lat = LOITER_LAT + 0.17 * Math.sin(a) + 0.07 * Math.sin(b) + 0.10 * Math.sin(c);
  const lon = LOITER_LON + 0.20 * Math.cos(a) + 0.07 * Math.cos(b * 1.1) + 0.14 * Math.cos(c * 0.8 + 0.5);
  return keUV(lat, lon);
}
const kapalUtama = { macam: "loiter", jenis: "ikan", u: 0, v: 0, sudut: 0, alfa: 1, t: 0 };
const LAMA_JEJAK = 70;                               // garis merah = jalur 70 detik terakhir
kapal.push(kapalUtama);
kejahatan.push({ nama: "LOITERING", kapal: [kapalUtama], utama: true });

// b) TRANSSHIPMENT: kapal ikan merapat ke kapal pengangkut di tengah laut
function buatTransshipment(lat, lon, sudutArah) {
  const [cu, cv] = keUV(lat, lon);
  const besar = { macam: "hanyut", jenis: "kargo", cu, cv, geser: 0, ofs: 0, sudutTetap: sudutArah, u: cu, v: cv, sudut: sudutArah, alfa: 1, skala: 1.15 };
  const kecil = { macam: "hanyut", jenis: "ikan", cu, cv, geser: 0, ofs: 1, sudutTetap: sudutArah, u: cu, v: cv, sudut: sudutArah, alfa: 1 };
  kapal.push(besar, kecil);
  kejahatan.push({ nama: "TRANSSHIPMENT", kapal: [besar, kecil] });
}
buatTransshipment(-3.4, 109.3, 0.6);
buatTransshipment(-9.2, 135.2, -0.3);

// c) GO DARK: kapal mematikan AIS di tengah perjalanan, lalu muncul lagi jauh di depan
{
  const jalur = siapkanJalur([[-5.6, 113.5, 0], [-6.2, 116.5, 0], [-6.9, 119.5, 0]]);
  const k = { macam: "jalur", jenis: "kargo", jalur, arah: 1, s: jalur.panjang * 0.1, laju: 0.2 * DERAJAT, sisi: 0,
              u: 0, v: 0, sudut: 0, alfa: 1, gelap: [0.38, 0.72] };
  kapal.push(k);
  kejahatan.push({ nama: "GO DARK", kapal: [k] });
}

// d) SPOOFING: kapal mengirim posisi palsu (ikon bayangan yang berkedip di darat)
{
  const jalur = siapkanJalur([[3.6, 110.6, 0], [5.0, 112.0, 0], [6.6, 113.6, 0]]);
  const k = { macam: "jalur", jenis: "tanker", jalur, arah: 1, s: jalur.panjang * 0.3, laju: 0.15 * DERAJAT, sisi: 0,
              u: 0, v: 0, sudut: 0, alfa: 1 };
  // posisi palsu = posisi asli digeser 1,35 derajat ke selatan dan 0,9 derajat ke timur (masuk ke daratan)
  k.palsu = [0.9 * DERAJAT, keUV(-1.35, 0)[1] - keUV(0, 0)[1]];
  kapal.push(k);
  kejahatan.push({ nama: "SPOOFING", kapal: [k] });
}

// e) ILLEGAL FISHING: sekelompok kapal ikan asing di dalam zona terlarang
function buatZonaIkan(lat, lon, jari, banyak) {
  const [cu, cv] = keUV(lat, lon);
  const anggota = [];
  for (let i = 0; i < banyak; i++) {
    const k = { macam: "keliling", jenis: "ikan", cu, cv, jari: jari * acak(0.35, 0.75) * DERAJAT,
                fa: acak(0, 6.28), fb: acak(0, 6.28), wa: acak(0.03, 0.06) * (i % 2 ? 1 : -1), wb: acak(0.04, 0.08),
                u: cu, v: cv, sudut: 0, alfa: 1, merah: true };
    kapal.push(k); anggota.push(k);
  }
  kejahatan.push({ nama: "ILLEGAL FISHING", kapal: anggota, zona: { cu, cv, jari: jari * DERAJAT }, labelDiZona: true });
}
buatZonaIkan(6.2, 107.0, 0.55, 6);
buatZonaIkan(-8.6, 137.2, 0.6, 7);

// ---------------------------------------------------------------------------
// 11. MENGGERAKKAN KAPAL SETIAP BINGKAI
// ---------------------------------------------------------------------------
function gerakkan(k, t, dt) {
  if (k.macam === "jalur") {
    const j = k.jalur;
    k.s += k.laju * k.arah * dt;
    if (k.s > j.panjang) k.s -= j.panjang;
    if (k.s < 0) k.s += j.panjang;
    const p = titikPada(j, k.s);
    const tu = p.au * k.arah, tv = p.av * k.arah;            // arah berlayar
    const geser = k.sisi * p.lebar * 0.5;                    // ke sisi kanan jalur
    k.u = p.u - tv * geser;
    k.v = p.v + tu * geser;
    const sudutBaru = Math.atan2(tv, tu);
    k.sudut += sudutSelisih(sudutBaru, k.sudut) * Math.min(1, dt * 3);   // berbelok halus
    // memudar di ujung jalur (kapal "tiba" lalu muncul lagi di awal)
    const tepi = Math.min(k.s, j.panjang - k.s) / (0.6 * DERAJAT);
    k.alfa = Math.min(1, tepi);
  } else if (k.macam === "keliling") {
    const a = k.fa + t * k.wa, b = k.fb + t * k.wb;
    const nu = k.cu + k.jari * (Math.cos(a) * 0.8 + Math.sin(b * 1.7) * 0.2);
    const nv = k.cv + k.jari * (Math.sin(a) * 0.8 + Math.cos(b) * 0.2);
    if (Math.hypot(nu - k.u, nv - k.v) > 1e-9) k.sudut = Math.atan2(nv - k.v, nu - k.u);
    k.u = nu; k.v = nv;
  } else if (k.macam === "loiter") {
    [k.u, k.v] = posisiLoiter(t);
    const [u2, v2] = posisiLoiter(t + 0.3);
    k.sudut = Math.atan2(v2 - k.v, u2 - k.u);
    k.t = t;
  } else if (k.macam === "hanyut") {
    // dua kapal hanyut pelan berdampingan
    const maju = Math.sin(t * 0.05) * 0.12 * DERAJAT;
    const ca = Math.cos(k.sudutTetap), sa = Math.sin(k.sudutTetap);
    const samping = k.ofs * 0.045 * DERAJAT;
    k.u = k.cu + ca * maju - sa * samping;
    k.v = k.cv + sa * maju + ca * samping;
    k.sudut = k.sudutTetap + Math.sin(t * 0.4 + k.ofs) * 0.03;
  } else if (k.macam === "labuh") {
    k.sudut += k.putar * dt;
  }
}
function sudutSelisih(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// ---------------------------------------------------------------------------
// 12. MENGGAMBAR IKON KAPAL
//     Bergerak = panah runcing, lego jangkar = belah ketupat.
// ---------------------------------------------------------------------------
function ukuranIkon() {
  // Ikon membesar saat peta di-zoom in (Welcome kecil, Login lebih besar)
  return Math.max(4.2, Math.min(14, 5.2 * Math.pow(2.1, KAM.z - pandangJauh().z)));
}

function ikonKapal(x, y, sudut, warna, L, alfa, garis = GAYA.garisKapal) {
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.translate(x, y);
  ctx.rotate(sudut);
  ctx.beginPath();
  ctx.moveTo(L, 0);
  ctx.lineTo(-0.75 * L, 0.46 * L);
  ctx.lineTo(-0.48 * L, 0);
  ctx.lineTo(-0.75 * L, -0.46 * L);
  ctx.closePath();
  ctx.fillStyle = warna;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = garis;
  ctx.stroke();
  ctx.restore();
}
function ikonLabuh(x, y, sudut, warna, L, alfa) {
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.translate(x, y);
  ctx.rotate(sudut);
  const r = L * 0.5;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(-r, 0); ctx.lineTo(0, -r * 0.7);
  ctx.closePath();
  ctx.fillStyle = warna;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = GAYA.garisKapal;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 13. MENGGAMBAR TANDA OCEAN CRIME (cincin merah berdenyut + label)
// ---------------------------------------------------------------------------
const MERAH = "#ff2d2d";
function cincin(x, y, r, t, fase = 0) {
  const p = ((t * 0.7 + fase) % 1);
  ctx.save();
  ctx.strokeStyle = MERAH;
  ctx.globalAlpha = 0.9 * (1 - p);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r + p * r * 1.6, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function label(x, y, judul, keterangan, L) {
  const besar = L > 7.5;
  const f1 = besar ? 11 : 9, f2 = 10;
  ctx.save();
  ctx.font = `700 ${f1}px Inter, "Segoe UI", system-ui, sans-serif`;
  const lebar1 = ctx.measureText(judul).width;
  ctx.font = `500 ${f2}px Inter, "Segoe UI", system-ui, sans-serif`;
  const lebar2 = besar ? ctx.measureText(keterangan).width : 0;
  const pad = 6, lebarKotak = Math.max(lebar1, lebar2) + pad * 2 + 10, tinggi = besar ? 34 : 17;
  const bx = x + L * 1.6 + 8, by = y - L * 1.6 - tinggi;
  // garis penunjuk
  ctx.strokeStyle = "rgba(255,45,45,.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + L * 0.9, y - L * 0.9); ctx.lineTo(bx, by + tinggi); ctx.stroke();
  // kotak
  ctx.fillStyle = "rgba(12,16,24,.86)";
  ctx.beginPath(); ctx.roundRect(bx, by, lebarKotak, tinggi, 5); ctx.fill();
  ctx.fillStyle = MERAH;
  ctx.beginPath(); ctx.roundRect(bx, by, 4, tinggi, [5, 0, 0, 5]); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 12, by + (besar ? 11 : 8.5), 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${f1}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(judul, bx + 19, by + (besar ? 11 : 8.5));
  if (besar) {
    ctx.fillStyle = "rgba(225,235,245,.85)";
    ctx.font = `500 ${f2}px Inter, "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(keterangan, bx + 10, by + 25);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 13b. KAPAL UTAMA (loitering) — jejak merah + ikon besar, seperti mobil di video peta
// ---------------------------------------------------------------------------
function gambarJejak(k, tebal) {
  // Jalur kapal dihitung ulang dari rumusnya: posisi 70 detik lalu sampai sekarang
  const titik = [];
  for (let s = LAMA_JEJAK; s > 0; s -= 0.15) titik.push(keLayar(...posisiLoiter(k.t - s)));
  titik.push(keLayar(k.u, k.v));                         // sambung sampai posisi kapal sekarang
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const POTONG = 20;                                   // digambar per potongan: makin lama makin pudar
  for (let i = 0; i < titik.length - 1; i += POTONG) {
    const akhir = Math.min(titik.length - 1, i + POTONG);
    const umur = akhir / (titik.length - 1);             // 0 = paling lama, 1 = paling baru
    ctx.beginPath();
    ctx.moveTo(titik[i][0], titik[i][1]);
    for (let j = i + 1; j <= akhir; j++) ctx.lineTo(titik[j][0], titik[j][1]);
    ctx.globalAlpha = 0.04 + 0.96 * umur * umur * umur;
    ctx.strokeStyle = "rgba(255,255,255,.85)";           // garis tepi putih supaya kontras dengan peta
    ctx.lineWidth = tebal + 3;
    ctx.stroke();
    ctx.strokeStyle = "#e3262b";
    ctx.lineWidth = tebal;
    ctx.stroke();
  }
  ctx.restore();
}

function ikonKapalBesar(x, y, sudut, L, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sudut);
  // buih di belakang kapal (bentuk huruf V)
  ctx.strokeStyle = "rgba(255,255,255,.75)";
  ctx.lineWidth = 1.6;
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(-0.95 * L, 0.18 * L * s);
    ctx.quadraticCurveTo(-1.5 * L, 0.35 * L * s, -2.1 * L, (0.62 + 0.04 * Math.sin(t * 3)) * L * s);
    ctx.stroke();
  }
  // bayangan
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  // lambung kapal: haluan runcing di depan, buritan membulat di belakang
  ctx.beginPath();
  ctx.moveTo(L, 0);
  ctx.quadraticCurveTo(0.55 * L, 0.36 * L, 0, 0.36 * L);
  ctx.lineTo(-0.82 * L, 0.33 * L);
  ctx.quadraticCurveTo(-L, 0.3 * L, -L, 0);
  ctx.quadraticCurveTo(-L, -0.3 * L, -0.82 * L, -0.33 * L);
  ctx.lineTo(0, -0.36 * L);
  ctx.quadraticCurveTo(0.55 * L, -0.36 * L, L, 0);
  ctx.closePath();
  ctx.fillStyle = "#f28b82";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#5a1f1c";
  ctx.stroke();
  // geladak
  ctx.beginPath();
  ctx.moveTo(0.72 * L, 0);
  ctx.quadraticCurveTo(0.45 * L, 0.25 * L, 0, 0.26 * L);
  ctx.lineTo(-0.78 * L, 0.24 * L);
  ctx.lineTo(-0.78 * L, -0.24 * L);
  ctx.lineTo(0, -0.26 * L);
  ctx.quadraticCurveTo(0.45 * L, -0.25 * L, 0.72 * L, 0);
  ctx.fillStyle = "#fde7e3";
  ctx.fill();
  // ruang kemudi (anjungan) dengan jendela di depan
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#5a1f1c";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-0.62 * L, -0.19 * L, 0.42 * L, 0.38 * L, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#1f3b57";
  ctx.fillRect(-0.27 * L, -0.15 * L, 0.06 * L, 0.3 * L);
  // tiang dan gulungan jaring ikan
  ctx.fillStyle = "#5a1f1c";
  ctx.beginPath(); ctx.arc(0.25 * L, 0, 0.06 * L, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2f8f6b";
  ctx.beginPath(); ctx.arc(-0.86 * L, 0, 0.12 * L, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function kartuInfo(x, y, baris, L) {
  // kartu keterangan di samping kapal: judul merah + beberapa baris keterangan
  ctx.save();
  ctx.font = `800 13px Inter, "Segoe UI", system-ui, sans-serif`;
  let lebar = ctx.measureText(baris[0]).width + 22;
  ctx.font = `500 11px Inter, "Segoe UI", system-ui, sans-serif`;
  for (const b of baris.slice(1)) lebar = Math.max(lebar, ctx.measureText(b).width);
  const lebarKotak = lebar + 28, tinggi = 26 + 16 * (baris.length - 1);
  const bx = x + L * 1.6 + 18, by = y - L * 1.4 - tinggi;
  ctx.strokeStyle = "rgba(255,45,45,.9)";
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + L * 0.8, y - L * 0.6); ctx.lineTo(bx, by + tinggi - 6); ctx.stroke();
  ctx.fillStyle = "rgba(10,14,22,.9)";
  ctx.beginPath(); ctx.roundRect(bx, by, lebarKotak, tinggi, 8); ctx.fill();
  ctx.fillStyle = MERAH;
  ctx.beginPath(); ctx.roundRect(bx, by, 5, tinggi, [8, 0, 0, 8]); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 18, by + 15, 3.5 + Math.sin(performance.now() / 180) * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.font = `800 13px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(baris[0], bx + 28, by + 15);
  ctx.fillStyle = "rgba(225,235,245,.88)";
  ctx.font = `500 11px Inter, "Segoe UI", system-ui, sans-serif`;
  baris.slice(1).forEach((b, i) => ctx.fillText(b, bx + 14, by + 33 + i * 16));
  ctx.restore();
}

function gambarKapalUtama(t, L) {
  const k = kapalUtama;
  const fokus = progresZoom(t);                          // 0 = jauh, 1 = kamera sudah dekat
  const [x, y] = keLayar(k.u, k.v);
  gambarJejak(k, 1.4 + 3 * fokus);
  if (fokus > 0.02) {
    const besar = Math.max(L, 8 + 24 * fokus);          // setengah panjang kapal (piksel)
    cincin(x, y, besar * 1.5, t);
    ikonKapalBesar(x, y, k.sudut, besar, t);
    if (fokus > 0.75) {
      const menit = 192 + Math.floor(t * 2);             // waktu simulasi berjalan lebih cepat
      const knot = (1.6 + 0.5 * Math.sin(t * 0.7)).toFixed(1).replace(".", BAHASA === "id" ? "," : ".");
      ctx.save();
      ctx.globalAlpha = Math.min(1, (fokus - 0.75) * 4);
      kartuInfo(x, y, ["LOITERING", TEKS.kapalAsing, TEKS.durasi(Math.floor(menit / 60), menit % 60, knot)], besar);
      ctx.restore();
    }
  } else {
    ikonKapal(x, y, k.sudut, JENIS.ikan.warna, L * JENIS.ikan.ukuran, 1);
    cincin(x, y, L * 1.5, t);
    label(x, y, "LOITERING", TEKS.LOITERING, L);
  }
}

function gambarKejahatan(t, L) {
  for (const kj of kejahatan) {
    if (kj.utama) { gambarKapalUtama(t, L); continue; }
    // zona terlarang (lingkaran putus-putus)
    if (kj.zona) {
      const [x, y] = keLayar(kj.zona.cu, kj.zona.cv);
      const r = kj.zona.jari * 256 * Math.pow(2, KAM.z);
      ctx.save();
      ctx.fillStyle = "rgba(255,45,45,.10)";
      ctx.strokeStyle = "rgba(255,45,45,.8)";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (L > 7.5) {
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,70,70,.95)";
        ctx.font = `700 9px Inter, "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(TEKS.zona, x, y + r + 12);
      }
      ctx.restore();
    }
    const k0 = kj.kapal[0];
    let [x, y] = keLayar(k0.u, k0.v);

    if (kj.nama === "GO DARK") {
      const prog = k0.s / k0.jalur.panjang;
      const gelap = prog > k0.gelap[0] && prog < k0.gelap[1];
      if (gelap) {
        // posisi terakhir yang terlihat: ikon kosong putus-putus
        const p = titikPada(k0.jalur, k0.gelap[0] * k0.jalur.panjang);
        [x, y] = keLayar(p.u, p.v);
        ctx.save();
        ctx.translate(x, y); ctx.rotate(Math.atan2(p.av, p.au));
        ctx.setLineDash([2.5, 2.5]); ctx.strokeStyle = MERAH; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-0.75 * L, 0.46 * L); ctx.lineTo(-0.48 * L, 0); ctx.lineTo(-0.75 * L, -0.46 * L); ctx.closePath(); ctx.stroke();
        ctx.restore();
        cincin(x, y, L * 1.5, t);
        label(x, y, "GO DARK", TEKS["GO DARK"], L);
      }
      continue;
    }

    if (kj.nama === "SPOOFING") {
      // posisi palsu yang dikirim kapal: berkedip, dihubungkan garis putus-putus
      const pu = k0.u + k0.palsu[0], pv = k0.v + k0.palsu[1];
      const [fx, fy] = keLayar(pu, pv);
      const kedip = 0.35 + 0.65 * (Math.sin(t * 5) > 0 ? 1 : 0.25);
      ctx.save();
      ctx.strokeStyle = "rgba(255,45,45,.75)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.restore();
      ikonKapal(fx, fy, k0.sudut, "rgba(255,255,255,.9)", L, kedip, MERAH);
      if (L > 7.5) {
        ctx.save(); ctx.fillStyle = MERAH; ctx.font = `600 9px Inter, "Segoe UI", system-ui, sans-serif`;
        ctx.globalAlpha = kedip; ctx.fillText(TEKS.palsu, fx + L + 4, fy + 3); ctx.restore();
      }
    }

    if (kj.labelDiZona) {
      for (const k of kj.kapal) { const [a, b] = keLayar(k.u, k.v); cincin(a, b, L * 1.05, t, k.fa); }
      const [zx, zy] = keLayar(kj.zona.cu, kj.zona.cv);
      label(zx, zy - kj.zona.jari * 256 * Math.pow(2, KAM.z) * 0.6, kj.nama, TEKS[kj.nama], L);
    } else {
      if (kj.kapal.length > 1) {
        const [x2, y2] = keLayar(kj.kapal[1].u, kj.kapal[1].v);
        x = (x + x2) / 2; y = (y + y2) / 2;
      }
      cincin(x, y, L * (kj.kapal.length > 1 ? 1.9 : 1.5), t);
      label(x, y, kj.nama, TEKS[kj.nama], L);
    }
  }
}

// ---------------------------------------------------------------------------
// 14. PUTARAN ANIMASI
// ---------------------------------------------------------------------------
const awal = performance.now();
let lalu = awal;
function putar(sekarang) {
  const t = (sekarang - awal) / 1000;
  const dt = Math.min(0.05, (sekarang - lalu) / 1000);
  lalu = sekarang;

  KAM = kameraPada(t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gambarPeta();

  const L = ukuranIkon();
  const margin = 40;

  // rambu navigasi
  if (L > 6) {
    for (const [u, v] of RAMBU) {
      const [x, y] = keLayar(u, v);
      if (x < -margin || y < -margin || x > W + margin || y > H + margin) continue;
      ctx.beginPath(); ctx.arc(x, y, L * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill();
      ctx.strokeStyle = "#a23bd6"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, L * 0.14, 0, Math.PI * 2); ctx.fillStyle = "#a23bd6"; ctx.fill();
    }
  }

  // semua kapal
  for (const k of kapal) {
    gerakkan(k, t, dt);
    if (k === kapalUtama) continue;                      // kapal utama digambar terpisah (paling atas)
    const [x, y] = keLayar(k.u, k.v);
    if (x < -margin || y < -margin || x > W + margin || y > H + margin) continue;
    if (k.gelap) {                                         // kapal "go dark" tidak terlihat
      const prog = k.s / k.jalur.panjang;
      if (prog > k.gelap[0] && prog < k.gelap[1]) continue;
    }
    const j = JENIS[k.jenis];
    const ukuran = L * j.ukuran * (k.skala || 1);
    if (k.macam === "labuh") ikonLabuh(x, y, k.sudut, j.warna, ukuran * 1.3, k.alfa);
    else ikonKapal(x, y, k.sudut, j.warna, ukuran, k.alfa);
  }

  gambarKejahatan(t, L);
  requestAnimationFrame(putar);
}

// ---------------------------------------------------------------------------
// 15. MENDENGARKAN index.html: layar dan bahasa berganti tanpa memuat ulang halaman
// ---------------------------------------------------------------------------
new MutationObserver(() => {
  const layarBaru = bacaLayar();
  if (layarBaru !== LAYAR) {
    const t = (performance.now() - awal) / 1000;
    kameraAwal = { u: KAM.u, v: KAM.v, z: KAM.z };        // mulai dari posisi kamera saat ini
    mulaiPindah = t;
    mulaiLayar = t;
    if (LAYAR === 0 && layarBaru === 1 && !SUDAH_ZOOM) kameraAwal = null;   // zoom Login sudah mulus sendiri
    LAYAR = layarBaru;
    muatLebihDulu();
  }
  const bahasaBaru = bacaBahasa();
  if (bahasaBaru !== BAHASA) { BAHASA = bahasaBaru; TEKS = SEMUA_TEKS[BAHASA]; }
}).observe(wadah, { attributes: true, attributeFilter: ["data-layar", "data-bahasa"] });

// Di Welcome, ubin untuk tampilan dekat dimuat belakangan supaya peta jauh tampil duluan
setTimeout(muatLebihDulu, LAYAR === 0 ? 4000 : 0);
requestAnimationFrame(putar);
})();
