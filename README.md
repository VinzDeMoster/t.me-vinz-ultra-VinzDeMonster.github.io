# Secret Forum — v13

Web app forum privat berbasis Firebase Authentication + Firestore.

## Fitur utama
- Login/register dengan username + password.
- Username permanen; nama tampilan bisa diubah.
- Forum privat dengan secret code.
- Batas forum: akun biasa maksimal 20 anggota, Premium maksimal 400 anggota.
- Premium dapat memakai custom secret code.
- Di dalam forum, bagian **Detail Forum** hanya tampil untuk owner dan berisi daftar anggota + pengaturan **Hanya owner yang dapat mengirim chat**.
- Saat mode owner-only aktif, composer chat anggota biasa otomatis terkunci sampai owner mematikannya. Admin tetap dapat mengirim.
- Owner dapat kick anggota (tidak bisa kick diri sendiri).
- Pesan teks multiline, hapus pesan sendiri/admin, badge admin dan badge Premium.
- Premium dapat diaktifkan memakai kode aktivasi.
- Alur pembayaran saat ini: user mengirim bukti/permintaan pembayaran, admin memverifikasi, lalu sistem membuat kode aktivasi khusus untuk akun tersebut. Kode muncul otomatis di Pengaturan akun.

## Aktivasi Premium
1. User memilih paket Premium dan menekan **Saya Sudah Bayar**.
2. Permintaan masuk ke Admin Panel.
3. Admin mengecek pembayaran di luar aplikasi lalu menekan **Verifikasi & buat kode**.
4. Sistem membuat kode aktivasi satu kali pakai untuk UID user tersebut.
5. Kode muncul realtime di **Pengaturan > Aktivasi Premium**.
6. User memasukkan kode. Premium langsung aktif sesuai durasi paket.

> Catatan: QRIS/rekening pada halaman pembayaran masih placeholder. Agar verifikasi benar-benar otomatis setelah pembayaran tanpa campur tangan admin, perlu payment gateway yang menyediakan webhook/server-side verification (misalnya Midtrans, Xendit, Tripay, dll.) dan backend/serverless function. Jangan menaruh secret API key gateway di JavaScript frontend.

## Firebase
1. Aktifkan Authentication > Email/Password.
2. Aktifkan Firestore.
3. Deploy `firestore.rules`.
4. Jika ingin admin pertama, buat `admins/{UID}` dengan `enabled: true`, lalu set `users/{UID}.isAdmin: true` bila diperlukan.

## Struktur tambahan Firestore
- `supportRequests/{id}` — permintaan pembelian Premium.
- `premiumActivations/{CODE}` — kode aktivasi sekali pakai yang terikat ke UID dan durasi pembelian.
