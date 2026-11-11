/* 真 3D 沙盘 · 史迹层：河流 / 湖泊 / 都城标记
 * 依赖：window.Terrain3D.api（Three.js r147）、window.GEO、window.ATLAS
 * 约束：只读数据，只向 3D 场景添加自己的 Group；静态层首次进入 3D 且高程栅格就绪时构建一次，
 *       退出时移出场景，再次进入复用（不重复构建）。
 *
 * 数据实测结构（js/geo.js）：
 *   GEO.rivers = [{ name, cls: 'major'|'minor', pts: [[lon,lat], ...] }, ...]
 *   GEO.lakes  = [{ name, pts: [[lon,lat], ...] }, ...]
 *   ATLAS.cities = [{ name, lon, lat, type: 'capital'|'seat' }, ...]
 * 另注：geo.js / data.js 用顶层 const 声明，未必挂在 window 上；此处两者都兜底读取。
 */
(function () {
  'use strict';

  var T3 = window.Terrain3D;
  if (!T3 || !T3.api) {
    console.warn('[terrain3d-historical] Terrain3D 核心未就绪，跳过史迹层');
    return;
  }
  var api = T3.api;

  /* ---------- 视觉常量 ---------- */
  var RIVER_COLOR = 0x78aaa5;      // rgb(120,170,165)
  var RIVER_OPACITY = 0.85;
  var RIVER_TUBE_COLOR = 0x8fc6bf;
  var RIVER_TUBE_RADIUS = 2.0;     // 主要河流用细管，保证线宽可见
  var RIVER_OFFSET = 2;            // 贴地 +2
  var LAKE_COLOR = 0x5fa8b0;
  var LAKE_OPACITY = 0.45;
  var LAKE_OFFSET = 1.2;           // 湖泊平面 +1.2
  var CAPITAL_COLOR = 0xc0392b;    // 朱红
  var CAPITAL_TOP_COLOR = 0xe8bd6a;
  var CAPITAL_HEIGHT = 25;

  /* ---------- 状态 ---------- */
  var group = null;        // 本层根节点
  var built = false;       // 静态层是否已构建（只构建一次）
  var entering = false;    // 当前是否处于 3D 模式
  var inScene = false;     // group 是否已加入场景
  var buildTimer = 0;
  var stats = { rivers: 0, majors: 0, lakes: 0, capitals: 0 };

  /* ---------- 数据读取（带防御） ---------- */
  function readGeo() {
    if (window.GEO && typeof window.GEO === 'object') return window.GEO;
    try {
      if (typeof GEO !== 'undefined' && GEO && typeof GEO === 'object') return GEO;
    } catch (e) { /* ignore */ }
    return null;
  }

  function readCities() {
    var atlas = (window.ATLAS && typeof window.ATLAS === 'object') ? window.ATLAS : null;
    if (!atlas) {
      try {
        if (typeof ATLAS !== 'undefined' && ATLAS) atlas = ATLAS;
      } catch (e) { /* ignore */ }
    }
    return (atlas && Array.isArray(atlas.cities)) ? atlas.cities : [];
  }

  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  /* 兼容 [[lon,lat],...] 与 { pts:[[lon,lat],...] } 两种写法 */
  function normLine(item) {
    if (!item) return null;
    var pts = null, name = '', cls = '';
    if (Array.isArray(item)) {
      pts = item;
    } else if (Array.isArray(item.pts)) {
      pts = item.pts;
      name = typeof item.name === 'string' ? item.name : '';
      cls = typeof item.cls === 'string' ? item.cls
        : (typeof item['class'] === 'string' ? item['class']
          : (typeof item.type === 'string' ? item.type : ''));
    } else if (Array.isArray(item.path)) {
      pts = item.path;
      name = typeof item.name === 'string' ? item.name : '';
      cls = typeof item.cls === 'string' ? item.cls : '';
    }
    if (!pts) return null;

    var clean = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], lon = NaN, lat = NaN;
      if (Array.isArray(p)) { lon = p[0]; lat = p[1]; }
      else if (p && typeof p === 'object') {
        lon = (p.lon !== undefined) ? p.lon : p[0];
        lat = (p.lat !== undefined) ? p.lat : p[1];
      }
      if (!isFiniteNum(lon) || !isFiniteNum(lat)) continue;
      clean.push([lon, lat]);
    }
    if (clean.length < 2) return null;
    return { name: name, cls: cls, pts: clean };
  }

  /* ---------- 高程 ---------- */
  function heightAtSafe(mx, my) {
    try {
      var h = api.heightAt(mx, my);
      return isFinite(h) ? h : 0;
    } catch (e) { return 0; }
  }

  /* 高程栅格是否就绪（terrain.png 异步加载）；核心暴露 api.heightGrid，另做采样兜底 */
  function heightsReady() {
    var hg = api.heightGrid;
    if (hg && hg.data && hg.n) return true;
    var maxH = 0;
    try {
      for (var i = 0; i <= 4; i++) {
        for (var j = 0; j <= 4; j++) {
          var h = api.heightAt(api.W * i / 4, api.H * j / 4);
          if (h > maxH) maxH = h;
        }
      }
    } catch (e) { return false; }
    return maxH > 1;
  }

  /* 经纬度 → 世界坐标（贴地形 + yOffset） */
  function pointWorld(lon, lat, yOffset) {
    var m = api.lonLatToMap(lon, lat);
    var y = heightAtSafe(m[0], m[1]) + yOffset;
    return api.mapToWorld(m[0], m[1], y);
  }

  /* 把经纬度折线加密为贴地世界坐标点列：
   * 手绘河段顶点稀疏，直连会横穿山脊；按地图像素长度细分并逐点取高程，
   * 让线条尽量贴着地形起伏走（静态层只算一次，代价可接受）。 */
  function densifyRiverWorld(lonLatPts) {
    var out = [], stepPx = 5;
    for (var i = 0; i < lonLatPts.length - 1; i++) {
      var a = lonLatPts[i], b = lonLatPts[i + 1];
      var ma = api.lonLatToMap(a[0], a[1]);
      var mb = api.lonLatToMap(b[0], b[1]);
      var dx = mb[0] - ma[0], dy = mb[1] - ma[1];
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.min(64, Math.round(dist / stepPx)));
      for (var k = 0; k < steps; k++) {
        var t = k / steps;
        out.push(pointWorld(
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          RIVER_OFFSET
        ));
      }
    }
    var last = lonLatPts[lonLatPts.length - 1];
    if (last) out.push(pointWorld(last[0], last[1], RIVER_OFFSET));

    // 去掉过近的重复点（避免零长线段）
    var clean = [];
    for (var j = 0; j < out.length; j++) {
      if (!clean.length) { clean.push(out[j]); continue; }
      var prev = clean[clean.length - 1];
      if (prev.distanceToSquared(out[j]) > 0.25) clean.push(out[j]);
    }
    return clean;
  }

  /* ---------- 场景挂载 ---------- */
  function addToScene() {
    if (group && !inScene) {
      api.addObject(group);
      inScene = true;
    }
  }
  function removeFromScene() {
    if (group && inScene) {
      api.removeObject(group);
      inScene = false;
    }
  }
  function cancelBuildTimer() {
    if (buildTimer) { clearInterval(buildTimer); buildTimer = 0; }
  }

  /* ---------- 河流 ---------- */
  function buildRivers(THREE, geo, parent) {
    var list = Array.isArray(geo.rivers) ? geo.rivers : [];
    var rivers = 0, majors = 0;

    for (var i = 0; i < list.length; i++) {
      var r = normLine(list[i]);
      if (!r) continue;

      var pts = densifyRiverWorld(r.pts);
      if (pts.length < 2) continue;

      var geom = new THREE.BufferGeometry().setFromPoints(pts);
      var mat = new THREE.LineBasicMaterial({
        color: RIVER_COLOR,
        transparent: true,
        opacity: RIVER_OPACITY,
        depthWrite: false
      });
      var line = new THREE.Line(geom, mat);
      line.name = 'hist-river' + (r.name ? ':' + r.name : '');
      line.renderOrder = 3;
      parent.add(line);
      rivers++;

      // major 河流：WebGL 线宽不可控，补一根细管保证可见
      if (r.cls === 'major' && pts.length >= 2) {
        try {
          var curve = new THREE.CatmullRomCurve3(pts);
          curve.curveType = 'centripetal';
          var tubeGeom = new THREE.TubeGeometry(
            curve,
            Math.max(24, Math.min(260, pts.length * 2)),
            RIVER_TUBE_RADIUS,
            5,
            false
          );
          var tubeMat = new THREE.MeshBasicMaterial({
            color: RIVER_TUBE_COLOR,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
          });
          var tube = new THREE.Mesh(tubeGeom, tubeMat);
          tube.name = 'hist-river-tube' + (r.name ? ':' + r.name : '');
          tube.renderOrder = 4;
          parent.add(tube);
          majors++;
        } catch (e) {
          console.warn('[terrain3d-historical] 河流细管构建失败：' + (r.name || i), e);
        }
      }
    }
    stats.rivers = rivers;
    stats.majors = majors;
  }

  /* ---------- 湖泊 ---------- */
  function buildLakes(THREE, geo, parent) {
    var list = Array.isArray(geo.lakes) ? geo.lakes : [];
    var lakeCount = 0;

    for (var i = 0; i < list.length; i++) {
      var l = normLine(list[i]);
      if (!l || l.pts.length < 3) continue;

      var sumX = 0, sumY = 0, n = l.pts.length;
      var shape = new THREE.Shape();
      var outline = [];
      var maxTerrain = 0;

      for (var j = 0; j < l.pts.length; j++) {
        var m = api.lonLatToMap(l.pts[j][0], l.pts[j][1]);
        var wx = m[0] - api.W / 2;     // 世界 x
        var wz = m[1] - api.H / 2;     // 世界 z
        sumX += m[0]; sumY += m[1];
        var hAtPt = heightAtSafe(m[0], m[1]);
        if (hAtPt > maxTerrain) maxTerrain = hAtPt;
        // Shape 在 XY 平面，rotateX(-90°) 后 (x,y,0) → (x,0,-y)；故取 sy = -wz
        var sx = wx, sy = -wz;
        if (j === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
        outline.push({ x: wx, z: wz });
      }

      var cx = sumX / n, cy = sumY / n;
      var centerH = heightAtSafe(cx, cy);
      // 水平面取「周边最高地形 + 1.2」，保证整个湖面都浮在地形之上
      var yTop = Math.max(centerH, maxTerrain) + LAKE_OFFSET;

      var lakeGeom = new THREE.ShapeGeometry(shape);
      lakeGeom.rotateX(-Math.PI / 2);
      var lakeMat = new THREE.MeshBasicMaterial({
        color: LAKE_COLOR,
        transparent: true,
        opacity: LAKE_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      var lakeMesh = new THREE.Mesh(lakeGeom, lakeMat);
      lakeMesh.name = 'hist-lake' + (l.name ? ':' + l.name : '');
      lakeMesh.position.y = yTop;
      lakeMesh.renderOrder = 2;
      parent.add(lakeMesh);

      // 湖岸线，帮助在暗色地形上辨认
      var loopPts = [];
      for (var k = 0; k < outline.length; k++) {
        loopPts.push(new THREE.Vector3(outline[k].x, yTop + 0.15, outline[k].z));
      }
      var loopGeom = new THREE.BufferGeometry().setFromPoints(loopPts);
      var loopMat = new THREE.LineBasicMaterial({
        color: 0x8fd0d6,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });
      var loop = new THREE.LineLoop(loopGeom, loopMat);
      loop.name = 'hist-lake-outline' + (l.name ? ':' + l.name : '');
      loop.renderOrder = 3;
      parent.add(loop);

      lakeCount++;
    }
    stats.lakes = lakeCount;
  }

  /* ---------- 都城 ---------- */
  function buildCapitals(THREE, parent) {
    var cities = readCities();
    var seen = {};
    var count = 0;

    var colMat = new THREE.MeshStandardMaterial({
      color: CAPITAL_COLOR, roughness: 0.55, metalness: 0.15,
      emissive: 0x4a0f08, emissiveIntensity: 0.7
    });
    var topMat = new THREE.MeshStandardMaterial({
      color: CAPITAL_TOP_COLOR, roughness: 0.45, metalness: 0.25,
      emissive: 0x5a3a10, emissiveIntensity: 0.6
    });
    var baseMat = new THREE.MeshStandardMaterial({
      color: 0x7a2a1e, roughness: 0.8, metalness: 0.1,
      emissive: 0x2a0a06, emissiveIntensity: 0.5
    });

    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      if (!c || c.type !== 'capital') continue;

      var lon = c.lon, lat = c.lat;
      if (!isFiniteNum(lon) || !isFiniteNum(lat)) continue;

      var key = (c.name || '') + '|' + lon + ',' + lat;
      if (seen[key]) continue;
      seen[key] = true;

      var m = api.lonLatToMap(lon, lat);
      var baseY = heightAtSafe(m[0], m[1]);
      var w = api.mapToWorld(m[0], m[1], 0);

      var marker = new THREE.Group();
      marker.name = 'hist-capital' + (c.name ? ':' + c.name : '');
      marker.position.set(w.x, 0, w.z);

      // 底座
      var base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.6, 8), baseMat);
      base.position.y = baseY + 0.8;

      // 立柱
      var col = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.5, CAPITAL_HEIGHT, 8), colMat);
      col.position.y = baseY + 1.6 + CAPITAL_HEIGHT / 2;

      // 顶部小方块（旋转 45°，远看像菱形/锥顶）
      var top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 4.2), topMat);
      top.rotation.y = Math.PI / 4;
      top.position.y = baseY + 1.6 + CAPITAL_HEIGHT + 1.8;

      marker.add(base);
      marker.add(col);
      marker.add(top);
      parent.add(marker);
      count++;
    }
    stats.capitals = count;
  }

  /* ---------- 构建（只执行一次） ---------- */
  function buildLayer() {
    if (built && group) return group;

    var THREE = window.THREE || api.THREE;
    if (!THREE) return null;

    var geo = readGeo();
    if (!geo) {
      console.warn('[terrain3d-historical] 未找到 GEO 数据，史迹层未构建');
      return null;
    }

    var g = new THREE.Group();
    g.name = 'historical-layer';

    var riverGroup = new THREE.Group();
    riverGroup.name = 'historical-rivers';
    var lakeGroup = new THREE.Group();
    lakeGroup.name = 'historical-lakes';
    var cityGroup = new THREE.Group();
    cityGroup.name = 'historical-capitals';
    g.add(riverGroup);
    g.add(lakeGroup);
    g.add(cityGroup);

    try { buildRivers(THREE, geo, riverGroup); } catch (e) { console.warn('[terrain3d-historical] 河流层构建异常', e); }
    try { buildLakes(THREE, geo, lakeGroup); } catch (e) { console.warn('[terrain3d-historical] 湖泊层构建异常', e); }
    try { buildCapitals(THREE, cityGroup); } catch (e) { console.warn('[terrain3d-historical] 都城层构建异常', e); }

    group = g;
    built = true;
    cancelBuildTimer();
    if (entering) addToScene();

    console.info(
      '[terrain3d-historical] 史迹层已构建：河流 ' + stats.rivers +
      ' 条（major ' + stats.majors + ' 条细管）、湖泊 ' + stats.lakes +
      ' 个、都城 ' + stats.capitals + ' 座；高程栅格 ' + (heightsReady() ? '就绪' : '未就绪（按 0 高程兜底）')
    );
    return group;
  }

  /* 尝试立即构建；高程未就绪则返回 false */
  function tryBuildNow() {
    if (built) {
      if (entering) addToScene();
      return true;
    }
    if (!entering) return false;
    if (!readGeo()) return false;
    if (!heightsReady()) return false;
    buildLayer();
    return built;
  }

  /* 高程栅格异步加载：帧回调 + 定时器双保险 */
  function scheduleBuild() {
    cancelBuildTimer();
    var startedAt = Date.now();
    buildTimer = setInterval(function () {
      if (!entering) { cancelBuildTimer(); return; }
      if (built) { cancelBuildTimer(); return; }
      if (heightsReady()) { buildLayer(); return; }
      // 兜底：高程长时间不加载也不让史迹层缺席
      if (Date.now() - startedAt > 8000) { buildLayer(); }
    }, 200);
  }

  /* ---------- 生命周期 ---------- */
  api.onEnter(function () {
    entering = true;
    if (tryBuildNow()) return;
    scheduleBuild();
  });

  api.onExit(function () {
    entering = false;
    cancelBuildTimer();
    removeFromScene();
  });

  api.onFrame(function () {
    if (!built && entering) tryBuildNow();
  });

  /* ---------- 调试入口（不参与渲染） ---------- */
  window.Terrain3DHistorical = {
    get group() { return group; },
    get stats() { return stats; },
    get built() { return built; },
    dataCheck: function () {
      var geo = readGeo();
      var cities = readCities();
      console.log('[terrain3d-historical] 数据检查', {
        geo: !!geo,
        rivers: geo && geo.rivers ? geo.rivers.length : 'missing',
        riverSample: geo && Array.isArray(geo.rivers) && geo.rivers[0]
          ? { keys: Object.keys(geo.rivers[0]), ptsType: Array.isArray((geo.rivers[0] || {}).pts) ? 'array' : typeof (geo.rivers[0] || {}).pts }
          : null,
        lakes: geo && geo.lakes ? geo.lakes.length : 'missing',
        capitals: cities.filter(function (c) { return c && c.type === 'capital'; }).length
      });
    }
  };

  console.info('[terrain3d-historical] 已挂载（等待首次进入 3D 后构建静态史迹层）');
})();
