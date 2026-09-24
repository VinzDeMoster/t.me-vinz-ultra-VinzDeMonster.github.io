# Secret Forum v4 – WhatsApp-style Private Chat

## Perubahan utama
- Tampilan Pesan Pribadi diubah menjadi layout chat dua panel bergaya WhatsApp Web.
- Pada layar kecil, daftar chat dan jendela chat berganti dengan tombol kembali.
- Baca selengkapnya tetap aktif untuk pesan panjang >100 karakter.
- Private chat mendukung foto, video, dan file.
- Media private baru dienkripsi di perangkat sebelum upload menggunakan Web Crypto AES-GCM + ECDH, lalu hanya ciphertext yang disimpan di Cloudinary.
- Forum tetap mempertahankan fitur media lama; media forum baru juga dienkripsi sebelum upload.
- Kirim kontak berdasarkan username tanpa nomor telepon.
- Bot Care mendapat tambahan utilitas: UUID, generator password, penghitung karakter/baris, waktu zona, cek URL, persen, serta perintah kontak.
- Fitur lama tidak sengaja dihapus: Firebase Auth/Firestore, forum, Premium, Admin, Author, Inbox, theme/color, language, moderation, Bot Care, maintenance, dan iklan tetap dipertahankan.

## Catatan media
- Private media terenkripsi dibatasi 25 MB per kiriman agar proses enkripsi/dekripsi browser tetap stabil.
- File lama yang sudah tersimpan sebelum versi ini tetap didukung.
- Pastikan Cloudinary unsigned upload preset yang sudah digunakan proyek tetap aktif.

## Firebase
Rules yang sudah ada tetap disertakan. Upload ZIP ini ke hosting proyek dan deploy `firestore.rules`/`storage.rules` sesuai setup Firebase yang dipakai proyek.


Login fix v4.1: authentication now shows progress, surfaces Firebase errors, and optional security/Bot Care initialization cannot block the login UI.
