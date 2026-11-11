/* 真实地形数据获取：AWS Terrain Tiles（Terrarium 编码，公有领域）
 * 用法：node scripts/fetch-terrain.js [zoom] [grid]
 * 产出：data/terrain.png（8 位高程，可作 Three.js displacementMap）
 *       data/terrain.json（边界、缩放、高程范围、来源与许可）
 *       preview/terrain-relief.png（晕渲预览）
 *
 * 数据来源：AWS Open Data — Terrain Tiles (Terrarium)，底层为 SRTM / GMTED2010 / ETOPO1 等公有领域数据。
 * 说明：这是“现代地形”，与五代十国时期存在河道/海岸线差异，仅作沙盘起伏示意。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('C:/Users/12053/.dsh/profiles/node_modules/sharp');

const ROOT = path.resolve(__dirname, '..');
const Z = +(process.argv[2] || 7);
const N = +(process.argv[3] || 1024);
const B = { lon0: 100, lon1: 126, lat0: 17, lat1: 43 };
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const TILE_DIR = path.join(ROOT, 'data', '.tiles', String(Z));

const lon2x = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
};

function get(url, tries = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        if (tries > 0) return setTimeout(() => get(url, tries - 1).then(resolve, reject), 400);
        return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', (e) => {
      if (tries > 0) setTimeout(() => get(url, tries - 1).then(resolve, reject), 500);
      else reject(e);
    });
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

async function main() {
  const x0 = Math.floor(lon2x(B.lon0, Z)), x1 = Math.floor(lon2x(B.lon1, Z));
  const y0 = Math.floor(lat2y(B.lat1, Z)), y1 = Math.floor(lat2y(B.lat0, Z));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  console.log(`zoom ${Z}: tiles x ${x0}-${x1} (${nx}), y ${y0}-${y1} (${ny}) => ${nx * ny} tiles`);

  fs.mkdirSync(TILE_DIR, { recursive: true });
  const mosaic = new Float32Array(nx * 256 * ny * 256);
  const W = nx * 256, H = ny * 256;

  let done = 0;
  const tasks = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      tasks.push((async () => {
        const f = path.join(TILE_DIR, `${tx}_${ty}.png`);
        let buf;
        if (fs.existsSync(f)) buf = fs.readFileSync(f);
        else { buf = await get(TILE_URL(Z, tx, ty)); fs.writeFileSync(f, buf); }
        const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
        const C = info.channels;
        const ox = (tx - x0) * 256, oy = (ty - y0) * 256;
        for (let y = 0; y < 256; y++) {
          for (let x = 0; x < 256; x++) {
            const i = (y * 256 + x) * C;
            const elev = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
            mosaic[(oy + y) * W + (ox + x)] = elev;
          }
        }
        done++;
        if (done % 20 === 0) console.log('  tiles', done, '/', tasks.length);
      })());
    }
  }
  await Promise.all(tasks);

  // 重采样到目标网格（双线性）
  const heights = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const lat = B.lat1 - ((j + 0.5) / N) * (B.lat1 - B.lat0);
    const my = (lat2y(lat, Z) - y0) * 256;
    for (let i = 0; i < N; i++) {
      const lon = B.lon0 + ((i + 0.5) / N) * (B.lon1 - B.lon0);
      const mx = (lon2x(lon, Z) - x0) * 256;
      const x0i = Math.max(0, Math.min(W - 2, Math.floor(mx))), y0i = Math.max(0, Math.min(H - 2, Math.floor(my)));
      const fx = Math.max(0, Math.min(1, mx - x0i)), fy = Math.max(0, Math.min(1, my - y0i));
      const h00 = mosaic[y0i * W + x0i], h10 = mosaic[y0i * W + x0i + 1];
      const h01 = mosaic[(y0i + 1) * W + x0i], h11 = mosaic[(y0i + 1) * W + x0i + 1];
      heights[j * N + i] = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
    }
  }

  let hmin = 1e9, hmax = -1e9;
  for (let i = 0; i < heights.length; i++) { if (heights[i] < hmin) hmin = heights[i]; if (heights[i] > hmax) hmax = heights[i]; }
  // 海面归零、只取陆地正高程
  const sea = hmin < 0 ? 0 : hmin;
  let landMax = 1;
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < sea) heights[i] = sea;
    if (heights[i] > landMax) landMax = heights[i];
  }
  console.log('elevation min/max (m):', hmin.toFixed(1), hmax.toFixed(1));

  // 8 位高程图
  const gray = Buffer.alloc(N * N);
  for (let i = 0; i < heights.length; i++) gray[i] = Math.max(0, Math.min(255, Math.round(heights[i] / landMax * 255)));
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  await sharp(gray, { raw: { width: N, height: N, channels: 1 } }).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'data', 'terrain.png'));
  fs.writeFileSync(path.join(ROOT, 'data', 'terrain.json'), JSON.stringify({
    source: 'AWS Open Data – Terrain Tiles (Terrarium)',
    underlying: ['SRTM', 'GMTED2010', 'ETOPO1'],
    license: 'Public domain (NASA/USGS/NOAA)', zoom: Z, grid: N,
    bounds: B, elevationMin: +hmin.toFixed(1), elevationMax: +hmax.toFixed(1),
    seaLevel: 0, note: '现代地形，非五代十国时期；仅作沙盘起伏示意。'
  }, null, 2), 'utf8');

  // 晕渲预览
  const rgb = Buffer.alloc(N * N * 3);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const h = heights[k] / landMax;
      const hl = heights[j * N + Math.max(0, i - 1)] / landMax, hr = heights[j * N + Math.min(N - 1, i + 1)] / landMax;
      const hu = heights[Math.max(0, j - 1) * N + i] / landMax, hd = heights[Math.min(N - 1, j + 1) * N + i] / landMax;
      let shade = 0.55 + (hl - hr) * 6 + (hu - hd) * 6;
      shade = Math.max(0.15, Math.min(1, shade));
      let r, g, b;
      if (h <= 0.002) { r = 26; g = 44; b = 48; } // 海
      else {
        const t = Math.pow(h, 0.8);
        r = 84 + t * 150; g = 96 + t * 120; b = 66 + t * 90;
        r *= shade; g *= shade; b *= shade;
      }
      rgb[k * 3] = Math.min(255, r); rgb[k * 3 + 1] = Math.min(255, g); rgb[k * 3 + 2] = Math.min(255, b);
    }
  }
  fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
  await sharp(rgb, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'preview', 'terrain-relief.png'));
  console.log('wrote data/terrain.png, data/terrain.json, preview/terrain-relief.png');
}

main().catch(e => { console.error(e); process.exit(1); });
