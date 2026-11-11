/* 真 3D 沙盘 · 战役图层
 * 1) 当前年份战役标记：朱红菱形 + 细竖杆（扎入地形），点击打开 2D 战役复盘；
 * 2) 选中战役箭头：按当前步绘制立体曲线（attack 朱红 / flank 金 / retreat 灰蓝），
 *    已完成的前序步 30% 淡显；
 * 3) 只在 Terrain3D 进入（mode=3d）时工作，退出即清理；
 * 4) 每次重建先 dispose 旧几何/材质/贴图，再 removeObject。
 * 仅依赖 window.Terrain3D.api 与 window.BATTLES；必须在 terrain3d.js 之后加载。
 */
(function () {
  'use strict';

  const T3 = window.Terrain3D;
  if (!T3 || !T3.api) return;
  const api = T3.api;
  const THREE = window.THREE;
  if (!THREE) return;

  const COLORS = {
    marker: 0xe2604a,   // 朱红
    attack: 0xe2604a,   // 进攻：朱红
    flank: 0xd8a63e,    // 迂回：金
    retreat: 0x7e95aa   // 退却：灰蓝
  };
  const PAST_OPACITY = 0.3;   // 前序步淡显（与 2D 的 .past 一致）
  const POLE_H = 30;          // 标记杆露出地面的高度（世界单位，小偏移避免“浮空”）
  const GROUND_SINK = 22;     // 杆体向下埋入地形的深度，保证“扎到地形”
  const BASE_LIFT = 18;       // 箭头端点：地面 + 18
  const MARKER_HIT_R = 18;    // 标记点击热区半径
  const ARROW_SAMPLES = 26;

  let active = false;
  let markerRoot = null, arrowRoot = null;
  let markerHits = [], markerSpins = [];
  let builtMarkerKey = null, builtArrowKey = null;
  let heightReady = false;
  let boundDom = null;
  let down = null, lastHover = 0;
  let buildCount = 0;

  /* ---------------- 小工具 ---------------- */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // 渲染器输出 sRGB；把设计色当作 sRGB 转入线性，避免颜色被整体冲淡（朱红变粉）
  function srgb(hex) {
    const c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
  }

  function yearNow() {
    try { return api.getYear(); } catch (e) { return 950; }
  }
  function currentBattle() {
    try {
      return (window.AtlasMap && window.AtlasMap.getBattle) ? window.AtlasMap.getBattle() : null;
    } catch (e) { return null; }
  }
  function battleById(id) {
    return (window.BATTLES || []).find(function (b) { return b && b.id === id; }) || null;
  }
  function stepsOf(b) {
    return (b.steps && b.steps.length) ? b.steps : [{ name: '战况', arrows: b.arrows || [] }];
  }

  function disposeNode(o) {
    if (!o) return;
    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
    const m = o.material;
    if (m) {
      (Array.isArray(m) ? m : [m]).forEach(function (mm) {
        if (!mm) return;
        if (mm.map && mm.map.dispose) mm.map.dispose();
        if (mm.dispose) mm.dispose();
      });
    }
  }
  function clearRoot(root) {
    if (!root) return;
    root.traverse(disposeNode);
    api.removeObject(root);
  }
  function clearMarkers() {
    clearRoot(markerRoot);
    markerRoot = null;
    markerHits = [];
    markerSpins = [];
  }
  function clearArrows() {
    clearRoot(arrowRoot);
    arrowRoot = null;
  }

  /* ---------------- 地形取样 ---------------- */
  // api.heightAt 返回的是高程栅格原值；地形网格顶点实际用 pow(h,1.6) 抬升，
  // 这里按同一变换还原“看得见的地面”，避免标记/箭头浮空。拿不到高程时退回 heightAt。
  function terrainY(mx, my) {
    const raw = api.heightAt(mx, my);
    const hg = api.heightGrid;
    if (!hg || !hg.scale) return raw;
    const t = clamp(raw / hg.scale, 0, 1);
    return Math.pow(t, 1.6) * hg.scale;
  }
  // 取邻域最大值，避免山脊处杆体/箭头没入地形
  function groundNear(mx, my) {
    let h = terrainY(mx, my);
    for (let dx = -8; dx <= 8; dx += 8) {
      for (let dy = -8; dy <= 8; dy += 8) {
        const v = terrainY(mx + dx, my + dy);
        if (v > h) h = v;
      }
    }
    return h;
  }
  function anchor(lon, lat, lift) {
    const mxmy = api.lonLatToMap(lon, lat);
    const mx = mxmy[0], my = mxmy[1];
    const base = terrainY(mx, my);
    return { mx: mx, my: my, base: base, p: api.mapToWorld(mx, my, base + lift) };
  }

  /* ---------------- 战役标记 ---------------- */
  function rebuildMarkers(year, selId) {
    clearMarkers();
    const list = (window.BATTLES || []).filter(function (b) {
      return b && b.year === year && b.place && b.place.length >= 2;
    });
    if (!list.length) return;

    const root = new THREE.Group();
    root.name = 'battle-marker-root';
    list.forEach(function (b) {
      const a = anchor(b.place[0], b.place[1], 0);
      const selected = !!selId && b.id === selId;
      const g = new THREE.Group();
      g.position.set(a.p.x, a.base, a.p.z);
      g.name = 'battle-marker-' + b.id;

      // 细竖杆：从 base+POLE_H 一直埋到 base-GROUND_SINK；depthTest=false 保证不被地形吃掉
      const poleH = POLE_H + GROUND_SINK;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.35, poleH, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: srgb(COLORS.marker), transparent: true, opacity: selected ? 1 : 0.86,
          depthWrite: false, depthTest: false, fog: false
        })
      );
      pole.position.y = (POLE_H - GROUND_SINK) / 2;
      pole.renderOrder = 26;
      g.add(pole);

      // 菱形
      const r = 7 * (selected ? 1.35 : 1);
      const dia = new THREE.Mesh(
        new THREE.OctahedronGeometry(r, 0),
        new THREE.MeshBasicMaterial({
          color: srgb(COLORS.marker), transparent: true, opacity: 0.98,
          depthWrite: false, depthTest: false, fog: false
        })
      );
      dia.position.y = POLE_H;
      dia.scale.set(1, 1.35, 1);
      dia.renderOrder = 27;
      g.add(dia);
      markerSpins.push(dia);

      // 点击热区（材质不可见；Raycaster 仍能命中）
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(MARKER_HIT_R, MARKER_HIT_R, POLE_H + 24, 6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = (POLE_H + 24) / 2 - 10;
      hit.userData.battleId = b.id;
      g.add(hit);
      markerHits.push(hit);

      root.add(g);
    });

    api.addObject(root);
    markerRoot = root;
    buildCount++;
  }

  /* ---------------- 战役箭头 ---------------- */
  function makeArrow(root, arr, past) {
    if (!arr || !arr.from || !arr.to) return;
    const kind = arr.kind === 'flank' ? 'flank' : arr.kind === 'retreat' ? 'retreat' : 'attack';
    const color = COLORS[kind];
    const opacity = past ? PAST_OPACITY : 1;

    const A = anchor(arr.from[0], arr.from[1], BASE_LIFT);
    const B = anchor(arr.to[0], arr.to[1], BASE_LIFT);
    const p0 = A.p, p2 = B.p;
    const d = p2.clone().sub(p0);
    d.y = 0;
    const len = Math.max(1, d.length());

    // 横向拱起 + 抬高的控制点，避免和直线箭头/地形重叠
    const perp = new THREE.Vector3(-d.z / len, 0, d.x / len);
    const ctrl = p0.clone().add(p2).multiplyScalar(0.5);
    ctrl.addScaledVector(perp, Math.min(60, 14 + len * 0.16));
    ctrl.y += Math.min(60, 18 + len * 0.12);

    const pts = [];
    for (let i = 0; i <= ARROW_SAMPLES; i++) {
      const t = i / ARROW_SAMPLES, it = 1 - t;
      const p = new THREE.Vector3(
        it * it * p0.x + 2 * it * t * ctrl.x + t * t * p2.x,
        it * it * p0.y + 2 * it * t * ctrl.y + t * t * p2.y,
        it * it * p0.z + 2 * it * t * ctrl.z + t * t * p2.z
      );
      if (i > 0 && i < ARROW_SAMPLES) {
        const floor = groundNear(p.x + api.W / 2, p.z + api.H / 2) + BASE_LIFT + 4;
        if (p.y < floor) p.y = floor;
      }
      pts.push(p);
    }

    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const radius = past ? 1.6 : 2.8;
    const matOpts = {
      color: srgb(color), transparent: true, opacity: opacity,
      depthWrite: false, depthTest: false, fog: false
    };
    // 当前步加一道暗色描边，红箭头压在红色疆域上也能看清
    if (!past) {
      const outline = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, radius + 1.5, 6, false),
        new THREE.MeshBasicMaterial({
          color: srgb(0x140c09), transparent: true, opacity: 0.5,
          depthWrite: false, depthTest: false, fog: false
        })
      );
      outline.name = 'battle-arrow-outline';
      outline.renderOrder = 28;
      root.add(outline);
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 6, false), new THREE.MeshBasicMaterial(matOpts));
    tube.name = 'battle-arrow-' + kind;
    tube.renderOrder = 29;
    root.add(tube);

    // 小圆锥箭头（尖端落在终点）
    const tip = pts[pts.length - 1].clone();
    const dir = tip.clone().sub(pts[pts.length - 2]).normalize();
    const coneH = past ? 10 : 15;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(past ? 3.8 : 6, coneH, 10),
      new THREE.MeshBasicMaterial(matOpts)
    );
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.position.copy(tip).addScaledVector(dir, -coneH / 2);
    cone.name = 'battle-arrowhead-' + kind;
    cone.renderOrder = 30;
    root.add(cone);
  }

  function rebuildArrows(year, ref) {
    clearArrows();
    if (!ref || !ref.id) return;
    const b = battleById(ref.id);
    if (!b || b.year !== year) return;
    const steps = stepsOf(b);
    const upto = clamp(ref.step || 0, 0, steps.length - 1);
    const root = new THREE.Group();
    root.name = 'battle-arrow-root';
    for (let k = 0; k <= upto; k++) {
      const past = k < upto;
      (steps[k].arrows || []).forEach(function (arr) {
        try { makeArrow(root, arr, past); } catch (e) { console.warn('[battle3d] arrow skipped', e); }
      });
    }
    if (!root.children.length) return;
    api.addObject(root);
    arrowRoot = root;
    buildCount++;
  }

  /* ---------------- 同步 ---------------- */
  function sync(force) {
    if (!active) return;
    const year = yearNow();
    const ref = currentBattle();
    const selId = (ref && ref.id) ? ref.id : '';

    const markerKey = year + '|' + selId;
    if (force || markerKey !== builtMarkerKey) {
      rebuildMarkers(year, selId);
      builtMarkerKey = markerKey;
    }

    const arrowKey = (ref && ref.id)
      ? ref.id + ':' + clamp(ref.step || 0, 0, 99) + ':' + year
      : '';
    if (force || arrowKey !== builtArrowKey) {
      rebuildArrows(year, ref);
      builtArrowKey = arrowKey;
    }
  }

  /* ---------------- 交互：点击标记 ---------------- */
  function ndcFromEvent(e) {
    const dom = api.renderer && api.renderer.domElement;
    if (!dom) return null;
    const r = dom.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function pickMarker(e, testTerrain) {
    if (!active || !markerHits.length || !api.camera) return null;
    const ndc = ndcFromEvent(e);
    if (!ndc) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, api.camera);
    const hits = rc.intersectObjects(markerHits, false);
    if (!hits.length) return null;
    if (testTerrain && api.raycast) {
      const terrainHit = api.raycast(e.clientX, e.clientY);
      if (terrainHit && terrainHit.distance < hits[0].distance - 1) return null; // 被山体遮挡
    }
    return hits[0].object.userData.battleId || null;
  }
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e) {
    if (!active || !api.renderer) return;
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - lastHover < 60) return;
    lastHover = now;
    const id = pickMarker(e, false);
    api.renderer.domElement.style.cursor = id ? 'pointer' : '';
  }
  function onPointerLeave() {
    if (api.renderer) api.renderer.domElement.style.cursor = '';
  }
  function onPointerUp(e) {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;                       // 拖拽旋转不触发
    const id = pickMarker(e, true);
    if (!id) return;
    if (window.BattleView && window.BattleView.open) window.BattleView.open(id);
    else if (window.AtlasMap && window.AtlasMap.setBattle) window.AtlasMap.setBattle(id, 0);
  }

  function bindPointer() {
    const dom = api.renderer && api.renderer.domElement;
    if (!dom || dom === boundDom) return;
    unbindPointer();
    boundDom = dom;
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerleave', onPointerLeave);
  }
  function unbindPointer() {
    if (!boundDom) return;
    boundDom.removeEventListener('pointerdown', onPointerDown);
    boundDom.removeEventListener('pointerup', onPointerUp);
    boundDom.removeEventListener('pointermove', onPointerMove);
    boundDom.removeEventListener('pointerleave', onPointerLeave);
    boundDom.style.cursor = '';
    boundDom = null;
  }

  /* ---------------- 生命周期 ---------------- */
  api.onEnter(function () {
    active = true;
    heightReady = !!api.heightGrid;
    builtMarkerKey = null;
    builtArrowKey = null;
    bindPointer();
    sync(true);
  });

  api.onExit(function () {
    active = false;
    unbindPointer();
    clearMarkers();
    clearArrows();
    builtMarkerKey = null;
    builtArrowKey = null;
    down = null;
  });

  // 年份变化：document 事件（启动时也会补发一次）+ api 年份回调，双保险；sync 去重
  document.addEventListener('atlas:year', function () { sync(false); });
  api.onYear(function () { sync(false); });

  // 选中战役 / 步数变化
  document.addEventListener('atlas:battle', function () { sync(false); });

  // 逐帧：地形高程异步就绪后重建一次；选中菱形缓慢旋转
  api.onFrame(function () {
    if (!active) return;
    const ready = !!api.heightGrid;
    if (ready !== heightReady) { heightReady = ready; sync(true); }
    for (let i = 0; i < markerSpins.length; i++) markerSpins[i].rotation.y += 0.018;
  });

  // 供调试/验收读取（不影响页面其它逻辑）
  window.Battle3DLayer = {
    refresh: function () { builtMarkerKey = null; builtArrowKey = null; sync(true); },
    info: function () {
      return {
        active: active,
        year: yearNow(),
        markers: markerHits.length,
        arrows: arrowRoot ? arrowRoot.children.length : 0,
        battleKey: builtArrowKey,
        builds: buildCount,
        heightReady: !!api.heightGrid
      };
    }
  };
})();
