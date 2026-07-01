/**
 * Tray icon generator.
 * Creates colored background icons with GPU silhouette for tray use.
 *
 * Dependencies: none (uses native Node.js zlib for PNG output)
 */

const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  // PNG CRC is computed over type + data only (NOT the length field)
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function generatePng(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: raw pixel data with filter byte 0 (none) per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData[y * (1 + width * 4) + 1 + x * 4] = pixels[idx];
      rawData[y * (1 + width * 4) + 1 + x * 4 + 1] = pixels[idx + 1];
      rawData[y * (1 + width * 4) + 1 + x * 4 + 2] = pixels[idx + 2];
      rawData[y * (1 + width * 4) + 1 + x * 4 + 3] = pixels[idx + 3];
    }
  }
  const idat = zlib.deflateSync(rawData);

  const iend = Buffer.alloc(0);

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', iend)]);
}

/**
 * Draw a filled rectangle on a pixel buffer (RGBA).
 */
function fillRect(pixels, w, h, x, y, rw, rh, r, g, b, a = 255) {
  for (let py = y; py < y + rh; py++) {
    for (let px = x; px < x + rw; px++) {
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const idx = (py * w + px) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    }
  }
}

/**
 * Draw a circle outline on a pixel buffer (RGBA).
 */
function drawCircleOutline(pixels, w, h, cx, cy, radius, r, g, b, a = 255, lineWidth = 1) {
  const rOuter = radius + lineWidth / 2;
  const rInner = radius - lineWidth / 2;
  const rOuter2 = rOuter * rOuter;
  const rInner2 = rInner * rInner;
  for (let py = Math.floor(cy - rOuter); py <= Math.ceil(cy + rOuter); py++) {
    for (let px = Math.floor(cx - rOuter); px <= Math.ceil(cx + rOuter); px++) {
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const dx = px - cx;
        const dy = py - cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= rOuter2 && dist2 >= rInner2) {
          const idx = (py * w + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    }
  }
}

/**
 * Generate a tray icon PNG with colored background and GPU silhouette.
 * @param {number} size - Icon size in pixels (24 for tray)
 * @param {number} bgR, bgG, bgB - Background color
 * @param {number} accentR, accentG, accentB - GPU accent color
 * @returns {Buffer} - PNG file data
 */
function generateIcon(size, bgR, bgG, bgB, accentR = 200, accentG = 200, accentB = 200) {
  const pixels = new Uint8Array(size * size * 4);

  // Background with slight gradient (darker at edges)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const distFromCenter = Math.sqrt(
        Math.pow((x - size / 2) / (size / 2), 2) +
        Math.pow((y - size / 2) / (size / 2), 2)
      );
      const factor = Math.max(0.7, 1 - distFromCenter * 0.3);
      pixels[idx] = Math.round(bgR * factor);
      pixels[idx + 1] = Math.round(bgG * factor);
      pixels[idx + 2] = Math.round(bgB * factor);
      pixels[idx + 3] = 255;
    }
  }

  // Circular border (subtle)
  const borderR = size * 0.45;
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= borderR - 1 && dist <= borderR) {
        const idx = (y * size + x) * 4;
        pixels[idx] = Math.min(255, bgR + 30);
        pixels[idx + 1] = Math.min(255, bgG + 30);
        pixels[idx + 2] = Math.min(255, bgB + 30);
        pixels[idx + 3] = 180;
      }
    }
  }

  // GPU body (simplified geometric shape)
  const gpuW = Math.floor(size * 0.72);
  const gpuH = Math.floor(size * 0.42);
  const gpuX = Math.floor((size - gpuW) / 2);
  const gpuY = Math.floor(size * 0.24);

  // Main GPU body
  fillRect(pixels, size, size, gpuX, gpuY, gpuW, gpuH, accentR, accentG, accentB, 220);

  // GPU details - fan circles
  const fanR = Math.floor(gpuH * 0.38);
  const fan1X = Math.floor(gpuX + gpuW * 0.32);
  const fan1Y = Math.floor(gpuY + gpuH * 0.48);
  const fan2X = Math.floor(gpuX + gpuW * 0.68);
  const fan2Y = fan1Y;

  drawCircleOutline(pixels, size, size, fan1X, fan1Y, fanR, 50, 50, 50, 200, 2);
  drawCircleOutline(pixels, size, size, fan2X, fan2Y, fanR, 50, 50, 50, 200, 2);

  // PCIe connector
  const pcieW = Math.floor(gpuW * 0.42);
  const pcieH = Math.floor(size * 0.14);
  const pcieX = Math.floor(gpuX + gpuW * 0.28);
  const pcieY = Math.floor(gpuY + gpuH);
  fillRect(pixels, size, size, pcieX, pcieY, pcieW, pcieH, accentR, accentG, accentB, 180);

  return generatePng(size, size, pixels);
}

module.exports = { generateIcon };
