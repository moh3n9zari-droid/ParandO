import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(len + 12);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, len + 8));
  buf.writeUInt32BE(crc, len + 8);
  return buf;
}

function generatePNG(width, height, isMaskable = false) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // Raw image data: height rows, each with 1 filter byte + width*4 bytes
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) / 2;
  const iconRadius = isMaskable ? maxRadius * 0.72 : maxRadius * 0.85;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Gold/amber background
      if (dist <= iconRadius) {
        // Gradient effect
        const grad = Math.min(1, Math.max(0, (y / height) * 0.8 + (x / width) * 0.2));
        rawData[pxOffset] = Math.round(245 - grad * 30); // R (amber 500)
        rawData[pxOffset + 1] = Math.round(158 - grad * 40); // G
        rawData[pxOffset + 2] = 11; // B
        rawData[pxOffset + 3] = 255; // A

        // Draw 'P' symbol inside center
        const relX = (x - cx) / (iconRadius * 0.55);
        const relY = (y - cy) / (iconRadius * 0.55);
        if (
          (relX >= -0.4 && relX <= -0.15 && relY >= -0.6 && relY <= 0.6) || // vertical stem
          (relX >= -0.4 && relX <= 0.3 && relY >= -0.6 && relY <= -0.35) || // top bar
          (relX >= -0.4 && relX <= 0.3 && relY >= -0.15 && relY <= 0.1) || // mid bar
          (relX >= 0.15 && relX <= 0.4 && relY >= -0.6 && relY <= 0.1) // loop curve
        ) {
          rawData[pxOffset] = 15; // R dark slate 950
          rawData[pxOffset + 1] = 23; // G
          rawData[pxOffset + 2] = 42; // B
          rawData[pxOffset + 3] = 255;
        }
      } else if (isMaskable) {
        // Maskable padding fill
        rawData[pxOffset] = 15; // Dark slate 950
        rawData[pxOffset + 1] = 23;
        rawData[pxOffset + 2] = 42;
        rawData[pxOffset + 3] = 255;
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write PNG files
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePNG(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePNG(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePNG(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePNG(180, 180, false));

// Write SVG icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="#0f172a"/>
  <circle cx="256" cy="256" r="190" fill="url(#gold)"/>
  <path d="M210 140 h100 a65 65 0 0 1 0 130 h-60 v102 h-40 z" fill="#0f172a"/>
  <path d="M250 178 v54 h55 a27 27 0 0 0 0 -54 z" fill="url(#gold)"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg);

console.log('PWA icons successfully generated in public/ directory.');
