/* 真 3D 沙盘 · 政权块体层（terrain3d-blocks.js）
 * 把当前年份的疆域（window.ATLAS.territories 中 from<=year<to 的条目）做成半透明的
 * 薄挤出平板，铺在真实地形之上：颜色取政权 color，厚度 2.5，基准高度取该政权所有
 * 顶点 heightAt 的最小值 + 0.8（跟着低处贴地，不悬空），让山体自然穿出色块、地形不被盖掉。
 * 只做「主要政权」：按领土总面积排序取前 12，其余跳过（console 说明），控制三角面与 draw call。
 * 生命周期：进入 3D 建、退出 3D 清、年份变化重建；重建前 dispose 几何与材质。
 * 依赖 window.Terrain3D.api，不直接改 scene 以外的东西。
 */
(function () {
  'use strict';

  const T3D = window.Terrain3D;
  if (!T3D || !T3D.api) {
    console.warn('[blocks3d] 未找到 window.Terrain3D，政权块体层未启用');
    return;
  }
  const api = T3D.api;

  const MAX_REGIMES = 12;   // 只做主要政权，避免几十个政权同时挤出的开销
  const THICK = 3;          // 块体厚度（1.5–3）：薄片，避免像浮起的大盘子
  const LIFT = 0.8;         // 底面相对地形高度的抬升，避免与地形共面 Z-fighting

  let group = null;         // 承载全部块体的 THREE.Group
  let builtYear = -1;
  let builtWithHeights = false;

  function hasHeights() { return !!api.heightGrid; }

  function running() {
    try { return T3D.isRunning(); } catch (e) { return false; }
  }

  /* ---------- 数据整理 ---------- */
  function regimesById() {
    const map = Object.create(null);
    ((window.ATLAS && ATLAS.regimes) || []).forEach(r => { map[r.id] = r; });
    return map;
  }

  function lonLatArea(poly) {
    let s = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = api.lonLatToMap(poly[i][0], poly[i][1]);
      const b = api.lonLatToMap(poly[(i + 1) % n][0], poly[(i + 1) % n][1]);
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  /* 当前年份按政权聚合：多个生效段合并 poly，面积用于排序 */
  function collectByRegime(year) {
    const byId = Object.create(null);
    ((window.ATLAS && ATLAS.territories) || []).forEach(t => {
      if (!(t.from <= year && year < t.to)) return;
      if (!t.polys || !t.polys.length) return;
      const rec = byId[t.regime] || (byId[t.regime] = { id: t.regime, polys: [], area: 0 });
      t.polys.forEach(p => {
        if (!p || p.length < 3) return;
        rec.polys.push(p);
        rec.area += lonLatArea(p);
      });
    });
    return Object.keys(byId).map(k => byId[k]).filter(r => r.polys.length);
  }

  /* 块体基准高度：所有顶点 heightAt 的最小值 + LIFT（贴地，不悬空）；
   * 用质心高度会在高地政权上整块悬空，故不采用。 */
  function baseHeight(polys) {
    let min = Infinity;
    polys.forEach(p => p.forEach(pt => {
      const [mx, my] = api.lonLatToMap(pt[0], pt[1]);
      min = Math.min(min, api.heightAt(mx, my));
    }));
    if (!isFinite(min)) min = 0;
    return min + LIFT;
  }

  /* 多边形 -> XZ 平面挤出平板；整体平移到基准高度（顶面 = 基准 + THICK）。
   * 平板会与山体相交：高处自然露出地形，低处露出色块，既保地形又有厚度。 */
  function buildPlate(THREE, poly, material) {
    const shape = new THREE.Shape();
    for (let i = 0; i < poly.length; i++) {
      const [mx, my] = api.lonLatToMap(poly[i][0], poly[i][1]);
      const x = mx - api.W / 2;
      const y = -(my - api.H / 2); // rotateX(-90°) 后 -> 世界 z = my - H/2
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: THICK, steps: 1, bevelEnabled: false, curveSegments: 1
    });
    geo.rotateX(-Math.PI / 2); // 立起来 -> 水平，y ∈ [0, THICK]
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = 2; // 保证在透明地形之后绘制，避免半透明排序错乱
    return mesh;
  }

  function makeMaterial(THREE, regime) {
    // 注意：r147 把 Color 分量当线性空间，渲染器再按 sRGB 输出；若直接用 hex，
    // 块体会被「二次提亮」成粉彩色。先转线性，让最终屏幕颜色贴近政权色。
    // 再整体压暗 0.85，避免盖住地形与标签；半透明 + 不写深度 = 只做一层薄薄的色晕。
    const color = new THREE.Color(regime.color || '#888888').convertSRGBToLinear().multiplyScalar(0.85);
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: color.clone().multiplyScalar(0.08),
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.6,
      side: THREE.FrontSide,
      depthWrite: false
    });
  }

  /* ---------- 构建 / 销毁 ---------- */
  function disposeGroup() {
    if (!group) return;
    const mats = new Set();
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) mats.add(o.material);
    });
    mats.forEach(m => m.dispose());
    api.removeObject(group);
    group = null;
  }

  function rebuild(force) {
    if (!running()) return;
    const THREE = api.THREE || window.THREE;
    if (!THREE) return;
    const year = api.getYear();
    const heights = hasHeights();
    if (!force && group && year === builtYear && heights === builtWithHeights) return;
    if (!heights) {
      // 高程图还在异步加载：先不建，等 onFrame 发现 heightGrid 就绪再建，避免块体埋进山里
      return;
    }

    disposeGroup();
    builtYear = year;
    builtWithHeights = heights;

    const regimes = regimesById();
    const list = collectByRegime(year).sort((a, b) => b.area - a.area);
    const picked = list.slice(0, MAX_REGIMES);
    const skipped = list.slice(MAX_REGIMES);

    group = new THREE.Group();
    group.name = 'territory-blocks';
    let plates = 0;

    picked.forEach(rec => {
      const regime = regimes[rec.id];
      if (!regime) return;
      const y = baseHeight(rec.polys);
      const material = makeMaterial(THREE, regime);
      rec.polys.forEach(poly => {
        const mesh = buildPlate(THREE, poly, material);
        mesh.position.y = y; // 水平平板整体抬到基准高度
        mesh.userData.regime = rec.id;
        mesh.userData.regimeName = regime.name;
        mesh.userData.baseY = y;
        group.add(mesh);
        plates++;
      });
    });

    api.addObject(group);

    if (skipped.length) {
      console.info('[blocks3d] ' + year + ' 年：仅渲染面积最大的 ' + picked.length +
        ' 个政权（共 ' + list.length + ' 个），跳过：' +
        skipped.map(r => (regimes[r.id] ? regimes[r.id].name : r.id)).join('、'));
    } else {
      console.info('[blocks3d] ' + year + ' 年：渲染 ' + picked.length + ' 个政权、' + plates + ' 块疆域。');
    }
  }

  function clear() {
    disposeGroup();
    builtYear = -1;
    builtWithHeights = false;
  }

  /* ---------- 生命周期 ---------- */
  // 年份变化：核心在 atlas:year / updateTexture 里触发 onYear
  api.onYear(() => rebuild(false));
  // 进入 3D：核心 enter() 会在 init 完成后触发 onEnter
  api.onEnter(() => rebuild(true));
  // 退出 3D：清掉全部块体与资源
  api.onExit(() => clear());

  // 双保险：万一 onYear 未触发（其它脚本/页面直接改年份），也监听同一事件；
  // rebuild 内部按 年份+高程状态 去重，不会重复建。
  document.addEventListener('atlas:year', () => rebuild(false));

  // 高程图是异步加载的：就绪后补建一次（否则块体会按 0 高度埋到山体里）
  api.onFrame(() => {
    if (!group && running() && hasHeights()) rebuild(false);
  });

  // 页面首次进入 3D 可能早于本脚本注册事件；这里补一次。
  if (running()) rebuild(true);
})();
