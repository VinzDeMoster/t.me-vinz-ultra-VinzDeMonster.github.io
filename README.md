# Secret Forum — Fixed v14

Perubahan utama:
- Normal forum maksimal 20 anggota; Premium maksimal 400.
- Detail Forum hanya tampil untuk owner dan berisi daftar anggota + pengaturan owner-only.
- Saat owner-only aktif, composer anggota biasa terkunci.
- Admin dapat membaca dan mengirim pesan di forum tanpa harus menjadi anggota forum.
- Validasi Premium badge tetap berdasarkan premiumPurchases.
- Panel admin dan verifikasi Premium memakai Firestore Rules.
- Pembayaran saat ini masih manual: user mengirim konfirmasi pembayaran, admin memverifikasi, lalu sistem membuat kode aktivasi unik.
- Kode aktivasi hanya bisa digunakan oleh akun yang dituju dan satu kali.
