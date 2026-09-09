# Secret Forum — Firebase-ready

Aplikasi web forum privat berbasis Firebase:
- Login/daftar memakai username + password.
- Username dibuat permanen; nama tampilan dan password bisa diubah.
- Buat forum: nama + 2–20 anggota + secret code.
- User biasa mendapat secret code acak; Premium dapat custom code.
- Bergabung menggunakan secret code.
- Chat hanya teks dan menampilkan nama tampilan.
- Owner/admin dapat mengelola forum.
- Admin panel: cari user, ban/unban, suspend 24 jam, grant/revoke Premium, grant/revoke admin.
- Premium dapat diberi durasi hari oleh admin.
- Popup promosi Premium muncul setiap 10 menit selama 5 detik (hanya di client).

## Setup Firebase
1. Buat project di Firebase Console.
2. Aktifkan Authentication > Sign-in method > Email/Password.
3. Buat Firestore Database.
4. Buka `app.js` dan isi `firebaseConfig` dengan konfigurasi Web App milik project.
5. Deploy `firestore.rules`.
6. Untuk bootstrap admin pertama, setelah membuat akun pertama, tambahkan dokumen:
   `admins/<UID_AKUN>` dengan:
   `{ "uid": "<UID_AKUN>", "username": "<USERNAME>", "enabled": true }`
   dan set `users/<UID_AKUN>.isAdmin = true`.
   Setelah itu admin tersebut bisa mengelola admin dari aplikasi.

## Penting
Username dipetakan ke email internal `username@secretforum.local` agar Firebase Authentication tetap memakai Email/Password tanpa meminta email pengguna.
Untuk produksi, pertimbangkan Cloud Functions/Cloud Run untuk:
- validasi username secara terpusat,
- operasi admin yang lebih sensitif,
- rate limiting / anti-spam,
- moderasi,
- penghapusan akun dan audit log.

Jangan menaruh Firebase Admin SDK service-account key di frontend.

## Menjalankan lokal
Karena Firebase module dan beberapa browser API lebih aman lewat HTTP server, jalankan:
`python -m http.server 8080`
lalu buka `http://localhost:8080`.

## Catatan desain
File ini adalah aplikasi siap-deploy setelah Firebase config + rules dipasang. Sistem pembayaran Premium belum terhubung ke payment gateway; status Premium dikelola admin sesuai permintaan.

### Tambahan versi ini
- Pengaturan akun menampilkan status **ADMIN / PREMIUM / BIASA**.
- Ada menu **Hubungi Admin** untuk mengirim permintaan pembelian Premium langsung ke Firestore.
- Admin Panel menampilkan hingga 30 permintaan Premium terbaru dan bisa menandai permintaan selesai.
- Fitur admin lama tetap dipertahankan: pencarian user, ban/unban, suspend 24 jam, grant/revoke Premium, dan grant/revoke admin.

## Perubahan v8
- Hapus pesan: pemilik pesan dan admin dapat menghapus pesan.
- Input pesan menggunakan textarea seperti chat modern, mendukung baris baru.
- Kode secret setelah membuat forum ditampilkan lebih lama (8 detik).
- Badge Premium otomatis berdasarkan `premiumPurchases`: 1=merah, 2=ungu, 3=pink, 4+=hijau.
- Saat admin memberikan Premium, `premiumPurchases` bertambah 1.
- Pesan menyimpan jumlah pembelian Premium pengirim agar badge tampil konsisten.
- Admin tetap mendapat centang biru terverifikasi.
- Rules pesan memvalidasi `premiumPurchases` milik akun sehingga badge tidak mudah dipalsukan.
- Rules akses forum/admin diperjelas agar admin dapat membaca daftar forum.

**Penting:** deploy `firestore.rules` terbaru bersama file website.


## Pembaruan fitur
- Admin message permissions fixed in Firestore Rules.
- Admin panel access rules fixed.
- Forum owner can view members, kick members, and toggle owner-only messaging.
- Premium page with 1 week, 1 month, and 1 year purchase requests.
- Payment page includes QRIS placeholder and bank account placeholder; replace the displayed payment details in `index.html` before production.
- "Saya Sudah Bayar" creates a premium purchase request for admin verification and returns to Home after loading.

### Batas anggota forum
- Akun biasa dapat membuat forum dengan batas 2–20 anggota.
- Akun Premium dapat memilih batas 2–400 anggota.
- Batas juga divalidasi di Firestore Rules agar tidak bisa dilewati dengan memanipulasi aplikasi.
