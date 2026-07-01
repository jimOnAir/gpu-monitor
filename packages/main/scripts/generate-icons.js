/**
 * Minimal PNG generator for tray icons.
 * Pure Node.js — no external dependencies.
 * Generates solid-color icons with a simple GPU silhouette.
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
  const combined = Buffer.concat([len, typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(combined));
  return Buffer.concat([combined, crc]);
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
  // pixels array is RGBA (4 bytes), IHDR says RGBA (4 bytes)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4; // RGBA stride
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
 * Draw a filled circle on a pixel buffer (RGBA).
 */
function fillCircle(pixels, w, h, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let py = cy - radius; py <= cy + radius; py++) {
    for (let px = cx - radius; px <= cx + radius; px++) {
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
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
 * Draw a circle outline on a pixel buffer (RGBA) — for the GPU fan.
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
 * Generate a tray icon PNG.
 * @param {number} size - Icon size in pixels (24 for Linux tray compatibility)
 * @param {number} bgR, bgG, bgB - Background fill color
 * @returns {Buffer} - PNG file data
 */
function generateIcon(size, bgR, bgG, bgB) {
  const pixels = new Uint8Array(size * size * 4); // RGBA

  // Background: colored rounded rectangle (approximated as filled rect)
  fillRect(pixels, size, size, 0, 0, size, size, bgR, bgG, bgB);

  // Slightly darker border effect (1px inner shadow)
  const borderAlpha = 40;
  fillRect(pixels, size, size, 0, 0, size, 1, 0, 0, 0, borderAlpha); // top
  fillRect(pixels, size, size, 0, size - 1, size, 1, 0, 0, 0, borderAlpha); // bottom
  fillRect(pixels, size, size, 0, 0, 1, size, 0, 0, 0, borderAlpha); // left
  fillRect(pixels, size, size, size - 1, 0, 1, size, 0, 0, 0, borderAlpha); // right

  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);

  // GPU body (shroud) — white rectangle
  const gpuX = Math.floor(size * 0.15);
  const gpuY = Math.floor(size * 0.25);
  const gpuW = Math.floor(size * 0.7);
  const gpuH = Math.floor(size * 0.42);
  fillRect(pixels, size, size, gpuX, gpuY, gpuW, gpuH, 255, 255, 255, 230);

  // GPU fan (circle outline) — dark
  const fanCx = Math.floor(size * 0.38);
  const fanCy = Math.floor(gpuY + gpuH * 0.45);
  const fanR = Math.floor(Math.min(gpuW, gpuH) * 0.38);
  drawCircleOutline(pixels, size, size, fanCx, fanCy, fanR, 15, 23, 42, 230, 1.5);

  // PCIe connector tab — white, at bottom-right of GPU body
  const pcieX = Math.floor(gpuX + gpuW * 0.55);
  const pcieY = Math.floor(gpuY + gpuH);
  const pcieW = Math.floor(gpuW * 0.35);
  const pcieH = Math.floor(size * 0.18);
  fillRect(pixels, size, size, pcieX, pcieY, pcieW, pcieH, 255, 255, 255, 230);

  return generatePng(size, size, pixels);
}

module.exports = { generateIcon };
