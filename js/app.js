/* 江山 · 五代十国疆域时序
 * 纯前端渲染：SVG 底图 + 按年代生效的疆域多边形 + 连续时间轴
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 840, H = 1000;
  const B = GEO.bounds;
  const S = ATLAS.span;
  const TOTAL = S.end - S.start;

  const proj = (lon, lat) => [
    ((lon - B.lon0) / (B.lon1 - B.lon0)) * W,
    ((B.lat1 - lat) / (B.lat1 - B.lat0)) * H
  ];
  const pathOf = (pts, close) => pts.map((p, i) => {
    const [x, y] = proj(p[0], p[1]);
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ') + (close ? ' Z' : '');

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Chaikin 角切平滑：让示意性多边形/海岸线的折角变圆润（只影响显示，不改数据）
  function chaikin(pts, iters) {
    let arr = pts.map(q => [q[0], q[1]]);
    for (let k = 0; k < (iters || 2); k++) {
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i], b = arr[(i + 1) % arr.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      arr = out;
    }
    return arr;
  }

  const $ = (sel) => document.querySelector(sel);
  const THEME_KEY = 'atlas-theme';
  const isSand = () => (document.body.dataset.theme || 'sand') === 'sand';
  function applyTheme(t) {
    document.body.dataset.theme = t;
    const seal = document.querySelector('.brand .seal');
    if (seal) seal.textContent = t === 'sand' ? '沙盘' : '疆域时序';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
    if (gTerritory) renderAll();
  }
  const regimeById = {};
  ATLAS.regimes.forEach(r => { regimeById[r.id] = r; });

  const state = {
    year: S.start,
    playing: false,
    timer: null,
    selected: null,
    layers: { places: true, rivers: true, marks: true, neighbors: true }
  };
  const lastChg = { gained: [], lost: [] };

  /* ---------------- 静态底图 ---------------- */
  let gStatic, gTerrRaster, gLakeTop, gTerrGain, gTerrHover, gTerritory, gLabels, gPlaces, gEventDots, gZoom;
  let terrHit = null;

  function buildMap() {
    const host = $('#map');
    const svg = svgEl('svg', {
      id: 'stage', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'img',
      'aria-label': '五代十国疆域示意地图'
    }, host);

    const defs = svgEl('defs', {}, svg);
    defs.innerHTML =
      '<filter id="paper" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>' +
      '<feColorMatrix in="n" type="saturate" values="0"/>' +
      '<feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer>' +
      '<feBlend in="SourceGraphic" mode="multiply"/></filter>' +
      '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">' +
      '<line x1="0" y1="0" x2="0" y2="6" stroke="#8a7a5c" stroke-width="0.6" opacity="0.35"/></pattern>' +
      '<filter id="ink" x="-6%" y="-6%" width="112%" height="112%">' +
      '<feDropShadow dx="0" dy="0.4" stdDeviation="1.1" flood-color="#463726" flood-opacity="0.32"/></filter>';

    gZoom = svgEl('g', { id: 'zoom' }, svg);
    gStatic = svgEl('g', { id: 'static' }, gZoom);

    // 海
    svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'sea' }, gStatic);
    // 陆块
    svgEl('path', { d: pathOf(chaikin(GEO.coastline, 1), true), class: 'land' }, gStatic);
    try {
      const clip = document.createElementNS(NS, 'clipPath');
      clip.setAttribute('id', 'landclip');
      const cp = document.createElementNS(NS, 'path');
      cp.setAttribute('d', pathOf(chaikin(GEO.coastline, 1), true));
      clip.appendChild(cp);
      defs.appendChild(clip);
      const gc = svgEl('g', { class: 'contour', 'clip-path': 'url(#landclip)' }, gStatic);
      [[110, 35, 34], [118, 30, 26], [106, 40, 24]].forEach(([lon, lat, R]) => {
        const [cx, cy] = proj(lon, lat);
        for (let k = 6; k <= R; k += 4) {
          const e = document.createElementNS(NS, 'ellipse');
          e.setAttribute('cx', cx.toFixed(1)); e.setAttribute('cy', cy.toFixed(1));
          e.setAttribute('rx', (k * 13).toFixed(1)); e.setAttribute('ry', (k * 9).toFixed(1));
          e.setAttribute('transform', 'rotate(' + (-12 + k) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')');
          gc.appendChild(e);
        }
      });
    } catch (e) { }
    // 被简化海岸包住的海湾
    GEO.seas.forEach(s => svgEl('path', { d: pathOf(s.pts, true), class: 'sea-inner' }, gStatic));
    // 岛屿
    GEO.islands.forEach(i => svgEl('path', { d: pathOf(i.pts, true), class: 'land' }, gStatic));

    // 经纬网
    const grat = svgEl('g', { class: 'grat' }, gStatic);
    for (let lon = 102; lon <= 124; lon += 2) {
      const [x1, y1] = proj(lon, B.lat0), [x2, y2] = proj(lon, B.lat1);
      svgEl('line', { x1, y1, x2, y2 }, grat);
    }
    for (let lat = 18; lat <= 42; lat += 2) {
      const [x1, y1] = proj(B.lon0, lat), [x2, y2] = proj(B.lon1, lat);
      svgEl('line', { x1, y1, x2, y2 }, grat);
    }

    // 河湖
    const gRiver = svgEl('g', { class: 'rivers' }, gStatic);
    GEO.rivers.forEach(r => {
      svgEl('path', { d: pathOf(r.pts, false), class: 'river ' + r.cls }, gRiver);
    });
    state.riverGroup = gRiver;

    // 山脉与地理注记
    const gMark = svgEl('g', { class: 'marks' }, gStatic);
    GEO.mountains.forEach(m => {
      const [x, y] = proj(m.at[0], m.at[1]);
      const t = svgEl('text', { x, y, class: 'mtn' }, gMark);
      t.textContent = '⛰ ' + m.name;
    });
    GEO.geoMarks.forEach(m => {
      const [x, y] = proj(m.at[0], m.at[1]);
      const t = svgEl('text', { x, y, class: 'geolabel' }, gMark);
      t.textContent = m.name;
    });
    GEO.seaLabels.forEach(m => {
      const [x, y] = proj(m.at[0], m.at[1]);
      const t = svgEl('text', { x, y, class: 'sealabel' }, gMark);
      t.textContent = m.name;
    });
    state.markGroup = gMark;

    gTerrRaster = svgEl('g', { id: 'terr-raster' }, gZoom);
    gLakeTop = svgEl('g', { id: 'lakes-top' }, gZoom);
    GEO.lakes.forEach(l => {
      svgEl('path', { d: pathOf(l.pts, true), class: 'lake' }, gLakeTop);
    });
    gTerrGain = svgEl('g', { id: 'terr-gain' }, gZoom);
    gTerrHover = svgEl('g', { id: 'terr-hover' }, gZoom);
    gTerritory = svgEl('g', { id: 'territories' }, gZoom);
    gLabels = svgEl('g', { id: 'regime-labels' }, gZoom);
    gPlaces = svgEl('g', { id: 'places' }, gZoom);
    gEventDots = svgEl('g', { id: 'event-dots' }, gZoom);

    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'frame', filter: 'url(#paper)' }));

    buildPlaces();
    bindPanZoom(svg);
    bindMapHit(svg);
    return svg;
  }

  let placeEls = [];
  function buildPlaces() {
    gPlaces.innerHTML = '';
    placeEls = [];
    // 先画所有点位，再按重要性放标签，做简易避让（避免江南一带文字叠在一起）
    const boxes = [];
    const ordered = ATLAS.cities.slice().sort((a, b) => {
      const ra = a.rank || (a.type === 'capital' ? 1 : 2);
      const rb = b.rank || (b.type === 'capital' ? 1 : 2);
      return ra - rb;
    });
    ordered.forEach(c => {
      const [x, y] = proj(c.lon, c.lat);
      const rank = c.rank || (c.type === 'capital' ? 1 : 2);
      const g = svgEl('g', { class: 'place ' + c.type + ' rank' + rank, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` }, gPlaces);
      if (c.type === 'capital') svgEl('circle', { r: 5.2 }, g);
      else svgEl('rect', { x: -2.4, y: -2.4, width: 4.8, height: 4.8 }, g);
      if (c.type === 'capital') svgEl('circle', { r: 9.5, class: 'halo' }, g);
      const fs2 = rank === 1 ? 13.5 : rank === 2 ? 12 : 10.8;
      const w = c.name.length * fs2 * 1.02 + 6, h = fs2 + 3;
      const lx = 8, ly = -h / 2;
      const box = { x: x + lx, y: y + ly, w: w, h: h };
      const hit = boxes.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y);
      if (rank === 1 || !hit) {
        const label = svgEl('text', { x: lx, y: 4, class: 'place-label' }, g);
        label.textContent = c.name;
        boxes.push(box);
      }
      const title = svgEl('title', {}, g);
      title.textContent = c.name + (c.alt ? '（' + c.alt + '）' : '') + '　' + c.note;
      placeEls.push(g);
    });
  }

  /* ---------------- 疆域渲染 ---------------- */
  function territoriesAt(year) {
    return ATLAS.territories
      .filter(t => t.from <= year && year < t.to && regimeById[t.regime])
      .filter(t => state.layers.neighbors || t.regime === 'liao' || regimeById[t.regime].type !== 'neighbor')
      .sort((a, b) => (a.z || 0) - (b.z || 0));
  }

  function activeRegimes(year) {
    const seen = new Map();
    territoriesAt(year).forEach(t => {
      const prev = seen.get(t.regime) || 0;
      seen.set(t.regime, prev + t.polys.length);
    });
    return Array.from(seen.keys()).map(id => regimeById[id]);
  }

  /* 疆域栅格化：逐像素判定归属（按 z 顺序取最上层政权），空隙按最近政权补齐，
   * 再统一描边。这样能消除多边形之间的缝隙与重叠，让边界连续、清晰。
   */
  const RSCALE = 1.5;
  function paintTerritoryRaster(list, gained) {
    if (!gTerrRaster) return;
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const cw = Math.round(W * RSCALE), ch = Math.round(H * RSCALE), N = cw * ch;
    const canvas = gTerrRaster._canvas || (gTerrRaster._canvas = document.createElement('canvas'));
    const maskC = gTerrRaster._mask || (gTerrRaster._mask = document.createElement('canvas'));
    canvas.width = maskC.width = cw; canvas.height = maskC.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const mctx = maskC.getContext('2d', { willReadFrequently: true });

    // 陆块掩膜
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, cw, ch);
    mctx.scale(RSCALE, RSCALE); mctx.fillStyle = '#fff';
    mctx.beginPath();
    GEO.coastline.forEach((q, i) => { const [x, y] = proj(q[0], q[1]); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
    mctx.closePath(); mctx.fill();
    (GEO.islands || []).forEach(is => {
      mctx.beginPath();
      (is.pts || []).forEach((q, i) => { const [x, y] = proj(q[0], q[1]); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
      mctx.closePath(); mctx.fill();
    });
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    const md = mctx.getImageData(0, 0, cw, ch).data;
    const land = new Uint8Array(N);
    for (let i = 0; i < N; i++) land[i] = md[i * 4 + 3] > 96 ? 1 : 0;

    const smoothed = list.map(t2 => ({ regime: t2.regime, z: t2.z, polys: t2.polys.map(poly => chaikin(poly, 2)) }));
    // 政权编号与调色（按 z 从下到上）
    const ordered = smoothed.slice().sort((x, y) => (x.z || 0) - (y.z || 0));
    const idx = new Map(), seq = [];
    ordered.forEach(t2 => { if (!idx.has(t2.regime)) { idx.set(t2.regime, seq.length + 1); seq.push(t2.regime); } });
    const pal = seq.map(id => {
      const hex = (regimeById[id] || {}).color || '#999999';
      return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    });

    // 1) 用调色板实色绘制各政权多边形（后画的覆盖先画的）
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch);
    ctx.scale(RSCALE, RSCALE);
    ordered.forEach(t2 => {
      const i2 = idx.get(t2.regime), c = pal[i2 - 1];
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      t2.polys.forEach(poly => {
        ctx.beginPath();
        poly.forEach((q, i) => { const [x, y] = proj(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath(); ctx.fill();
      });
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dd = ctx.getImageData(0, 0, cw, ch).data;

    // 2) 颜色量化查表 → 最近调色；避免抗锯齿产生的“伪编号”
    const LUT = new Int16Array(4096);
    for (let k = 0; k < 4096; k++) {
      const r = ((k >> 8) & 15) * 17, g = ((k >> 4) & 15) * 17, b = (k & 15) * 17;
      let best = -1, bd2 = 1e9;
      for (let j = 0; j < pal.length; j++) {
        const dr = r - pal[j][0], dg = g - pal[j][1], db = b - pal[j][2];
        const d2 = dr * dr + dg * dg + db * db;
        if (d2 < bd2) { bd2 = d2; best = j; }
      }
      LUT[k] = best + 1;
    }
    const ids = new Int16Array(N);
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      const a = dd[i * 4 + 3];
      if (a < 110) continue;
      const key = ((dd[i * 4] >> 4) << 8) | ((dd[i * 4 + 1] >> 4) << 4) | (dd[i * 4 + 2] >> 4);
      ids[i] = LUT[key];
    }

    // 3) 空隙用最近政权补齐（多源 BFS）
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (ids[i]) q[qt++] = i;
    while (qh < qt) {
      const i = q[qh++], v = ids[i], x = i % cw;
      if (x > 0 && land[i - 1] && !ids[i - 1]) { ids[i - 1] = v; q[qt++] = i - 1; }
      if (x < cw - 1 && land[i + 1] && !ids[i + 1]) { ids[i + 1] = v; q[qt++] = i + 1; }
      if (i >= cw && land[i - cw] && !ids[i - cw]) { ids[i - cw] = v; q[qt++] = i - cw; }
      if (i < N - cw && land[i + cw] && !ids[i + cw]) { ids[i + cw] = v; q[qt++] = i + cw; }
    }

    // 3.5) 清理孤立碎片：面积很小的同色块并入相邻政权
    {
      const seen = new Uint8Array(N);
      const st = new Int32Array(N);
      const small = [];
      for (let i = 0; i < N; i++) {
        if (!ids[i] || seen[i]) continue;
        const v = ids[i]; let sp = 0; st[sp++] = i; seen[i] = 1;
        const pix = [];
        while (sp) {
          const j = st[--sp]; pix.push(j);
          const x = j % cw;
          if (x > 0 && ids[j - 1] === v && !seen[j - 1]) { seen[j - 1] = 1; st[sp++] = j - 1; }
          if (x < cw - 1 && ids[j + 1] === v && !seen[j + 1]) { seen[j + 1] = 1; st[sp++] = j + 1; }
          if (j >= cw && ids[j - cw] === v && !seen[j - cw]) { seen[j - cw] = 1; st[sp++] = j - cw; }
          if (j < N - cw && ids[j + cw] === v && !seen[j + cw]) { seen[j + cw] = 1; st[sp++] = j + cw; }
        }
        if (pix.length < 2200) small.push({ v: v, pix: pix });
      }
      small.forEach(c => {
        const cnt = {};
        c.pix.forEach(j => {
          const x = j % cw;
          [x > 0 ? j - 1 : -1, x < cw - 1 ? j + 1 : -1, j >= cw ? j - cw : -1, j < N - cw ? j + cw : -1].forEach(k => {
            if (k >= 0 && ids[k] && ids[k] !== c.v) cnt[ids[k]] = (cnt[ids[k]] || 0) + 1;
          });
        });
        let best = 0, bn = 0;
        for (const k in cnt) if (cnt[k] > bn) { bn = cnt[k]; best = +k; }
        if (best) c.pix.forEach(j => { ids[j] = best; });
      });
    }

    terrHit = { ids: ids, seq: seq, cw: cw, ch: ch };

    // 4) 直接合成最终像素：填色 + 边界
    const gainedSet = new Set((gained || []).map(gid => idx.get(gid)));
    const out = ctx.createImageData(cw, ch), od = out.data;
    const dimAll = state.selected;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x, o = i * 4;
        if (!land[i]) continue;
        const v = ids[i];
        const coast = x >= cw - 1 || y >= ch - 1 || !land[i + 1] || !land[i + cw];
        const right = x < cw - 1 ? ids[i + 1] : 0;
        const down = y < ch - 1 ? ids[i + cw] : 0;
        let r = 0, g = 0, b = 0, a = 0;
        const dark = isSand();
        if (coast) { if (dark) { r = 232; g = 216; b = 182; a = 210; } else { r = 66; g = 48; b = 28; a = 225; } }
        else if (v !== right || v !== down) {
          const selId = state.selected ? idx.get(state.selected) : 0;
          if (selId && v === selId) { r = 226; g = 96; b = 74; a = 245; }
          else if (gainedSet.has(v)) { r = 226; g = 96; b = 74; a = 235; }
          else if (dark) { r = 224; g = 208; b = 174; a = 150; }
          else { r = 62; g = 46; b = 28; a = 205; }
        } else if (v) {
          const c = pal[v - 1];
          r = c[0]; g = c[1]; b = c[2];
          a = dimAll && seq[v - 1] !== dimAll ? (isSand() ? 22 : 28) : (isSand() ? 190 : 172);
        }
        if (a) { od[o] = r; od[o + 1] = g; od[o + 2] = b; od[o + 3] = a; }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.putImageData(out, 0, 0);

    const url = canvas.toDataURL('image/png');
    let img = gTerrRaster.querySelector('image');
    if (!img) img = svgEl('image', { x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none', 'pointer-events': 'none' }, gTerrRaster);
    img.setAttribute('href', url);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
  }

  function renderTerritories(year) {
    gTerritory.innerHTML = '';
    gLabels.innerHTML = '';
    const list = territoriesAt(year);

    // 同一政权的多块多边形合成一条 path（nonzero 填充），重叠处不会叠加两次色，接缝自然消失
    const groups = new Map();
    list.forEach(t => {
      if (!groups.has(t.regime)) groups.set(t.regime, { regime: regimeById[t.regime], ds: [], polys: [] });
      const g = groups.get(t.regime);
      t.polys.forEach(poly => { g.ds.push(pathOf(poly, true)); g.polys.push(poly); });
    });

    // 与上一年对比：本年新出现 / 退出的政权
    const prevRegs = new Set(territoriesAt(year - 1).map(t => t.regime));
    const curRegs = new Set(groups.keys());
    lastChg.gained = [...curRegs].filter(id => !prevRegs.has(id));
    lastChg.lost = [...prevRegs].filter(id => !curRegs.has(id));
    if (year === S.start) { lastChg.gained = []; lastChg.lost = []; }

    paintTerritoryRaster(list, lastChg.gained);
    gTerrHover.innerHTML = '';
    gTerrGain.innerHTML = '';

    // 政权名标注：取该政权所有顶点的平均位置
    groups.forEach(g => {
      const all = [].concat.apply([], g.polys);
      let sx = 0, sy = 0;
      all.forEach(pt => { sx += pt[0]; sy += pt[1]; });
      const [x, y] = proj(sx / all.length, sy / all.length);
      const ly = y - 6;
      const dim = state.selected && state.selected !== g.regime.id;
      const txt = svgEl('text', { x, y: ly, class: 'regime-label' + (dim ? ' dim' : '') }, gLabels);
      txt.textContent = g.regime.name;
      txt.style.fill = g.regime.color;
    });
  }

  /* ---------------- 提示框 ---------------- */
  const tip = () => $('#tip');
  function showTip(ev, r, year) {
    const t = tip();
    const cap = r.capital && r.capital !== '—' ? '　都 ' + r.capital : '';
    t.innerHTML = `<b style="color:${r.color}">${r.name}</b>${cap}<br><span class="tip-sub">${r.founded.year}–${r.ended.year}　${r.founded.by}建</span>`;
    t.hidden = false;
    moveTip(ev);
  }
  function moveTip(ev) {
    const t = tip();
    const pad = 14;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { tip().hidden = true; }

  /* ---------------- 侧栏 ---------------- */
  const GAN = '甲乙丙丁戊己庚辛壬癸';
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  const ganzhi = (y) => GAN[(y - 4) % 10] + ZHI[(y - 4) % 12];

  function eraAt(year) {
    const e = ATLAS.eras.filter(e => e.from <= year && year < e.to).pop();
    if (!e) return null;
    const r = regimeById[e.regime];
    const n = year - e.from + 1;
    return { text: `${r.name}·${e.name}${n === 1 ? '元' : ''}年`, regime: r };
  }

  function eventsAt(year) {
    return ATLAS.events.filter(e => e.year === year);
  }

  function renderSidebar() {
    const y = state.year;
    $('#year-big').textContent = y;
    $('#year-ganzhi').textContent = ganzhi(y) + '年';
    const era = eraAt(y);
    $('#era-line').textContent = era ? era.text : '（年号未详）';

    const evs = eventsAt(y);
    const box = $('#events');
    // 事件文本里出现的人物，做成可点击的小标签（点开人物视图）
    const mention = (text) => {
      const hits = [];
      for (let i = 0; i < PEOPLE.length && hits.length < 5; i++) {
        if (text.indexOf(PEOPLE[i].n) >= 0) hits.push(PEOPLE[i]);
      }
      return hits;
    };
    box.innerHTML = evs.length
      ? evs.map(e => {
        const people = mention(e.text);
        const chips = people.length
          ? `<span class="ev-people">${people.map(p => `<button class="ev-person" data-p="${p.id}">${p.n}</button>`).join('')}</span>`
          : '';
        return `<div class="event"><span class="dot"></span><p>${e.text}${chips}<span class="ev-src">${e.src || ''}</span></p></div>`;
      }).join('')
      : `<div class="event muted"><p>本年无大事条目。拖动时间轴查看疆域变动。</p></div>`;
    box.querySelectorAll('[data-p]').forEach(b => {
      b.addEventListener('click', () => {
        if (window.PeopleView) window.PeopleView.focus(b.getAttribute('data-p'));
      });
    });
    box.querySelectorAll('p').forEach(pp => {
      pp.addEventListener('click', (ev) => {
        if (ev.target.closest && ev.target.closest('[data-p]')) return;
        pp.classList.toggle('open');
      });
    });

    const list = $('#regime-list');
    if (state.selected) {
      const r = regimeById[state.selected];
      list.innerHTML = regimeDetail(r, y);
      list.querySelector('.back').addEventListener('click', () => { state.selected = null; renderAll(); });
      list.querySelectorAll('.ruler-row').forEach(row => {
        row.addEventListener('click', () => {
          const yr = parseInt(row.getAttribute('data-start'), 10);
          if (!isNaN(yr)) setYear(yr);
        });
      });
      list.querySelectorAll('[data-person]').forEach(b => {
        b.addEventListener('click', () => {
          if (window.PeopleView) window.PeopleView.focus(b.getAttribute('data-person'));
        });
      });
    } else {
      const act = activeRegimes(y);
      list.innerHTML = act.map(r => {
        const n = (r.rulers || []).length;
        return `<button class="regime-chip" data-id="${r.id}">
          <span class="swatch" style="background:${r.color}"></span>
          <span class="nm">${r.name}</span>
          <span class="meta">${r.founded.year}–${r.ended.year}</span>
        </button>`;
      }).join('');
      list.querySelectorAll('.regime-chip').forEach(b => {
        b.addEventListener('click', () => selectRegime(b.getAttribute('data-id')));
      });
    }
    renderTimelineMarks();

    // 本年疆域变化（与上一年对比）
    const tbox = $('#terr-chg');
    if (tbox) {
      const rows = [];
      lastChg.gained.forEach(id => {
        const r = regimeById[id];
        if (!r) return;
        rows.push(`<button class="chg-row gained" data-reg="${id}">
          <i style="background:${r.color}"></i><span class="chg-tag">新出现</span>${r.name}</button>`);
      });
      lastChg.lost.forEach(id => {
        const r = regimeById[id];
        if (!r) return;
        rows.push(`<button class="chg-row lost" data-reg="${id}">
          <i style="background:${r.color}"></i><span class="chg-tag">退出</span>${r.name}</button>`);
      });
      tbox.innerHTML = rows.length ? rows.join('')
        : '<div class="chg-row muted">本年与上年相同，无政权增减。</div>';
      tbox.querySelectorAll('[data-reg]').forEach(b => {
        b.addEventListener('click', () => selectRegime(b.getAttribute('data-reg')));
      });
    }
  }

  function regimeDetail(r, year) {
    const rows = (r.rulers || []).map(x => {
      const m = /(\d{3,4})/.exec(x.years || '');
      return `<tr class="ruler-row" data-start="${m ? m[1] : ''}" title="点击跳转到该年">
        <td class="rn">${x.name}</td><td class="ry">${x.years}</td></tr>
      <tr class="note-row"><td colspan="2">${x.note}</td></tr>`;
    }).join('');
    const people = PEOPLE.filter(p => p.r === r.id);
    const peopleBlock = people.length
      ? `<div class="r-people"><span class="p-rels-title">收录人物</span>${people.map(p =>
        `<button class="rel-item" data-person="${p.id}"><span class="rt">${(p.tags || [])[0] || '人物'}</span>${p.n}</button>`).join('')}</div>`
      : '';
    return `<div class="detail">
      <button class="back">← 返回本年政权</button>
      <h3 style="color:${r.color}">${r.name}<small>${r.full}</small></h3>
      <dl>
        <dt>起止</dt><dd>${r.founded.year} — ${r.ended.year}　（${r.ended.how}）</dd>
        <dt>建者</dt><dd>${r.founded.by}</dd>
        <dt>都城</dt><dd>${r.capital}</dd>
        <dt>本年</dt><dd>${year} 年${r.founded.year <= year && year <= r.ended.year ? '·立国中' : '·不在其年'}</dd>
      </dl>
      <p class="sum">${r.summary}</p>
      <table class="rulers"><thead><tr><th>君主</th><th>在位</th></tr></thead><tbody>${rows}</tbody></table>
      ${peopleBlock}
      <p class="src">史料：${(r.sources || []).join('、')}</p>
    </div>`;
  }

  function selectRegime(id) {
    state.selected = id;
    renderAll();
  }

  /* ---------------- 时间轴 ---------------- */
  function buildTimeline() {
    const ticks = $('#ticks');
    ticks.innerHTML = '';
    for (let y = S.start; y <= S.end; y++) {
      const isDec = y % 10 === 0 || y === S.start;
      const hasEvent = ATLAS.events.some(e => e.year === y);
      const d = document.createElement('div');
      d.className = 'tick' + (isDec ? ' decade' : '') + (hasEvent ? ' has-event' : '');
      d.style.left = ((y - S.start) / TOTAL) * 100 + '%';
      if (isDec) {
        const lb = document.createElement('span');
        lb.className = 'tick-label';
        lb.textContent = y;
        d.appendChild(lb);
      }
      d.addEventListener('click', () => setYear(y));
      ticks.appendChild(d);
    }
    const evTrack = $('#event-track');
    evTrack.innerHTML = '';
    // 按年聚合：一年一个点，点大小随条目数变化，避免 400+ 条时挤成一团
    const perYear = {};
    ATLAS.events.forEach(e => { perYear[e.year] = (perYear[e.year] || 0) + 1; });
    Object.keys(perYear).map(Number).sort((a, b) => a - b).forEach(y => {
      const n = perYear[y];
      const b = document.createElement('button');
      b.className = 'evdot';
      b.style.left = ((y - S.start) / TOTAL) * 100 + '%';
      b.style.transform = 'rotate(45deg) scale(' + (0.72 + Math.min(n, 10) * 0.09).toFixed(2) + ')';
      b.title = y + ' 年：' + n + ' 条大事';
      b.addEventListener('click', () => setYear(y));
      evTrack.appendChild(b);
    });

    // 中原王朝分期色带（梁唐晋汉周宋）
    const band = $('#dynasty-band');
    if (band) {
      band.innerHTML = '';
      const dynasties = [
        ['tang', '唐'], ['houliang', '梁'], ['houtang', '唐'], ['houjin', '晋'],
        ['houhan', '汉'], ['houzhou', '周'], ['song', '宋']
      ];
      dynasties.forEach(([id, short]) => {
        const r = regimeById[id];
        if (!r) return;
        ATLAS.territories.filter(t => t.regime === id).forEach(t => {
          const a = Math.max(t.from, S.start), b = Math.min(t.to, S.end + 1);
          if (b <= a) return;
          const seg = document.createElement('button');
          seg.type = 'button';
          seg.className = 'dyn-seg';
          seg.style.left = ((a - S.start) / TOTAL) * 100 + '%';
          seg.style.width = ((b - a) / TOTAL) * 100 + '%';
          seg.style.background = r.color;
          seg.title = r.name + '　' + a + '–' + (b - 1);
          seg.textContent = (b - a) >= 6 ? short : '';
          seg.addEventListener('click', () => { pause(); setYear(a); });
          band.appendChild(seg);
        });
      });
      // 改朝换代年的细标
      [907, 923, 936, 947, 951, 960].forEach(y => {
        const m = document.createElement('span');
        m.className = 'dyn-mark';
        m.style.left = ((y - S.start) / TOTAL) * 100 + '%';
        m.title = y + ' 年改朝换代';
        band.appendChild(m);
      });
    }
  }

  function renderTimelineMarks() {
    const pct = ((state.year - S.start) / TOTAL) * 100;
    $('#thumb').style.left = pct + '%';
    $('#fill').style.width = pct + '%';
    $('#slider').value = state.year;
  }

  function setYear(y) {
    y = Math.max(S.start, Math.min(S.end, Math.round(y)));
    if (y === state.year) { renderTimelineMarks(); return; }
    state.year = y;
    renderAll();
    document.dispatchEvent(new CustomEvent('atlas:year', { detail: { year: state.year } }));
    if (window.history && history.replaceState) {
      const v = document.body.dataset.view || 'map';
      try { history.replaceState(null, '', `#view=${v}&year=${state.year}`); } catch (e) { }
    }
  }

  function renderAll() {
    renderTerritories(state.year);
    renderSidebar();
    renderEventDots();
    renderPlacesVisibility();
    renderLegend();
  }

  function renderEventDots() {
    gEventDots.innerHTML = '';
    eventsAt(state.year).forEach(e => {
      if (!e.place) return;
      const [x, y] = proj(e.place[0], e.place[1]);
      const g = svgEl('g', { class: 'evmark', transform: `translate(${x},${y})` }, gEventDots);
      svgEl('circle', { r: 12, class: 'pulse' }, g);
      svgEl('circle', { r: 4.5, class: 'core' }, g);
    });
  }

  function renderPlacesVisibility() {
    gPlaces.style.display = state.layers.places ? '' : 'none';
    state.riverGroup.style.display = state.layers.rivers ? '' : 'none';
    state.markGroup.style.display = state.layers.marks ? '' : 'none';
  }

  function renderLegend() {
    const act = activeRegimes(state.year);
    const box = $('#legend');
    box.innerHTML = act.map(r =>
      `<button class="legend-item" data-id="${r.id}" style="--c:${r.color}">
        <i></i><span>${r.name}</span></button>`).join('');
    box.querySelectorAll('.legend-item').forEach(b => {
      b.addEventListener('click', () => selectRegime(b.getAttribute('data-id')));
    });
  }

  /* ---------------- 缩放拖拽 ---------------- */
  /* 像素命中：直接查栅格分区，保证 hover/点击与看到的填色完全一致 */
  function regimeAtPoint(svg, clientX, clientY) {
    if (!terrHit) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const px = Math.round(p.x * RSCALE), py = Math.round(p.y * RSCALE);
    if (px < 0 || py < 0 || px >= terrHit.cw || py >= terrHit.ch) return null;
    const id = terrHit.ids[py * terrHit.cw + px];
    return id ? (regimeById[terrHit.seq[id - 1]] || null) : null;
  }

  function bindMapHit(svg) {
    svg.addEventListener('pointermove', (e) => {
      const r = regimeAtPoint(svg, e.clientX, e.clientY);
      if (r) { showTip(e, r, state.year); svg.style.cursor = 'pointer'; }
      else { hideTip(); svg.style.cursor = ''; }
    });
    svg.addEventListener('pointerleave', () => { hideTip(); svg.style.cursor = ''; });
    svg.addEventListener('click', (e) => {
      if (svg._justDragged) { svg._justDragged = false; return; }
      const r = regimeAtPoint(svg, e.clientX, e.clientY);
      if (r) selectRegime(r.id);
      else if (state.selected) { state.selected = null; renderAll(); }
    });
  }

  function bindPanZoom(svg) {
    let scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0, moved = false;
    const apply = () => {
      gZoom.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
      svg.classList.toggle('far', scale < 1.35);
    };
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(1, Math.min(5, scale * k));
      if (next === scale) return;
      // 以指针为中心缩放
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * W;
      const py = (e.clientY - r.top) / r.height * H;
      tx = px - (px - tx) * (next / scale);
      ty = py - (py - ty) * (next / scale);
      scale = next;
      apply();
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const r = svg.getBoundingClientRect();
      tx += dx / r.width * W;
      ty += dy / r.height * H;
      sx = e.clientX; sy = e.clientY;
      apply();
    });
    svg.addEventListener('pointerup', () => { dragging = false; svg._justDragged = moved; });
    svg.addEventListener('pointercancel', () => { dragging = false; });
    const tb = $('#theme-btn');
    if (tb) { tb.textContent = isSand() ? '☀' : '◐'; tb.title = isSand() ? '切换到史册（浅色）' : '切换到沙盘（深色）'; }
    if (tb) tb.addEventListener('click', () => {
      applyTheme(isSand() ? 'paper' : 'sand');
      tb.textContent = isSand() ? '☀' : '◐';
      tb.title = isSand() ? '切换到史册（浅色）' : '切换到沙盘（深色）';
    });
    $('#reset-view').addEventListener('click', () => {
      scale = 1; tx = 0; ty = 0; apply();
    });
  }

  /* ---------------- 播放与交互 ---------------- */
  function play() {
    if (state.playing) { pause(); return; }
    if (state.year >= S.end) state.year = S.start;
    state.playing = true;
    $('#play').classList.add('on');
    $('#play').textContent = '❚❚ 暂停';
    state.timer = setInterval(() => {
      if (state.year >= S.end) { pause(); return; }
      // 遇大事年稍作停顿
      const ev = eventsAt(state.year + 1).length;
      setYear(state.year + 1);
      if (ev) {
        clearInterval(state.timer);
        state.timer = setTimeout(() => { if (state.playing) play(true); }, 900);
      }
    }, 520);
  }
  function pause() {
    state.playing = false;
    clearInterval(state.timer); clearTimeout(state.timer);
    state.timer = null;
    const b = $('#play');
    if (b) { b.classList.remove('on'); b.textContent = '▶ 播放'; }
  }

  function bindControls() {
    $('#slider').addEventListener('input', (e) => { pause(); setYear(+e.target.value); });
    $('#play').addEventListener('click', play);
    $('#prev').addEventListener('click', () => { pause(); setYear(state.year - 1); });
    $('#next').addEventListener('click', () => { pause(); setYear(state.year + 1); });
    document.querySelectorAll('[data-year]').forEach(b => {
      b.addEventListener('click', () => { pause(); setYear(+b.getAttribute('data-year')); });
    });
    document.querySelectorAll('[data-layer]').forEach(cb => {
      cb.addEventListener('change', () => {
        state.layers[cb.getAttribute('data-layer')] = cb.checked;
        if (cb.getAttribute('data-layer') === 'neighbors') renderAll();
        else {
          renderPlacesVisibility();
          if (gLakeTop) gLakeTop.style.display = cb.getAttribute('data-layer') === 'rivers' && !cb.checked ? 'none' : '';
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input,textarea')) return;
      if (e.key === 'ArrowLeft') { pause(); setYear(state.year - 1); }
      if (e.key === 'ArrowRight') { pause(); setYear(state.year + 1); }
      if (e.key === ' ') { e.preventDefault(); play(); }
      if (e.key === 'Escape' && state.selected) { state.selected = null; renderAll(); }
    });

  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    let savedTheme = 'sand';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'sand'; } catch (e) { }
    document.body.dataset.theme = savedTheme;
    const seal0 = document.querySelector('.brand .seal');
    if (seal0) seal0.textContent = savedTheme === 'sand' ? '沙盘' : '疆域时序';
    const wantHit = /hittest/.test(location.hash);
    buildMap();
    buildTimeline();
    bindControls();
    renderAll();

    // 供人物视图读取/设置同一条时间轴
    window.atlasGetYear = () => state.year;
    window.atlasSetYear = setYear;
    window.atlasSelectRegime = selectRegime;
    document.dispatchEvent(new CustomEvent('atlas:year', { detail: { year: state.year } }));
    // 预填搜索词（便于分享/测试）：#q=赵普
    const qm = /[#&]q=([^&]+)/.exec(location.hash);
    if (qm) {
      const inp = $('#search');
      if (inp) { inp.value = decodeURIComponent(qm[1]); inp.dispatchEvent(new Event('input')); }
    }
    // 预选人物（分享/测试）：#view=people&year=950&sel=guowei
    const sm = /[#&]sel=([\w-]+)/.exec(location.hash);
    if (sm && window.PeopleView) window.PeopleView.focus(sm[1]);
    // 预选政权（分享/测试）：#view=map&year=950&regime=houhan
    const rm = /[#&]regime=([\w-]+)/.exec(location.hash);
    if (rm) selectRegime(rm[1]);

    // 事件列表联动（链接 #year）
    const m = /year=(\d{3,4})/.exec(location.hash);
    if (m) setYear(+m[1]);

    if (wantHit) {
      setTimeout(() => {
        const svg = $('#stage');
        const pts = [[114.35, 34.80], [104.07, 30.66], [113.26, 23.13], [120.16, 30.27], [112.24, 30.33], [116.40, 39.90]];
        const names = pts.map(([lon, lat]) => {
          const [x, y] = proj(lon, lat);
          const p = svg.createSVGPoint(); p.x = x; p.y = y;
          const c = p.matrixTransform(svg.getScreenCTM());
          const r = regimeAtPoint(svg, c.x, c.y);
          return r ? r.name : '—';
        });
        document.title = 'HIT ' + names.join(' | ');
      }, 80);
    }
    const foot = $('#foot-sources');
    if (foot) foot.textContent = '史料骨架：《旧五代史》《新五代史》《资治通鉴》《十国春秋》《辽史》《宋史》；疆域分期参考谭其骧《中国历史地图集》五代十国卷。多边形为示意性简化边界，非精确测绘。';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
