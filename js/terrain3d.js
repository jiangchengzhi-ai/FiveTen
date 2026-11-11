/* 真 3D 沙盘：Three.js（r147 UMD）+ 真实高程（data/terrain.png）
 * 与 2D / 2.5D 视图并存：body[data-mode="3d"] 时显示本模块的 canvas。
 * 贴图 = 当前年份的疆域栅格（复用 AtlasMap.getRasterCanvas()）。
 */
(function () {
  'use strict';

  const W = 840, H = 1000;
  const BOUNDS = { lon0: 100, lon1: 126, lat0: 17, lat1: 43 };
  let renderer, scene, camera, controls, mesh, water, texture, terrainTex, terrainData;
  let glWrap, labelLayer, labels = [], running = false, ready = false, raf = 0;
  let lastYear = null;

  const mapX = (mx) => mx - W / 2;
  const mapZ = (my) => my - H / 2;

  function getCanvas() {
    try { return (window.AtlasMap && window.AtlasMap.getRasterCanvas) ? window.AtlasMap.getRasterCanvas() : null; } catch (e) { return null; }
  }
  function year() { return (window.atlasGetYear && window.atlasGetYear()) || 950; }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  /* ---------- 初始化 ---------- */
  function init() {
    if (ready) return true;
    if (!window.THREE || !THREE.WebGLRenderer) return false;
    glWrap = document.getElementById('gl-stage');
    if (!glWrap) return false;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    glWrap.insertBefore(renderer.domElement, glWrap.firstChild);

    labelLayer = el('div', 'gl-labels');
    glWrap.appendChild(labelLayer);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090807);
    scene.fog = new THREE.FogExp2(0x0b0a09, 0.00055);

    camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
    camera.position.set(0, 560, 880);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -20);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 300;
    controls.maxDistance = 1700;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = 1.36;
    controls.screenSpacePanning = true;

    // 光照
    scene.add(new THREE.HemisphereLight(0xe8dcc4, 0x14100c, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.95);
    sun.position.set(-520, 760, 420);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8fb0c8, 0.35);
    rim.position.set(600, 300, -500);
    scene.add(rim);

    // 地形
    const geo = new THREE.PlaneGeometry(W, H, 256, 256);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.96, metalness: 0.0, transparent: true, alphaTest: 0.02
    });
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0;
    scene.add(mesh);

    // 海平面
    const wg = new THREE.PlaneGeometry(6000, 7000);
    wg.rotateX(-Math.PI / 2);
    water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      color: 0x0b1518, roughness: 0.5, metalness: 0.2
    }));
    water.position.y = -1.5;
    scene.add(water);

    // 高程纹理
    const img = new Image();
    img.onload = () => {
      // 读高程到 canvas，供顶点位移与标签取高
      const n = img.naturalWidth;
      const c = document.createElement('canvas'); c.width = c.height = n;
      const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
      try { terrainData = cx.getImageData(0, 0, n, n).data; } catch (e) { terrainData = null; }
      if (!terrainData) return;
      // 直接在几何体上位移 + 重算法线（不依赖 GPU 顶点纹理，任何设备都能看到地形）
      const geo = mesh.geometry;
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      const scale = 95;
      for (let i = 0; i < pos.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        const col = Math.max(0, Math.min(n - 1, u * (n - 1)));
        const row = Math.max(0, Math.min(n - 1, (1 - v) * (n - 1)));
        const x0 = Math.floor(col), y0 = Math.floor(row), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
        const fx = col - x0, fy = row - y0;
        const h00 = terrainData[(y0 * n + x0) * 4] / 255, h10 = terrainData[(y0 * n + x1) * 4] / 255;
        const h01 = terrainData[(y1 * n + x0) * 4] / 255, h11 = terrainData[(y1 * n + x1) * 4] / 255;
        let h = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
        h = Math.pow(h, 1.6);
        pos.setY(i, h * scale);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    };
    img.onerror = (e) => { document.body.dataset.terr = 'err'; console.log('[T3D] terrain load error'); };
    img.src = window.TERRAIN_DATA_URL || 'data/terrain.png';

    updateTexture();
    buildLabels();
    resize();
    window.addEventListener('resize', resize);
    ready = true;
    return true;
  }

  function heightAt(mx, my) {
    if (!terrainData) return 0;
    const n = 1024;
    const gx = Math.max(0, Math.min(n - 1, Math.round(mx / W * (n - 1))));
    const gy = Math.max(0, Math.min(n - 1, Math.round(my / H * (n - 1))));
    const v = terrainData[(gy * n + gx) * 4] / 255;
    return v * 95;
  }

  function updateTexture() {
    const c = getCanvas();
    if (!c) return;
    // 合成不透明贴图：海域填底色，避免透明纹理发白
    if (!updateTexture._cv) {
      updateTexture._cv = document.createElement('canvas');
      updateTexture._cv.width = c.width; updateTexture._cv.height = c.height;
    }
    const cv = updateTexture._cv;
    if (cv.width !== c.width) { cv.width = c.width; cv.height = c.height; }
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, cv.width, cv.height);
    // 画两遍提高不透明度；海域保持透明，交给水面
    cx.drawImage(c, 0, 0);
    cx.drawImage(c, 0, 0);
    cx.drawImage(c, 0, 0);
    cx.drawImage(c, 0, 0);
    const src = cv;
    if (!texture) {
      texture = new THREE.CanvasTexture(src);
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    } else if (texture.image !== c) {
      texture.image = src;
      texture.needsUpdate = true;
    }
    lastYear = year();
    updateBattlesLayer();
  }

  function resize() {
    if (!renderer || !glWrap) return;
    const r = glWrap.getBoundingClientRect();
    const w = Math.max(240, r.width), h = Math.max(240, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ---------- 标签 ---------- */
  function centroid(polys) {
    let sx = 0, sy = 0, n = 0;
    polys.forEach(p => p.forEach(pt => { sx += pt[0]; sy += pt[1]; n++; }));
    return n ? [sx / n, sy / n] : null;
  }

  function buildLabels() {
    if (!labelLayer) return;
    labelLayer.innerHTML = '';
    labels = [];
    const y = year();
    const ATLAS = window.ATLAS || {};

    // 政权名：只标当前存在、且面积/位置不重叠的
    const byRegime = {};
    (ATLAS.territories || []).forEach(t => {
      if (!(t.from <= y && y < t.to)) return;
      (byRegime[t.regime] || (byRegime[t.regime] = [])).push(...t.polys);
    });
    const regimes = (ATLAS.regimes || []).filter(r => byRegime[r.id]);
    regimes.forEach(r => {
      const c = centroid(byRegime[r.id] || []);
      if (!c) return;
      // polys 是经纬度，转成地图坐标
      let mx = c[0], my = c[1];
      if (mx < 200) {
        mx = (c[0] - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0) * W;
        my = (BOUNDS.lat1 - c[1]) / (BOUNDS.lat1 - BOUNDS.lat0) * H;
      }
      const d = el('div', 'gl-label gl-regime');
      d.textContent = r.name;
      d.style.color = r.color;
      labelLayer.appendChild(d);
      labels.push({ el: d, x: mx, y: my, regime: true });
    });

    // 州府：都城 + 重镇，最多 26 个
    const cities = (ATLAS.cities || []).filter(c => c.type === 'capital').slice(0, 14);
    cities.forEach(c => {
      const d = el('div', 'gl-label gl-city' + (c.type === 'capital' ? ' capital' : ''));
      d.textContent = c.name;
      labelLayer.appendChild(d);
      const mx = (c.lon - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0) * W;
      const my = (BOUNDS.lat1 - c.lat) / (BOUNDS.lat1 - BOUNDS.lat0) * H;
      labels.push({ el: d, x: mx, y: my, city: c });
    });
    updateBattlesLayer();
  }

  /* ---------- 战役图层（M1 预留：先不渲染） ---------- */
  function updateBattlesLayer() { /* 3D 战役箭头待 M1 */ }

  function projectLabel(l) {
    const v = new THREE.Vector3(mapX(l.x), heightAt(l.x, l.y) + 18, mapZ(l.y));
    v.project(camera);
    if (v.z > 1 || v.z < -1) { l.el.style.display = 'none'; return; }
    const r = glWrap.getBoundingClientRect();
    const sx = (v.x * 0.5 + 0.5) * r.width;
    const sy = (-v.y * 0.5 + 0.5) * r.height;
    if (sx < -80 || sx > r.width + 80 || sy < -40 || sy > r.height + 40) { l.el.style.display = 'none'; return; }
    l.el.style.display = '';
    l.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    const s = Math.max(0.55, Math.min(1.15, 900 / camera.position.length()));
    l.el.style.opacity = (0.55 + 0.45 * s).toFixed(2);
  }

  /* ---------- 渲染循环 ---------- */
  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labels.forEach(projectLabel);
  }

  function enter() {
    if (!init()) return false;
    glWrap.hidden = false;
    document.body.classList.add('gl-on');
    resize();
    running = true;
    updateTexture();
    buildLabels();
    if (!raf) tick();
    return true;
  }

  function exit() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    document.body.classList.remove('gl-on');
    if (glWrap) glWrap.hidden = true;
  }

  document.addEventListener('atlas:year', () => {
    if (!running) return;
    updateTexture();
    buildLabels();
  });

  window.Terrain3D = { enter, exit, isRunning: () => running };
})();
