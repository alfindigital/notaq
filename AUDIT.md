# Notaku — Audit Codebase

Audit menyeluruh seluruh codebase (~4.654 baris, 40+ file: routes, komponen,
lib, SSR entry, service worker, config). Tanggal: 2026-06-20.

## Ringkasan

**Kualitas tinggi & sehat.** Codebase rapi, konsisten, dewasa secara teknis:
TypeScript + Zod menyeluruh, error handling SSR berlapis, PWA/SEO lengkap,
aksesibilitas baik. Temuan serius minim — 1 bug fungsional kecil + beberapa
polish + 1 risiko produk (data lokal). Sebagian besar sudah **diperbaiki** di
PR ini (lihat tanda ✅).

`tsc --noEmit` lulus (0 error) setelah perbaikan.

---

## 🔴 Bug fungsional

| Status | Temuan | Lokasi |
|---|---|---|
| ✅ **Fixed** | Tombol **"Ke beranda"** menautkan ke `/buat` (halaman Buat), bukan `/` (Beranda). Ada di error fallback & 404. | `src/components/RouteFallbacks.tsx` |

---

## 🟠 Risiko produk (bukan bug — masuk roadmap)

| Status | Temuan | Catatan |
|---|---|---|
| 📋 Roadmap | **Eviction data iOS.** Safari iOS menghapus IndexedDB setelah **7 hari** situs tak dibuka **jika belum di-"Add to Home Screen"**. Untuk app lokal-only, ini risiko nyata kehilangan data bagi pengguna iPhone via browser. | Mitigasi: dorong "Tambah ke Layar Utama" + pengingat backup; solusi penuh = cloud sync. |
| 📋 Roadmap | **Skalabilitas penyimpanan.** Semua nota disimpan sebagai **1 key array** di IndexedDB → tiap simpan menulis ulang seluruh array (write amplification). Aman untuk ratusan–ribuan nota; berat di volume sangat besar. | Saat desain cloud: **1 row per nota** (bukan 1 blob). |

---

## 🟡 Polish / kualitas

| Status | Temuan | Lokasi |
|---|---|---|
| ✅ **Fixed** | **A11y fokus keyboard.** `:focus-visible` di-set `outline:none` global → pengguna keyboard tak punya indikator fokus. Diubah: mouse/touch tetap bersih, keyboard dapat ring fokus. | `src/styles.css` |
| ✅ **Fixed** | **`useTheme` tak berbagi state** — tiap pemanggil punya state sendiri, bisa drift. Diubah jadi shared store (`useSyncExternalStore`) yang sinkron antar-komponen. | `src/lib/theme.ts` |
| ✅ **Fixed** | **`usePullToRefresh`** mendeklarasikan `pullRef`/`refreshingRef` **setelah** dipakai di effect (jalan karena timing, tapi rawan). Dipindah ke atas effect. | `src/hooks/usePullToRefresh.ts` |
| ✅ **Fixed** | **`RollingIDR`** memakai `Math.abs` → tak menampilkan tanda minus (laten bila dipakai untuk nilai negatif spt laba). Ditambah render tanda `-`. | `src/components/RollingIDR.tsx` |
| 📋 Catatan | **Lint/prettier tak ter-enforce.** ~383 pelanggaran `prettier/prettier` pra-ada di banyak file (riwayat.tsx, server.ts, dll). `npm run lint` merah sejak awal. Tidak diperbaiki di sini karena reformat massal = diff besar & berisiko bentrok dengan two-way sync Lovable. | seluruh repo |
| 📋 Catatan | Duplikasi kecil: 2 definisi `Modal` (inline di riwayat + `Modal.tsx`) & beberapa helper `Row`. Benign — dibiarkan. | beberapa file |
| 📋 Catatan | Kontras `--muted-foreground` (teks 10–11px) perlu cek visual WCAG di kedua tema. Tidak diubah (warna brand, butuh keputusan desain). | `src/styles.css` |

---

## ✅ Kekuatan (dipertahankan)

- **Keamanan:** tidak ada secret/`.env` ter-commit; **tidak ada sink XSS**
  (`dangerouslySetInnerHTML`/`eval`/`innerHTML` nihil); validasi **Zod**
  menyeluruh; link WA pakai `encodeURIComponent`; data **100% lokal** (privasi kuat).
- **Error handling SSR berlapis:** `server.ts` + `start.ts` + `error-page.ts`
  menangkap bahkan error yang "ditelan" h3, dengan halaman fallback mandiri.
- **PWA/Offline:** service worker (SWR untuk navigasi, CacheFirst untuk aset,
  cache ber-versi), multi-tab sync (BroadcastChannel), penanganan kuota penuh.
- **SEO sangat lengkap:** meta per-route, OG, JSON-LD (Organization/WebSite/App/
  FAQ/HowTo/Breadcrumb), sitemap, robots, manifest, `llms.txt`. Halaman detail `noindex`.
- **Aksesibilitas:** `aria-label` di tombol ikon, `role=dialog`/`aria-modal`,
  `sr-only` headings, focus management di modal konfirmasi.
- **Data:** schema versioning + migrasi, backup export/import (merge/replace +
  konfirmasi ketik).

## 🔐 npm audit

**1 kerentanan LOW** — `esbuild` (dev-server, Windows). **Tidak kena produksi.**
Aman diabaikan.

---

_Audit ini melengkapi `ROADMAP.md`. Item 📋 dipindah ke roadmap/backlog._
