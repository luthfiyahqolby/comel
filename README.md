# Arabic Direction Zayd 3D v4

Project pembelajaran bahasa Arab berbasis **Vite + Babylon.js + TypeScript + MediaPipe**.

## Fitur utama

- **3 tombol menu utama** di sidebar kiri:
  1. **Materi**: penjelasan konsep pembelajaran.
  2. **8 Arah**: depan, belakang, kanan, kiri, atas, bawah, dalam, luar.
  3. **Petunjuk Berjalan**: maju, mundur, belok kanan, belok kiri, naik, turun.
- Sidebar kiri bisa **hide/unhide**. Saat sidebar di-hide, kamera ikut tersembunyi dan otomatis dimatikan.
- **Tombol Full Screen 3D** untuk menampilkan canvas Babylon.js secara penuh.
- **Model Zayd GLB** tersedia di `public/models/zayd.glb` dan dapat diganti dengan model lain bernama sama.
- Gesture sudah **diganti dari swipe cepat menjadi pose statis / hold-to-confirm** agar lebih stabil di pencahayaan kurang.
- Saat gesture **maju/depan** atau **mundur/belakang** terbaca, aplikasi menampilkan keterangan pada overlay 3D dan status kamera.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka URL dari Vite, biasanya:

```bash
http://localhost:5173
```

## Model gesture baru

Gesture tidak lagi mengandalkan swipe cepat. Setiap gesture perlu ditahan sekitar **0,65 detik**.

### Section 2: 8 Arah

| Arah | Gesture |
|---|---|
| Depan / أَمَامَ | Telapak terbuka |
| Belakang / خَلْفَ | Kepal tangan |
| Kanan / يَمِين | Jempol mengarah ke kanan |
| Kiri / يَسَار | Jempol mengarah ke kiri |
| Atas / فَوْقَ | Telunjuk mengarah ke atas |
| Bawah / تَحْتَ | Telunjuk mengarah ke bawah |
| Dalam / دَاخِلَ | Dua tangan dekat di tengah |
| Luar / خَارِجَ | Dua tangan terbuka melebar |

### Section 3: Petunjuk Berjalan

| Perintah | Gesture |
|---|---|
| Maju / تَقَدَّمْ | Telapak terbuka |
| Mundur / اِرْجِعْ | Kepal tangan |
| Belok kanan / اِنْعَطِفْ يَمِينًا | Jempol mengarah ke kanan |
| Belok kiri / اِنْعَطِفْ يَسَارًا | Jempol mengarah ke kiri |
| Naik / اِصْعَدْ | Telunjuk mengarah ke atas |
| Turun / اِنْزِلْ | Telunjuk mengarah ke bawah |

## Mengganti model Zayd

Ganti file berikut dengan model humanoid `.glb` milik bro:

```text
public/models/zayd.glb
```

Pastikan nama file tetap `zayd.glb`.

## Catatan

- Gesture memakai webcam dan model MediaPipe dari CDN, sehingga perlu koneksi internet saat gesture pertama kali diaktifkan.
- Mode manual tetap bisa dipakai tanpa kamera.
- Fullscreen mengikuti dukungan browser melalui Fullscreen API.
