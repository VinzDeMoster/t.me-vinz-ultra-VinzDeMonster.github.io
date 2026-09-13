# Secret Forum — v18

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
