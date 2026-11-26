# AI-Powered Maritime Situational Intelligence

### Integrated AIS & SAR-Based Maritime Monitoring and Anomaly Detection

<p align="center">

**PT LEN × Institut Teknologi Sepuluh Nopember (ITS)**

</p>

---

## Overview

Proyek ini merupakan pengembangan **AI-Powered Maritime Situational Intelligence (MSI)** untuk meningkatkan kemampuan pemantauan aktivitas kapal dan identifikasi indikasi **IUU Fishing dan Ocean Crime** melalui integrasi data **Automatic Identification System (AIS)** dan **Synthetic Aperture Radar (SAR)**.

Pengembangan tahun kedua melanjutkan hasil penelitian tahun pertama dengan mengintegrasikan beberapa pipeline yang telah dikembangkan secara terpisah menjadi satu sistem MSI yang lebih terintegrasi, akurat, dan informatif.

---

## TIM RISET TAHUN PERTAMA

Hasil penelitian tahun pertama dikembangkan melalui beberapa repository utama:

| Contributor | Repository                                                                   | Main Contribution         |
| ----------- | ---------------------------------------------------------------------------- | ------------------------- |
| **Lingga**  | [Len](https://github.com/ngenss12/Len)                                       | Samudra Aya / Application |
| **Helena**  | [SAR_YOLOv12](https://github.com/helenadityaa/SAR_YOLOv12)                   | SAR Vessel Detection      |
| **Aqilla**  | [TAcodingGFWanomaly](https://github.com/dhyaaqilla15-phy/TAcodingGFWanomaly) | AIS/GFW Anomaly Detection |
| **Fifi**    | [GFWLASTTTTTT](https://github.com/fififtrh28-source/GFWLASTTTTTT)            | Ocean Nexus Dashboard     |

### Komponen yang telah dikembangkan

**AIS / GFW Analysis**

* Vessel trajectory processing
* Fishing gear classification
* AIS spoofing detection
* AIS gap / go-dark detection
* Encounter & loitering detection
* Transshipment candidate detection

**SAR Analysis**

* SAR preprocessing
* VV/VH dual-polarization data
* Vessel object detection menggunakan YOLOv12
* Klasifikasi **Fishing, Cargo, dan Passenger**

**AIS–SAR Integration**

* AIS trajectory reconstruction
* Kalman-based position estimation
* Spatial matching antara AIS dan SAR
* Pembentukan kandidat aktivitas/anomali kapal
* Visualisasi hasil melalui maritime dashboard

---

## TECH STACK PENELITIAN TAHUN PERTAMA

Bagian ini merangkum teknologi, bahasa pemrograman, framework, dan penyimpanan data yang digunakan oleh tim ITS pada penelitian tahun pertama. Ringkasan disusun dari isi tiga repository berikut:

| Repository | Fokus |
| ---------- | ----- |
| **GFW02-MAIN** (Helena) | Pembentukan dataset patch SAR Sentinel-1 dari data GFW (OpenSARShip-like) |
| **TAcodingGFWanomaly** (Aqilla) | Deteksi anomali AIS/GFW berbasis deep learning |
| **GFWLASTTTTTT** (Fifi) | Integrasi AIS–SAR, Kalman filter, dan dashboard Ocean Nexus |

| Kategori | Teknologi |
| -------- | --------- |
| **Bahasa pemrograman** | Python 3, JavaScript (Node.js & browser, ES Modules), TypeScript, HTML5, CSS3, Bash, PowerShell |
| **AI / Machine Learning** | PyTorch, scikit-learn, YOLOv12 (hasil prediksi) |
| **Pengolahan data & geospasial** | pandas, NumPy, SciPy, GeoPandas, Shapely, Rasterio, rioxarray, PyProj, OpenCV, Pillow |
| **Akses citra satelit** | pystac-client, planetary-computer (Microsoft Planetary Computer STAC), asf_search (Alaska Satellite Facility) |
| **Visualisasi** | Matplotlib, Leaflet / React-Leaflet, Recharts |
| **Frontend web** | React 19, Vite 7, TanStack Start / Router / Query, Tailwind CSS 4, shadcn/ui (Radix UI), Lucide Icons |
| **Backend / API** | Node.js serverless functions (gaya Vercel), middleware API lokal Vite, FastAPI (server inference di Hugging Face Spaces) |
| **Database & penyimpanan** | Tidak memakai database relasional; cache & rate-limit memakai **Upstash Redis / Vercel KV (REST)**; data disimpan sebagai file (CSV, GeoJSON, JSON, NPZ, GeoTIFF, PNG, XML, `.pt`, `.h5`); `localStorage` di browser |
| **Deployment** | Vercel, Cloudflare Workers (Wrangler), Hugging Face Spaces |
| **Sumber data & API eksternal** | Global Fishing Watch API v3, Sentinel-1 (RTC & GRD), AISStream (WebSocket AIS live), Telegram Bot API, Marine Regions (batas ZEE), Natural Earth (garis pantai & pelabuhan), OpenStreetMap |
| **Tools pengembangan** | Git & GitHub, pip, npm / Bun, ESLint, Prettier, CUDA (GPU, opsional), Mermaid (flowchart) |

---

### 1. GFW02-MAIN — SAR Dataset Pipeline

Pipeline untuk mengubah data deteksi kapal GFW menjadi dataset patch SAR kapal (VV/VH) bergaya OpenSARShip.

| Komponen | Detail |
| -------- | ------ |
| Bahasa | Python 3 (script dijalankan lewat PowerShell) |
| Library utama | pandas, NumPy, GeoPandas, Shapely, Rasterio, rioxarray, PyProj, Pillow, OpenCV, tqdm, requests |
| Akses citra | `pystac-client` + `planetary-computer` untuk mengunduh **Sentinel-1 RTC** (VV & VH) dari Microsoft Planetary Computer |
| Geospasial tambahan | `mercantile`, `mapbox-vector-tile` (membaca tile posisi GFW) |
| Sumber data | GFW SAR Vessel Detections (CSV), polygon ZEE Indonesia (GeoJSON), GFW API v3 (identitas kapal & presence) |
| Format keluaran | GeoTIFF (`Patch`, `Patch_Cal` float32, `Patch_Uint8`), PNG (`Patch_RGB`), CSV & JSON (metadata), XML (`Ship.xml`, `Metedata.xml`) |
| Hasil dataset | Fishing 232 · Cargo 178 · Passenger 124 = **534 pasang patch** dari **254 scene** Sentinel-1 |

### 2. TAcodingGFWanomaly — AIS/GFW Anomaly Detection

Pipeline deep learning untuk klasifikasi alat tangkap dan deteksi anomali dari lintasan AIS.

| Komponen | Detail |
| -------- | ------ |
| Bahasa | Python 3, Bash (otomatisasi training & evaluasi) |
| Deep learning | **PyTorch**: BiLSTM + Temporal Self-Attention + Attention Pooling + Cosine Classifier; GRU sebagai pembanding (baseline paper) |
| Machine learning | **scikit-learn**: RobustScaler, StandardScaler, Logistic Regression, Random Forest, Extra Trees, BallTree, metrik evaluasi (F1, ROC-AUC, PR-AUC), GroupShuffleSplit |
| Pengolahan data | NumPy, pandas, SciPy (cKDTree), joblib, h5py, tqdm |
| Visualisasi | Matplotlib (lintasan, heatmap, confusion matrix) |
| Tugas model | Gear classification · Spoofing · Go-dark (AIS gap) · Transshipment candidate |
| Format data & model | NPZ (dataset sekuens), `.pt` (bobot PyTorch), `.joblib` (scaler), `.h5` (paket model final), JSON & CSV (hasil evaluasi) |
| Data pendukung | Natural Earth (garis pantai & pelabuhan) untuk menghitung jarak ke pantai/pelabuhan |
| Perangkat keras | CPU atau GPU NVIDIA (CUDA) |

### 3. GFWLASTTTTTT — AIS–SAR Integration & Ocean Nexus Dashboard

Integrasi hasil AIS dan SAR, estimasi posisi dengan Kalman filter, serta dashboard pemantauan dengan alert Telegram.

| Komponen | Detail |
| -------- | ------ |
| Bahasa | JavaScript, TypeScript, HTML5, CSS3, Python 3 |
| Frontend | Halaman HTML/CSS/JS (landing, Anomaly Alert, Data & Reports) + aplikasi **React 19 + TypeScript** |
| Framework & build tool | **Vite 7**, **TanStack Start / Router / Query**, **Tailwind CSS 4**, **shadcn/ui** (Radix UI), Lucide Icons, Zod |
| Peta & grafik | **Leaflet 1.9 + React-Leaflet**, Recharts |
| Backend / API | Node.js serverless functions (`api/`) sebagai proxy ke GFW API & Telegram Bot API, dengan rate limiting |
| Cache | **Upstash Redis / Vercel KV** (REST API), fallback ke memori lokal |
| Pengolahan data (Node.js) | Script `.mjs`: pelengkapan SOG/COG, **Kalman filter** estimasi posisi kapal, pembentukan lintasan GeoJSON |
| Pengolahan data (Python) | PyTorch & h5py (inference model `.h5`), pandas, NumPy, Rasterio, Matplotlib, Pillow, `asf_search` (unduh Sentinel-1 GRD) |
| AI inference | FastAPI di **Hugging Face Spaces** (submodule `InferenceAPI`, repository terpisah) |
| Data real-time & notifikasi | GFW API v3 (events, tracks, vessel identity), **AISStream** (WebSocket AIS live), **Telegram Bot API** |
| Deployment | **Vercel** (serverless), **Cloudflare Workers** (Wrangler) |
| Package manager & kualitas kode | npm / Bun, ESLint, Prettier |

---

### Arsitektur Singkat Tahun Pertama

```text
GFW SAR Detections ──► Sentinel-1 (Planetary Computer / ASF) ──► Patch SAR VV/VH ──► YOLOv12
                                                                                        │
GFW AIS Tracks ──► Sequence Builder ──► PyTorch BiLSTM ──► Model .h5 ──► Inference (FastAPI / Python)
                                                                                        │
AIS + SAR Metadata ──► Kalman Filter (Node.js) ──► Kandidat Anomali ────────────────────┤
                                                                                        ▼
                     Ocean Nexus Dashboard (React / HTML + Leaflet) ◄── Node.js API ──► Telegram Alert
                                              ▲                         │
                                              └── Upstash Redis (cache) ┘
```

---

### Roadmap

```text
TAHUN PERTAMA
│
├── AIS / GFW Anomaly Detection
│   ├── Gear Classification
│   ├── AIS Gap / Go-Dark
│   ├── Spoofing
│   ├── Loitering
│   └── Encounter / Transshipment
│
├── SAR Vessel Detection
│   └── YOLOv12 + VV/VH SAR
│
└── AIS–SAR Prototype & Dashboard
        │
        ▼
TAHUN KEDUA
│
├── 1. Dataset Preparation
│   ├── AIS dataset
│   ├── SAR dataset
│   └── Spatial-temporal alignment
│
├── 2. AIS–SAR Data Fusion
│   ├── Vessel identity matching
│   ├── Position & time matching
│   ├── Trajectory reconstruction
│   └── Multi-sensor feature fusion
│
├── 3. Integrated Anomaly Detection
│   ├── AIS Gap / Dark Activity
│   ├── Loitering
│   ├── MMSI Spoofing
│   ├── Encounter Events
│   └── Restricted Zone Entry
│
├── 4. AI-Based Decision Layer
│   ├── Anomaly scoring
│   ├── Multi-sensor verification
│   └── Alert generation
│
└── 5. Maritime Situational Intelligence
    ├── Integrated maritime map
    ├── Vessel tracking
    ├── Anomaly visualization
    └── Alert & reporting system
```

---

## TIM RISET TAHUN KEDUA

| Name       | Contribution                  |
| ---------- | ----------------------------- |
| **Aulia**  | System Integration & Research |
| **Sylvia** | System Integration & Research |
| **Syabil** | System Integration & Research |
|  **Gio**   | System Integration & Research |

## Future Development

Pengembangan selanjutnya berfokus pada **fusi data AIS dan SAR** untuk menghasilkan informasi aktivitas kapal yang lebih lengkap dan akurat dibandingkan penggunaan satu sumber data saja.

Data AIS digunakan untuk memperoleh informasi identitas dan pergerakan kapal, sedangkan citra SAR digunakan sebagai **independent observation** untuk memverifikasi keberadaan dan posisi kapal, termasuk kapal yang tidak terdeteksi atau tidak sesuai dengan informasi AIS.

Fusi kedua sumber data diarahkan untuk mendeteksi **lima kategori anomali utama**:

1. **AIS Gap / Dark Activity** — indikasi kapal terdeteksi pada SAR ketika transmisi AIS tidak tersedia.
2. **Loitering** — pola pergerakan kapal yang menunjukkan aktivitas menetap atau berputar pada area tertentu.
3. **MMSI Spoofing** — ketidaksesuaian antara identitas AIS dan observasi kapal pada SAR.
4. **Encounter Events** — indikasi pertemuan/interaksi antar kapal yang berpotensi menunjukkan aktivitas seperti transshipment.
5. **Restricted Zone Entry** — indikasi kapal memasuki wilayah yang dibatasi atau dilarang berdasarkan informasi geospasial.

### Target Akhir

> **AIS + SAR → Data Fusion → Multi-Anomaly Detection → Alert Generation → Maritime Situational Intelligence**

Sistem akhir diharapkan mampu menyediakan **single integrated maritime picture** yang menggabungkan informasi identitas, trajectory, observasi citra, serta indikasi anomali kapal untuk mendukung peningkatan **Maritime Situational Awareness** dan deteksi **IUU Fishing serta Ocean Crime**.

<p align="center">

**PT LEN × ITS**

**AI-Powered Maritime Situational Intelligence**

*AIS • SAR • Artificial Intelligence • Data Fusion*

</p>

Deploy 2026-11-26
