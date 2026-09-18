// SCRIPT UNTUK MEMBUAT LOGO DANSMUSIC DENGAN DESAIN MODERN ELEGAN, SIMETRIS, DAN RAPI
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// DESAIN LOGO VECTOR DANSMUSIC BERKUALITAS TINGGI, SIMETRIS & MODERN
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071a2b"/>
      <stop offset="100%" stop-color="#020912"/>
    </linearGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38d6ff"/>
      <stop offset="50%" stop-color="#00bcff"/>
      <stop offset="100%" stop-color="#0088ff"/>
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0088ff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- BACKGROUND ROUNDED SQUIRCLE -->
  <rect width="512" height="512" rx="112" fill="url(#logoBg)"/>
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="rgba(0, 188, 255, 0.18)" stroke-width="6"/>

  <!-- GEOMETRI LOGO HURUF D & RITME MUSIK MODERN PRESISI -->
  <g transform="translate(0, 0)">
    <!-- STEM UTAMA HURUF D -->
    <rect x="144" y="128" width="56" height="256" rx="16" fill="url(#cyanGrad)"/>

    <!-- LENGKUNGAN D BESAR PRESISI DENGAN GELOMBANG SUARA ELEGAN -->
    <path fill="url(#cyanGrad)" fill-rule="evenodd" d="
      M 196 128
      L 286 128
      C 352 128 400 176 400 256
      C 400 336 352 384 286 384
      L 196 384
      L 196 332
      L 282 332
      C 322 332 348 300 348 256
      C 348 212 322 180 282 180
      L 196 180
      Z
    "/>

    <!-- 3 BAR EQUALIZER RITME DI TENGAH LENGKUNGAN D -->
    <rect x="236" y="214" width="16" height="84" rx="8" fill="#38d6ff" opacity="0.95"/>
    <rect x="268" y="196" width="16" height="120" rx="8" fill="#ffffff"/>
    <rect x="300" y="226" width="16" height="60" rx="8" fill="#00bcff" opacity="0.9"/>
  </g>
</svg>`;

async function generateAssets() {
  const publicDir = path.join(__dirname, '..', 'public');
  const distDir = path.join(__dirname, '..', 'dist');

  // SIMPAN FILE SVG MURNI
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgContent);

  const targets = [
    { name: 'logo.png', size: 512 },
    { name: 'logo-192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'logo-64.png', size: 64 },
    { name: 'favicon-32.png', size: 32 },
  ];

  for (const t of targets) {
    const buffer = await sharp(Buffer.from(svgContent))
      .resize(t.size, t.size)
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(publicDir, t.name), buffer);
    if (fs.existsSync(distDir)) {
      try {
        fs.writeFileSync(path.join(distDir, t.name), buffer);
      } catch (e) {}
    }
  }

  // BUAT JUGA FAVICON.ICO DARI 32px BUFFER
  const fav32 = await sharp(Buffer.from(svgContent)).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), fav32);
  if (fs.existsSync(distDir)) {
    try {
      fs.writeFileSync(path.join(distDir, 'favicon.ico'), fav32);
    } catch (e) {}
  }

  console.log('SEMUA ASSET LOGO BARU BERHASIL DIBUAT DENGAN SEMPURNA!');
}

generateAssets().catch(console.error);
