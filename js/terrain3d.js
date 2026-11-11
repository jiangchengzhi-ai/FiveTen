/* 真 3D 沙盘 · 核心（Three.js r147 UMD + 真实高程 data/terrain.png）
 * 提供稳定 API 给 terrain3d-pick / terrain3d-battle / terrain3d-blocks / terrain3d-historical / terrain3d-camera。
 * 与 2D / 2.5D 并存：body[data-mode="3d"] 时显示 canvas。
 */
(function () {
  'use strict';

  const W = 840, H = 1000;
  const BOUNDS = { lon0: 100, lon1: 126, lat0: 17, lat1: 43 };
  const RSCALE = 1.5;

  let renderer, scene, camera, controls, mesh, water, texture, heightGrid;
  let glWrap, labelLayer, labels = [], ready = false, running = false, raf = 0;
  let lastYear = -1;

  const frameFns = new Set();
  const yearFns = new Set();
  const enterFns = new Set();
  const exitFns = new Set();

  const api = {
    THREE: null, W, H, BOUNDS, RSCALE,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get mesh() { return mesh; },
    get wrap() { return glWrap; },
    getYear: () => year(),
    heightAt,
    lonLatToMap,
    mapToWorld,
    worldFromLonLat,
    project,
    raycast,
    pick,
    getRaster: getCanvas,
    getRasterHit,
    addObject(obj) { if (scene) scene.add(obj); },
    removeObject(obj) { if (scene) scene.remove(obj); },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    onYear(fn) { yearFns.add(fn); return () => yearFns.delete(fn); },
    onEnter(fn) { enterFns.add(fn); return () => enterFns.delete(fn); },
    onExit(fn) { exitFns.add(fn); return () => exitFns.delete(fn); }
  };

  function year() { return (window.atlasGetYear && window.atlasGetYear()) || 950; }

  function getCanvas() {
    try { return (window.AtlasMap && window.AtlasMap.getRasterCanvas) ? window.AtlasMap.getRasterCanvas() : null; } catch (e) { return null; }
  }
  function getRasterHit() {
    try { return (window.AtlasMap && window.AtlasMap.getRasterHit) ? window.AtlasMap.getRasterHit() : null; } catch (e) { return null; }
  }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  /* ---------- 坐标 ---------- */
  function lonLatToMap(lon, lat) {
    return [
      (lon - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0) * W,
      (BOUNDS.lat1 - lat) / (BOUNDS.lat1 - BOUNDS.lat0) * H
    ];
  }
  function mapToWorld(mx, my, y) {
    return new THREE.Vector3(mx - W / 2, y || 0, my - H / 2);
  }
  function worldFromLonLat(lon, lat, y) {
    const [mx, my] = lonLatToMap(lon, lat);
    return mapToWorld(mx, my, y);
  }

  /* ---------- 地形高度 ---------- */
  function heightAt(mx, my) {
    if (!heightGrid) return 0;
    const n = heightGrid.n;
    const gx = Math.max(0, Math.min(n - 1, Math.round(mx / W * (n - 1))));
    const gy = Math.max(0, Math.min(n - 1, Math.round(my / H * (n - 1))));
    return heightGrid.data[gy * n + gx] * heightGrid.scale;
  }

  /* ---------- 拾取 ---------- */
  function ndc(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 };
  }
  function raycast(clientX, clientY) {
    if (!mesh) return null;
    const p = ndc(clientX, clientY);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(p.x, p.y), camera);
    const hits = rc.intersectObject(mesh, false);
    return hits.length ? hits[0] : null;
  }
  function pick(clientX, clientY) {
    const hit = raycast(clientX, clientY);
    if (!hit || !hit.uv) return null;
    const hitInfo = getRasterHit();
    if (!hitInfo) return null;
    const u = hit.uv.x, v = hit.uv.y;
    const px = Math.round(u * hitInfo.cw);
    const py = Math.round((1 - v) * hitInfo.ch);
    let regime = null;
    if (px >= 0 && py >= 0 && px < hitInfo.cw && py < hitInfo.ch) {
      const id = hitInfo.ids[py * hitInfo.cw + px];
      if (id) regime = id;
    }
    return {
      regimeId: regime, uv: hit.uv, point: hit.point,
      mx: u * W, my: (1 - v) * H
    };
  }

  function project(vec3) {
    const v = vec3.clone().project(camera);
    const r = glWrap ? glWrap.getBoundingClientRect() : { width: 1, height: 1 };
    return { x: (v.x * .5 + .5) * r.width, y: (-v.y * .5 + .5) * r.height, visible: v.z < 1 && v.z > -1 };
  }

  /* ---------- 初始化 ---------- */
  function init() {
    if (ready) return true;
    if (!window.THREE || !THREE.WebGLRenderer) return false;
    glWrap = document.getElementById('gl-stage');
    if (!glWrap) return false;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch (e) { return false; }
    api.THREE = THREE;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    glWrap.insertBefore(renderer.domElement, glWrap.firstChild);

    labelLayer = el('div', 'gl-labels');
    glWrap.appendChild(labelLayer);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090807);
    scene.fog = new THREE.FogExp2(0x0b0a09, 0.00032);

    camera = new THREE.PerspectiveCamera(42, 1, 1, 12000);
    camera.position.set(0, 560, 880);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -10);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 260;
    controls.maxDistance = 2400;
    controls.minPolarAngle = 0.14;
    controls.maxPolarAngle = 1.36;
    controls.screenSpacePanning = true;
    api.controls = controls;

    scene.add(new THREE.HemisphereLight(0xe8dcc4, 0x14100c, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.95);
    sun.position.set(-520, 760, 420);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8fb0c8, 0.35);
    rim.position.set(600, 300, -500);
    scene.add(rim);

    const geo = new THREE.PlaneGeometry(W, H, 256, 256);
    geo.rotateX(-Math.PI / 2);
    mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.96, metalness: 0.0, transparent: true, alphaTest: 0.02
    }));
    scene.add(mesh);

    const wg = new THREE.PlaneGeometry(6000, 7000);
    wg.rotateX(-Math.PI / 2);
    water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      color: 0x0b1518, roughness: 0.5, metalness: 0.2
    }));
    water.position.y = -1.5;
    scene.add(water);

    const img = new Image();
    img.onload = () => {
      const n = img.naturalWidth;
      const c = document.createElement('canvas'); c.width = c.height = n;
      const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
      let px;
      try { px = cx.getImageData(0, 0, n, n).data; } catch (e) { return; }
      const data = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) data[i] = px[i * 4] / 255;
      heightGrid = { n, data, scale: 95 };
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        const col = Math.max(0, Math.min(n - 1, u * (n - 1)));
        const row = Math.max(0, Math.min(n - 1, (1 - v) * (n - 1)));
        const x0 = Math.floor(col), y0 = Math.floor(row), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
        const fx = col - x0, fy = row - y0;
        let h = (data[y0 * n + x0] * (1 - fx) + data[y0 * n + x1] * fx) * (1 - fy) +
                (data[y1 * n + x0] * (1 - fx) + data[y1 * n + x1] * fx) * fy;
        h = Math.pow(h, 1.6);
        pos.setY(i, h * heightGrid.scale);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      api.heightGrid = heightGrid;
    };
    img.src = window.TERRAIN_DATA_URL || 'data/terrain.png';

    updateTexture();
    buildLabels();
    resize();
    window.addEventListener('resize', resize);
    ready = true;
    return true;
  }

  function updateTexture() {
    const c = getCanvas();
    if (!c) return;
    if (!updateTexture._cv) updateTexture._cv = document.createElement('canvas');
    const cv = updateTexture._cv;
    if (cv.width !== c.width || cv.height !== c.height) { cv.width = c.width; cv.height = c.height; }
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(c, 0, 0);
    cx.drawImage(c, 0, 0);
    cx.drawImage(c, 0, 0);
    cx.drawImage(c, 0, 0);
    if (!texture) {
      texture = new THREE.CanvasTexture(cv);
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    } else {
      texture.image = cv;
      texture.needsUpdate = true;
    }
    if (lastYear !== year()) {
      lastYear = year();
      yearFns.forEach(fn => { try { fn(lastYear); } catch (e) { console.warn(e); } });
    }
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
    if (!window.ATLAS) return;
    const y = year();
    const byRegime = {};
    (ATLAS.territories || []).forEach(t => {
      if (!(t.from <= y && y < t.to)) return;
      (byRegime[t.regime] || (byRegime[t.regime] = [])).push(...t.polys);
    });
    (ATLAS.regimes || []).filter(r => byRegime[r.id]).forEach(r => {
      const c = centroid(byRegime[r.id] || []);
      if (!c) return;
      const d = el('div', 'gl-label gl-regime');
      d.textContent = r.name;
      d.style.color = r.color;
      labelLayer.appendChild(d);
      labels.push({ el: d, lon: c[0], lat: c[1] });
    });
    (ATLAS.cities || []).filter(c => c.type === 'capital').slice(0, 14).forEach(c => {
      const d = el('div', 'gl-label gl-city capital');
      d.textContent = c.name;
      labelLayer.appendChild(d);
      labels.push({ el: d, lon: c.lon, lat: c.lat });
    });
  }
  function projectLabel(l) {
    const [mx, my] = lonLatToMap(l.lon, l.lat);
    const v = new THREE.Vector3(mx - W / 2, heightAt(mx, my) + 20, my - H / 2);
    v.project(camera);
    if (v.z > 1 || v.z < -1) { l.el.style.display = 'none'; return; }
    const r = glWrap.getBoundingClientRect();
    const sx = (v.x * .5 + .5) * r.width, sy = (-v.y * .5 + .5) * r.height;
    if (sx < -100 || sx > r.width + 100 || sy < -50 || sy > r.height + 50) { l.el.style.display = 'none'; return; }
    l.el.style.display = '';
    l.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    l.el.style.opacity = (0.6 + 0.4 * Math.max(0.4, Math.min(1, 1000 / camera.position.length()))).toFixed(2);
  }

  /* ---------- 循环 ---------- */
  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    frameFns.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
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
    enterFns.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
    if (!raf) tick();
    return true;
  }
  function exit() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    document.body.classList.remove('gl-on');
    if (glWrap) glWrap.hidden = true;
    exitFns.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
  }

  document.addEventListener('atlas:year', () => {
    if (!running) return;
    updateTexture();
    buildLabels();
  });
  document.addEventListener('atlas:battle', () => {
    if (!running) return;
    // 交给 terrain3d-battle.js 监听
  });

  window.Terrain3D = { enter, exit, isRunning: () => running, api };
})();
