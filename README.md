# Secret Forum — v26

Fitur lama dipertahankan. Perbaikan/tambahan:
- Panel translator bawah forum dihapus; terjemahan tetap tersedia melalui tombol pada pesan Premium/Admin/Author dan mengganti teks langsung di tempat.
- Secret code akun biasa dibuat otomatis 18 karakter dan selalu ditampilkan setelah forum berhasil dibuat.
- Admin dan Author bebas menentukan jumlah anggota forum dan dapat memakai fitur Premium tanpa batas; Premium tetap maksimal 400, akun biasa 20.
- Inbox dapat menghapus pesan sendiri.
- Role Author adalah otoritas tertinggi. Author dapat mengelola Admin, ban permanen user/Premium/Admin, suspend, unban, unsuspend, dan menghapus forum.
- Admin tidak dapat memberhentikan atau memoderasi Admin lain. Pengaturan Admin hanya ada untuk Author.
- Pesan Author menampilkan label AUTHOR.

## Menetapkan Author pertama kali
Karena Firebase harus mengetahui UID pembuat website secara aman, buat dokumen Firestore `authors/{UID}` dengan `enabled: true`. Sebagai alternatif/backup, isi `AUTHOR_UID` di `app.js` dengan UID pembuat website. Jangan gunakan username sebagai otorisasi.

## Deploy
Deploy semua file aplikasi dan **firestore.rules** dari ZIP ini.


Premium pricing: 1 minggu Rp1.000, 1 bulan Rp2.000, 1 tahun Rp4.000. Untuk QRIS, ganti area placeholder pembayaran dengan gambar QRIS milikmu (misalnya file qris.png) dan referensikan file tersebut dari index.html. Jangan masukkan data pembayaran sensitif ke Firestore client-side.


## Media upload (Cloudinary Free)
Versi ini memakai Cloudinary untuk foto/video/file agar tidak memakai Firebase Storage. Cloudinary Free tidak memerlukan kartu kredit dan saat ini memberi 25 credits/bulan; batas file Free yang perlu diperhatikan: image 10 MB, video 100 MB, raw file 10 MB.

### Setup sekali
1. Buat akun gratis Cloudinary.
2. Buka Settings -> Upload Presets -> Add upload preset.
3. Jadikan preset **Unsigned**.
4. Salin **Cloud Name** dan nama upload preset.
5. Buka `app.js`, lalu ubah:
   - `CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME"`
   - `CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET"`
6. Upload/deploy ulang website.

Upload dilakukan langsung dari browser ke Cloudinary. Jangan memasukkan API Secret Cloudinary ke `app.js`.

## Bot Care v3
Bot Care menyediakan 51 perintah untuk informasi, utilitas, game, dan perawatan forum. Perintah manajemen seperti `#rawatforum on`, `#sensor on`, `#kick @username`, `#hapuspesan terakhir`, `#slowmode 10`, dan `#lockdown on` mengikuti hak akses Owner/Admin/Author. `#rawatforum on` menjalankan pemeriksaan otomatis terhadap kata terlarang pada pesan dan dapat mengeluarkan akun biasa/Premium yang terdeteksi melanggar; Owner Forum tetap dilindungi.

## v26 — Chat pribadi, keamanan pesan, dan pengaturan forum
- Tombol **Baca selengkapnya** sekarang muncul setelah isi pesan dan aktif mulai lebih dari 100 karakter; preview menampilkan lebih banyak teks dan bisa dibuka/tutup seperti chat modern.
- Ditambahkan menu **Pesan pribadi** untuk chat berdasarkan username tanpa masuk forum.
- Ditambahkan **Kontak** berbasis username, tanpa nomor telepon.
- Pesan pribadi baru menggunakan Web Crypto **ECDH + AES-GCM**: isi pesan dienkripsi di perangkat pengirim dan hanya perangkat dua anggota chat yang memiliki kunci untuk membukanya.
- Pesan forum baru juga disimpan dalam bentuk terenkripsi **AES-GCM**, dengan kunci yang diturunkan dari secret code + ID forum. Pesan lama yang masih plaintext tetap dapat dibaca.
- Admin dan Author mendapatkan **Pengaturan forum** untuk mengubah nama forum, kapasitas (tidak boleh di bawah jumlah anggota saat ini), owner-only, dan filter kata.
- `firestore.rules` ditambahkan untuk `publicProfiles`, `publicKeys`, `contacts`, dan `directChats`.
- Lampiran forum/Cloudinary tetap memakai sistem lama agar fitur media yang sudah ada tidak berubah.
- Deploy ulang **firestore.rules** setelah memakai ZIP ini.


## v27 — Private Chat UI + Media + Contact + Bot Care
- Private chat redesigned to use the same forum-style chat layout.
- Direct messages support encrypted photos, videos and files.
- Private contact cards can be sent inside encrypted chats.
- Long private messages keep the WhatsApp-style Read more behavior.
- Added Bot Care commands: #groupinfo, #admins, #tagall/#hidetag, and #say.
- Existing Firebase/forum/admin/author/premium features are retained.
