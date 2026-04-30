# Deploy ke GitHub Pages

Project ini sudah disiapkan untuk deploy otomatis ke GitHub Pages memakai GitHub Actions.

## Jalankan lokal

```bash
npm install
npm run dev
```

## Upload ke GitHub

Ganti `USERNAME` dan `REPO_NAME` sesuai akun dan nama repository bro.

```bash
git init
git add .
git commit -m "Initial commit: Arabic Direction Zayd 3D"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

## Aktifkan GitHub Pages

1. Buka repository di GitHub.
2. Masuk ke **Settings**.
3. Pilih **Pages**.
4. Pada **Build and deployment**, pilih **Source: GitHub Actions**.
5. Buka tab **Actions** dan tunggu workflow `Deploy Vite app to GitHub Pages` selesai.
6. Setelah sukses, URL website biasanya berbentuk:

```text
https://USERNAME.github.io/REPO_NAME/
```

## Catatan penting

- `vite.config.ts` memakai `base: "./"` supaya aset Babylon, CSS, JS, dan model GLB tetap terbaca di URL repository GitHub Pages.
- File model Zayd ada di `public/models/zayd.glb`.
- Kamera/gesture di browser biasanya perlu HTTPS. GitHub Pages sudah memakai HTTPS, jadi lebih cocok untuk menguji gesture dibanding membuka file HTML langsung.
- Jika menjalankan lokal, gunakan `npm run dev`, bukan membuka `index.html` langsung.
