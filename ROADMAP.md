# Notaku — Roadmap & Improvement

> Aplikasi nota & keuangan untuk **UMKM lokal**.
> Prinsip: **sederhana, taktis, cepat** — tapi **cukup lengkap** sebagai pembukuan harian.
>
> Dokumen ini dipakai sebagai sumber konteks (bisa diberikan ke Lovable) dan
> sebagai peta pengembangan bertahap. Bahasa app & dokumen: Indonesia.

Status data saat ini: **100% lokal** di HP (IndexedDB), tanpa login.
Rencana akhir: **sync ke Supabase / Lovable Cloud** setelah fitur & UI matang
(lihat [Fase 5](#fase-5--cloud-sync--multi-perangkat-ditunda)).

> Lihat juga **`AUDIT.md`** — audit codebase menyeluruh. Risiko teknis dari audit
> (eviction data iOS, skalabilitas penyimpanan) sudah dimasukkan ke Fase 5 di bawah.

---

## 0. Prinsip & Pagar Pembatas (biar tetap "simple")

Tujuannya "pembukuan lengkap", tapi kelengkapan **tidak boleh bikin ribet**.
Aturan main saat menambah fitur:

1. **Bertahap, bukan sekaligus.** Rilis per fase. Setiap fase berdiri sendiri & berguna.
2. **Default ringkas, lanjutan tersembunyi.** Field lanjutan (modal, metode bayar, status)
   muncul saat dibutuhkan — bukan memenuhi layar utama.
3. **Maksimal 5 tab.** Sekarang ada 4 (Beranda, Buat, Riwayat, Pengaturan). Sisakan ruang
   sehat; jangan tambah tab sembarangan.
4. **Satu alur = satu tujuan.** Buat nota harus tetap < 15 detik untuk transaksi cash biasa.
5. **Offline-first.** Semua fitur baru wajib jalan tanpa internet (cloud = lapisan sync, bukan syarat).

---

## 1. Kondisi Saat Ini (sudah jadi)

Supaya tidak mengusulkan ulang yang sudah ada.

| Area | Fitur yang sudah ada |
|---|---|
| **Buat nota** | Item (qty desimal, harga, **modal/HPP**), preset cepat + autocomplete, diskon (level nota), tag, catatan, autocomplete pelanggan + chip "pelanggan terakhir", **draft autosave**, **edit**, **buat ulang** |
| **Dashboard** | Omset & **laba kotor** (Hari ini / Bulan ini), grafik omset 7 hari, 5 transaksi terbaru, **sembunyikan nominal**, pull-to-refresh |
| **Riwayat** | Pencarian + **query pintar** (`>50k`), filter periode/rentang tanggal/tag, sortir (terbaru/terlama/nominal), grup per hari, rekap (jumlah/omset/laba), **pilih banyak** → hapus & tag massal |
| **Struk** | Share **PNG**, salin teks, **kirim WhatsApp** (normalisasi nomor 0→62), struk teks rapi (monospace) |
| **Pengaturan** | Profil bisnis + logo, kode awal nota, pesan bawah struk, tema terang/gelap, sembunyikan nominal, **preset CRUD**, **backup export/import** (merge/replace, konfirmasi ketik), reset |
| **Teknis** | PWA + offline, IndexedDB lokal, **sync antar-tab**, **migrasi schema** + versi schema, penanganan kuota penuh, lazy-load (kalender, grafik) |

**Kesimpulan:** fondasi sudah kuat & rapi. Sisi yang masih kosong adalah **sisi "keuangan" (pengeluaran & laba bersih)**, **laporan terbaca**, dan **layar pelanggan**.

---

## 2. Peta Prioritas (ringkas)

| Prioritas | Fase | Isi | Effort |
|---|---|---|---|
| 🟢 **P0** | Poles UX | Onboarding, FAB "Buat", metode bayar, pembulatan, diskon per-item | Kecil |
| 🔴 **P1** | **Pengeluaran → Laba Bersih** | Catat pengeluaran, kategori, kartu laba bersih | Sedang |
| 🟠 **P2** | **Laporan & Ekspor terbaca** | Rekap bulanan, ekspor CSV & PDF/gambar | Sedang |
| 🟡 **P3** | **Halaman Pelanggan** | Daftar pelanggan, riwayat & total per pelanggan | Kecil–Sedang |
| 🔵 **P4** | **Status bayar / Utang (ringan)** | Lunas/Belum/Sebagian + rekap piutang (karena mayoritas cash → versi ringan) | Kecil–Sedang |
| ⚪ **P5** | Cloud sync | Supabase / Lovable Cloud + login (ditunda) | Besar |
| 🗄️ Backlog | Stok, printer thermal, multi-cabang | Lihat §8 | Bervariasi |

Legenda effort: Kecil ≈ jam-an, Sedang ≈ harian, Besar ≈ mingguan.

---

## Fase 0 — Poles UX (cepat, dampak tinggi) 🟢

Perbaikan kecil yang langsung kerasa, tanpa model data besar.

1. **Onboarding pertama kali.** Saat profil bisnis masih kosong, tampilkan langkah singkat:
   isi nama usaha → buat 1–2 preset → buat nota pertama. Sekarang user baru langsung
   ketemu dashboard kosong tanpa arahan.
2. **Tombol "Buat" jadi FAB menonjol.** Aksi paling sering = bikin nota, tapi sekarang
   cuma 1 dari 4 tab setara. Jadikan tombol tengah yang menonjol (pola umum app kasir).
3. **Metode bayar (opsional).** Field `Tunai / Transfer / QRIS` di nota. Default Tunai,
   bisa disembunyikan. Berguna untuk rekap & rekonsiliasi (dan siap untuk laporan).
4. **Pembulatan total (opsional).** Toggle "bulatkan ke 500 / 1.000" — umum di warung.
5. **Diskon per-item (opsional).** Sekarang diskon hanya level nota; sebagian UMKM
   memberi potongan per barang. Tambahkan sebagai field lanjutan per item.
6. **Penjelasan "Laba".** Beri label jelas **Laba kotor** sekarang, dan siapkan ruang
   untuk **Laba bersih** setelah Fase 1 (mis. tooltip "kotor = omset − modal; bersih = − pengeluaran").
7. **Kontras dark mode.** Cek ulang kontras teks `muted-foreground` di mode gelap (aksesibilitas).

---

## Fase 1 — Pengeluaran → Laba Bersih 🔴 (inti "keuangan")

**Kenapa ini nomor 1:** sekarang app hanya mencatat **pemasukan**. Tanpa pengeluaran,
"laba" hanya laba kotor. Dengan pengeluaran, Notaku jadi **pembukuan beneran**
(income & expense → **laba bersih**).

**Model data baru** (siapkan agar mudah dipetakan ke tabel SQL nanti):

```ts
// Tambahan di src/lib/storage.ts
export const ExpenseSchema = z.object({
  id: z.string(),
  date: z.string(),                       // ISO
  category: z.string().trim().max(30),    // lihat kategori default
  amount: z.number().int().min(0),
  note: z.string().trim().max(200).default(""),
  paymentMethod: z.enum(["tunai", "transfer", "qris"]).default("tunai"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

**Kategori default** (preset, bisa diedit): Stok/Bahan, Sewa, Listrik & Air, Gaji,
Transport, Operasional, Lain-lain.

**UI:**
- Layar "Catat pengeluaran" sederhana (kategori → nominal → catatan → simpan).
- Dashboard: tambah kartu **Pengeluaran** & **Laba Bersih**
  (`laba bersih = omset − HPP/modal − pengeluaran`) untuk periode aktif.
- Riwayat: tampilkan pengeluaran (timeline "Arus kas" gabungan, atau filter masuk/keluar).
- Masuk ke backup/export (tambah `expenses` di `BackupSchema`, naikkan `SCHEMA_VERSION`
  + tulis migrasi — pola migrasi sudah ada).

**Pagar simple:** alur pengeluaran ≤ 4 ketukan. Jangan jadikan akuntansi debit-kredit.

---

## Fase 2 — Laporan & Ekspor Terbaca 🟠

Saat ini ekspor hanya **JSON** (untuk mesin/backup). Pemilik UMKM butuh laporan
yang **bisa dibaca & dibagikan** (ke keluarga, pemodal, atau "akuntan" sederhana).

1. **Rekap bulanan** (layar): omset, HPP, pengeluaran, **laba bersih**, jumlah nota,
   rata-rata per nota, **item terlaris**, **pelanggan teratas**, breakdown metode bayar.
2. **Ekspor CSV** (nota & pengeluaran) → bisa dibuka di Excel/Spreadsheet.
3. **Ekspor PDF / gambar** laporan bulanan → share ke WA (pakai infrastruktur
   `html-to-image` yang sudah ada untuk struk).
4. **Grafik tambahan:** tren bulanan (bukan hanya 7 hari), perbandingan bulan ini vs lalu.

**Pagar simple:** laporan = ringkasan siap-baca, bukan jurnal akuntansi penuh.

---

## Fase 3 — Halaman Pelanggan 🟡

Data pelanggan **sudah dihitung** (`deriveCustomers` di `storage.ts`) tapi belum ada layarnya.

- Daftar pelanggan: nama, total belanja, jumlah nota, transaksi terakhir.
- Detail pelanggan: semua nota miliknya + total + tombol **kirim WA** cepat.
- Cari pelanggan; urut berdasarkan total/terbaru.
- (Opsional) tandai pelanggan favorit / catatan pelanggan.

Effort kecil karena agregasi sudah ada — tinggal UI.

---

## Fase 4 — Status Bayar / Utang (versi ringan) 🔵

Kamu bilang **mayoritas cash**, jadi ini **sengaja dibuat ringan** & prioritas rendah —
tapi tetap berguna saat sesekali ada yang ngutang.

**Tahap ringan (cukup untuk cash-dominant):**
- Tambah di `NoteSchema`: `paymentStatus: "lunas" | "belum" | "sebagian"` (default `lunas`),
  opsional `paidAmount`.
- Toggle cepat **Lunas / Belum** di nota & di detail.
- Filter "Belum lunas" di Riwayat + kartu kecil **Total Piutang** (hanya muncul jika ada utang).

**Tahap lanjut (kalau ternyata dibutuhkan):**
- Catat pembayaran cicilan, riwayat pembayaran, pengingat jatuh tempo.

**Pagar simple:** kalau semua transaksi `lunas`, fitur ini nyaris tak terlihat.

---

## Fase 5 — Cloud Sync & Multi-Perangkat (ditunda)

Dieksekusi **setelah** fitur & UI matang. Tujuan: anti data hilang + multi-perangkat.

**Pilihan:** Supabase atau Lovable Cloud (keduanya Postgres + Auth + Storage).

**Persiapan dari sekarang (penting):**
- Rancang semua model baru (Expense, paymentStatus, dst.) dengan **field rata/sederhana**
  agar mudah dipetakan ke tabel SQL.
- Pertahankan **id stabil** (`uid()`) per record → memudahkan merge & sync.
- `exportAll`/`importAll` yang sudah ada = jalur migrasi awal ke cloud yang mulus.
- **Skema per-baris, bukan blob** (temuan audit): saat ini semua nota disimpan
  sebagai 1 key array di IndexedDB → tiap simpan menulis ulang seluruh array.
  Di cloud, gunakan **1 row per nota / per item / per pengeluaran** agar hemat &
  skalabel di volume besar.

**Saat eksekusi:**
- Tabel: `business`, `presets`, `notes`, `note_items`, `expenses`, `prefs`
  (+ `customers` jika ingin tabel sendiri; sekarang masih derived).
- **Auth**: email / OTP nomor HP (cocok untuk UMKM).
- **Strategi sync**: tetap **offline-first** — IndexedDB sebagai cache, sync ke cloud saat online
  (jangan jadikan online sebagai syarat memakai app).
- **Migrasi**: schema versioning yang sudah ada dipakai untuk transisi lokal → cloud.

> **Catatan risiko sementara (sebelum cloud) — dari audit:** data hanya di 1
> perangkat. Lebih dari sekadar "HP hilang": **Safari iOS menghapus IndexedDB
> setelah 7 hari** situs tak dibuka **bila belum di-"Add to Home Screen"**.
> Mitigasi interim tanpa cloud:
> 1. **Dorong "Tambah ke Layar Utama"** — PWA terinstal kebal eviction (bisa jadi
>    bagian dari onboarding Fase 0).
> 2. **Pengingat backup berkala** (mis. tiap X hari / X nota) lewat export yang sudah ada.

---

## 3. Daftar Improvement UI/UX (lintas fase)

- [ ] Onboarding/empty-state berarah untuk user baru.
- [ ] FAB "Buat nota" yang menonjol.
- [ ] Quick action di dashboard: "Catat nota" & "Catat pengeluaran".
- [ ] Penjelasan laba kotor vs bersih (tooltip ringkas).
- [ ] Metode bayar di nota (Tunai/Transfer/QRIS).
- [ ] Opsi pembulatan total.
- [ ] Diskon per-item (lanjutan).
- [ ] Struk: opsi ukuran **58mm thermal** (banyak UMKM punya printer bluetooth).
- [ ] Struk: opsi sertakan QR/link WA bisnis.
- [ ] Pencarian global (saat ini hanya di Riwayat).
- [ ] Cek kontras & focus-state di dark mode (aksesibilitas).
- [ ] Konsistensi konfirmasi hapus (toast-undo vs modal).

---

## 4. Backlog / Ide Lanjut (opsional)

- **Stok/Inventory ringan:** preset + jumlah stok, berkurang otomatis saat jual,
  peringatan stok menipis. (Hati-hati: bisa bikin "berat" — jaga tetap opsional.)
- **Printer thermal Bluetooth** langsung (bukan hanya gambar/teks).
- **Multi-cabang / multi-usaha** dalam 1 akun. (Tunggu cloud.)
- **Template item & kategori** bawaan per jenis usaha (warung, laundry, jasa).
- **Pengingat / catatan harian** (mis. setoran kas harian).
- **Ekspor pajak sederhana** kalau ada UMKM yang butuh.

---

## 5. Catatan Teknis Singkat

- Semua perubahan data → tambah field di Zod schema (`src/lib/storage.ts`),
  **naikkan `SCHEMA_VERSION`**, dan tulis migrasi (`migrateNote`/`migrateBusiness` sbg contoh).
- Tambah entitas baru ke `BackupSchema`, `exportAll`, `importAll` agar ikut backup.
- Pertahankan pola: data lewat `db` API + cache React Query + invalidate per `queryKey`.
- Badge versi sementara di header (`AppShell.tsx`) **akan dihapus** setelah verifikasi
  import selesai — bukan fitur permanen.

---

_Dokumen hidup — perbarui saat prioritas berubah._
