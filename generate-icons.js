import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(width, height, pixels) {
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1;
      table[n] = v;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  const idat = deflateSync(Buffer.from(raw));

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function roundRect(pixels, w, h, x, y, rw, rh, r, cr, cg, cb) {
  for (let py = y; py < y + rh; py++) {
    for (let px = x; px < x + rw; px++) {
      if (px < 0 || px >= w || py < 0 || py >= h) continue;
      let inside = true;
      // Check corners
      if (px < x + r && py < y + r) {
        const dx = x + r - px, dy = y + r - py;
        if (dx*dx + dy*dy > r*r) inside = false;
      } else if (px >= x + rw - r && py < y + r) {
        const dx = px - (x + rw - r - 1), dy = y + r - py;
        if (dx*dx + dy*dy > r*r) inside = false;
      } else if (px < x + r && py >= y + rh - r) {
        const dx = x + r - px, dy = py - (y + rh - r - 1);
        if (dx*dx + dy*dy > r*r) inside = false;
      } else if (px >= x + rw - r && py >= y + rh - r) {
        const dx = px - (x + rw - r - 1), dy = py - (y + rh - r - 1);
        if (dx*dx + dy*dy > r*r) inside = false;
      }
      if (inside) {
        const i = (py * w + px) * 4;
        pixels[i] = cr; pixels[i+1] = cg; pixels[i+2] = cb; pixels[i+3] = 255;
      }
    }
  }
}

function drawArrow(pixels, w, h, cx, cy, s, dx, cr, cg, cb) {
  // Arrow: pointed shape
  const pts = dx > 0
    ? [[-3,-1],[0,-1],[0,-2],[3,0],[0,2],[0,1],[-3,1]]
    : [[3,-1],[0,-1],[0,-2],[-3,0],[0,2],[0,1],[3,1]];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // Point-in-polygon test
      let inside = false;
      const poly = pts.map(([dx2, dy2]) => [cx + dx2*s, cy + dy2*s]);
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      if (inside) {
        const i = (py * w + px) * 4;
        pixels[i] = cr; pixels[i+1] = cg; pixels[i+2] = cb; pixels[i+3] = 255;
      }
    }
  }
}

function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const s = size / 512;
  const r = Math.round(96 * s);
  
  // Background
  roundRect(pixels, size, size, 0, 0, size, size, r, 26, 31, 28);
  
  // Green bar
  const gx = Math.round(72*s), gy = Math.round(120*s);
  const bw = Math.round(368*s), bh = Math.round(100*s), br = Math.round(20*s);
  roundRect(pixels, size, size, gx, gy, bw, bh, br, 16, 185, 129);
  
  // Orange bar
  const oy = Math.round(292*s);
  roundRect(pixels, size, size, gx, oy, bw, bh, br, 245, 158, 11);
  
  // Arrow right on green bar
  const ars = Math.max(1, Math.round(40 * s));
  drawArrow(pixels, size, size, Math.round(370*s), Math.round(190*s), ars, 1, 255, 255, 255);
  
  // Arrow left on orange bar
  drawArrow(pixels, size, size, Math.round(140*s), Math.round(362*s), ars, -1, 255, 255, 255);
  
  return createPNG(size, size, pixels);
}

const sizes = [
  [16, 'icon-16.png'],
  [32, 'icon-32.png'],
  [48, 'icon-48.png'],
  [180, 'apple-touch-icon.png'],
];

for (const [size, name] of sizes) {
  const buf = generateIcon(size);
  writeFileSync(`public/${name}`, buf);
  console.log(`${name}: ${buf.length} bytes`);
}
console.log('Done');
