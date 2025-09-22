#!/usr/bin/env node
// Generate PNG icons for the extension from a programmatic rendition
// Sizes: 16,32,48,64,128,256 → images/icon-<size>.png
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'images');
const SIZES = [16, 32, 48, 64, 128, 256];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function renderBitmap(size) {
  const width = size, height = size;
  const data = Buffer.alloc(width * height * 4, 0x00); // transparent background RGBA
  const scale = size / 500; // base design in 500x500
  const dark = [0x34, 0x3a, 0x40, 0xff];      // #343a40
  const page = [0xd8, 0xd8, 0xd8, 0xff];      // #d8d8d8

  function fillRect(x, y, w, h, c) {
    const x0 = clamp(Math.floor(x), 0, width),
          y0 = clamp(Math.floor(y), 0, height),
          x1 = clamp(Math.floor(x + w), 0, width),
          y1 = clamp(Math.floor(y + h), 0, height);
    for (let yy = y0; yy < y1; yy++) {
      let off = (yy * width + x0) * 4;
      for (let xx = x0; xx < x1; xx++) {
        data[off++] = c[0]; data[off++] = c[1]; data[off++] = c[2]; data[off++] = c[3];
      }
    }
  }
  function drawH(x1, x2, y, th, c) {
    if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }
    fillRect(x1, y - Math.round(th / 2), x2 - x1, th, c);
  }
  function drawV(x, y1, y2, th, c) {
    if (y2 < y1) { const t = y1; y1 = y2; y2 = t; }
    fillRect(x - Math.round(th / 2), y1, th, y2 - y1, c);
  }

  // Page rectangle with stroke: x=100,y=80,w=300,h=340, stroke=26
  const px = Math.round(100 * scale);
  const py = Math.round(80 * scale);
  const pw = Math.round(300 * scale);
  const ph = Math.round(340 * scale);
  const pstk = Math.max(1, Math.round(26 * scale));
  // Fill page
  fillRect(px, py, pw, ph, page);
  // Stroke
  drawH(px, px + pw, py, pstk, dark);
  drawH(px, px + pw, py + ph, pstk, dark);
  drawV(px, py, py + ph, pstk, dark);
  drawV(px + pw, py, py + ph, pstk, dark);

  // Spiral tabs (use three for clarity at tiny sizes)
  const rstk = Math.max(1, Math.round(26 * scale));
  drawH(Math.round(80 * scale), Math.round(115 * scale), Math.round(120 * scale), rstk, dark);
  drawH(Math.round(80 * scale), Math.round(115 * scale), Math.round(205 * scale), rstk, dark);
  drawH(Math.round(80 * scale), Math.round(115 * scale), Math.round(295 * scale), rstk, dark);

  // Writing lines
  const wstk = Math.max(1, Math.round(18 * scale));
  drawH(Math.round(180 * scale), Math.round(310 * scale), Math.round(200 * scale), wstk, dark);
  drawH(Math.round(180 * scale), Math.round(330 * scale), Math.round(250 * scale), wstk, dark);
  drawH(Math.round(180 * scale), Math.round(300 * scale), Math.round(300 * scale), wstk, dark);

  return { width, height, data };
}

// Minimal PNG encoder for RGBA images (no color correction, filter 0)
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([name, data]));
  crc.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, name, data, crc]);
}
function encodePNG(bmp) {
  const { width, height, data } = bmp;
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Build scanlines with filter 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0; // filter type 0
    data.copy(raw, (stride + 1) * y + 1, stride * y, stride * (y + 1));
  }
  const compressed = zlib.deflateSync(raw);
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))];
  return Buffer.concat([sig, ...chunks]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
SIZES.forEach((s) => {
  const png = encodePNG(renderBitmap(s));
  const file = path.join(OUT_DIR, `icon-${s}.png`);
  fs.writeFileSync(file, png);
  console.log('Wrote', file);
});

