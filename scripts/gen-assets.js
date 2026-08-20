import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const CANVAS = [];
function canvas(w, h) { return Array.from({ length: h }, () => new Float32Array(w).fill(0)); }
function stamp(c, x0, y0, w, h, r, color, ss = 2) {
  const cw = w * ss, chh = h * ss, cx = (x0 + w / 2) * ss, cy = (y0 + h / 2) * ss;
  const hw = w / 2 * ss, hh = h / 2 * ss, rr = r * ss;
  for (let sy = 0; sy < chh; sy++) {
    for (let sx = 0; sx < cw; sx++) {
      const qx = Math.abs(sx + 0.5 - cx) - (hw - rr);
      const qy = Math.abs(sy + 0.5 - cy) - (hh - rr);
      const d = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - rr;
      if (d <= 0) {
        const px = Math.floor((sx + x0 * ss) / ss), py = Math.floor((sy + y0 * ss) / ss);
        if (px >= 0 && py >= 0 && px < c[0].length && py < c.length) c[py][px] += color;
      }
    }
  }
}

const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['01110','00100','00100','00100','00100','00100','01110'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','10001','11001','10101','10011','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11111','00010','00100','00010','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '/': ['00001','00010','00100','01000','10000','00000','00000']
};

function text(c, str, x0, y0, scale, color) {
  let cx = x0;
  for (const ch of str) {
    const g = FONT[ch] || FONT[' '];
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (g[ry][rx] === '1') {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++)
              if (cx + rx * scale + dx < c[0].length && y0 + ry * scale + dy < c.length)
                c[y0 + ry * scale + dy][cx + rx * scale + dx] = color;
        }
      }
    }
    cx += (5 + 1) * scale;
  }
  return cx;
}

function textWidth(str, scale) { return str.length * (5 + 1) * scale - scale; }

function render(c, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = c[y][x];
      if (px) {
        out[i] = px[0]; out[i + 1] = px[1]; out[i + 2] = px[2];
      } else {
        out[i] = 0x0b; out[i + 1] = 0x12; out[i + 2] = 0x10;
      }
      out[i + 3] = 255;
    }
  }
  return out;
}

const DARK = [0x0b, 0x12, 0x10];
const SURFACE = [0x10, 0x1b, 0x17];
const BORDER = [0x22, 0x33, 0x2c];
const TEAL = [0x2f, 0xd9, 0xa3];
const AMBER = [0xf5, 0xa9, 0x2e];
const INK = [0xdc, 0xeb, 0xe5];
const MUTED = [0x7e, 0x94, 0x8c];

function makeOG() {
  const W = 1200, H = 630;
  const c = canvas(W, H);
  stamp(c, 60, 60, W - 120, H - 120, 32, SURFACE);
  stamp(c, 62, 62, W - 124, H - 124, 30, BORDER, 4);
  stamp(c, 63, 63, W - 126, H - 126, 29, SURFACE, 2);
  const s = 10;
  text(c, 'TESTERSWAP', (W - textWidth('TESTERSWAP', s)) / 2, 140, s, INK);
  text(c, '12 TESTERS - 14 DAYS', (W - textWidth('12 TESTERS - 14 DAYS', s)) / 2, 140 + 7 * s + 60, s * 0.6, MUTED);
  stamp(c, (W - 760) / 2, 400, 760, 30, 15, TEAL);
  stamp(c, (W - 760) / 2, 460, 760, 30, 15, AMBER);
  const out = encodePNG(W, H, render(c, W, H));
  writeFileSync('public/og-image.png', out);
  console.log('og-image.png', out.length, 'bytes');
}

function makeIcons() {
  for (const [name, S] of [['icon-32.png', 32], ['apple-touch-icon.png', 180]]) {
    const c = canvas(S, S);
    stamp(c, 0, 0, S, S, S * 0.22, SURFACE);
    stamp(c, 0, 0, S, S, S * 0.22, BORDER, 3);
    const inset = S * 0.18, th = S * 0.28, gap = S * 0.06;
    stamp(c, inset, inset, S - inset * 2, th, th * 0.5, TEAL);
    stamp(c, inset, inset + th + gap, S - inset * 2, th, th * 0.5, AMBER);
    writeFileSync('public/' + name, encodePNG(S, S, render(c, S, S)));
    console.log(name, 'done');
  }
}

makeOG();
makeIcons();