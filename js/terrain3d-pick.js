/* 真 3D 沙盘 · 拾取交互层
 * 依赖：window.Terrain3D.api（terrain3d.js）与 window.ATLAS / window.atlasSelectRegime（app.js）。
 * 功能：
 *   1) hover：canvas 上 pointermove → api.pick → 政权名提示 .gl-hover-tip（跟随鼠标，相对 #gl-stage）；
 *      命中时 canvas 光标变 pointer，未命中恢复。
 *   2) click：pointerdown→pointerup 位移 < 5px 视为点击 → window.atlasSelectRegime(regimeId)。
 *   3) 3D 高亮：hover 点上方放一个发光圆环 Sprite（轻量，单个 addObject），离开即隐藏。
 *   4) 启用条件：body[data-mode="3d"] 且 Terrain3D.isRunning()；用 api.onEnter/onExit 挂载/卸载，
 *      所有事件里仍再校验一次（enter 发生在 dataset.mode 赋值之前）。
 * 注意：api.pick 返回的 regimeId 其实是栅格分区序号（1-based，对应 getRasterHit().seq[regimeId-1]），
 *      这里统一经 resolveRegime() 映射为政权对象，避免把数字当政权 id 用。
 * 本文件不修改 index.html / css / terrain3d.js，也不 preventDefault 任何指针事件，避免干扰 OrbitControls。
 */
(function () {
  'use strict';

  var T3D = window.Terrain3D;
  if (!T3D || !T3D.api) return;
  var api = T3D.api;

  var HOVER_CLASS = 'gl-hover-tip';
  var RING_SIZE = 64;      // 世界单位（地形宽 840）
  var CLICK_SLOP = 5;      // px：按下/抬起位移小于此值算点击

  var tipEl = null;        // .gl-hover-tip
  var ring = null;         // 高亮 Sprite
  var ringMat = null;      // SpriteMaterial
  var ringTex = null;      // CanvasTexture（复用）
  var ringT0 = 0;

  var hoverId = null;       // 当前悬停政权 id（字符串）
  var pending = null;       // {x,y} 待处理的 hover 坐标（每帧合并，避免高频 raycast）
  var down = null;          // {x,y} pointerdown 记录
  var boundCanvas = null;   // 已绑定事件的 canvas
  var unbound = null;       // 解绑函数集合

  /* ---------------- 基础 ---------------- */

  function enabled() {
    return document.body.dataset.mode === '3d' && T3D.isRunning();
  }

  function stageEl() {
    var host = null;
    try { host = api.wrap; } catch (e) { host = null; }
    if (!host) host = document.getElementById('gl-stage');
    return host || null;
  }

  function findRegime(id) {
    var list = (window.ATLAS && window.ATLAS.regimes) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* api.pick 的 regimeId 是栅格 1-based 分区序号；兼容万一将来改为政权 id 字符串 */
  function resolveRegime(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
      var hit = null;
      try { hit = api.getRasterHit(); } catch (e) { hit = null; }
      if (!hit || !hit.seq) return null;
      var id = hit.seq[raw - 1];
      return id ? findRegime(id) : null;
    }
    return findRegime(raw);
  }

  /* ---------------- 提示框 ---------------- */

  function ensureTip() {
    if (tipEl && tipEl.parentNode) return tipEl;
    var host = stageEl();
    if (!host) return null;
    tipEl = document.createElement('div');
    tipEl.className = HOVER_CLASS;
    tipEl.setAttribute('aria-hidden', 'true');
    host.appendChild(tipEl);
    return tipEl;
  }

  function placeTip(regime, clientX, clientY) {
    var t = ensureTip();
    if (!t) return;
    var host = t.parentNode;
    var rect = host.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    // 贴边时把提示框收进舞台，避免被 overflow:hidden 裁掉
    if (x < 40) x = 40;
    if (x > rect.width - 40) x = rect.width - 40;
    if (y < 26) y = 26;
    t.style.left = x.toFixed(1) + 'px';
    t.style.top = y.toFixed(1) + 'px';
    t.style.borderColor = (regime && regime.color) ? regime.color : '';
    t.textContent = regime ? regime.name : '';
    t.style.display = 'block';
  }

  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
  }

  function setCursor(val) {
    var canvas = api.renderer && api.renderer.domElement;
    if (canvas) canvas.style.cursor = val;
  }

  /* ---------------- 3D 高亮（发光圆环 Sprite） ---------------- */

  function buildRingTexture(THREE) {
    if (ringTex) return ringTex;
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 18, 64, 64, 64);
    grd.addColorStop(0.00, 'rgba(255,240,210,0)');
    grd.addColorStop(0.50, 'rgba(255,240,210,0)');
    grd.addColorStop(0.64, 'rgba(255,244,220,0.95)');
    grd.addColorStop(0.72, 'rgba(255,208,150,0.40)');
    grd.addColorStop(0.86, 'rgba(255,180,110,0.10)');
    grd.addColorStop(1.00, 'rgba(255,170,100,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    ringTex = new THREE.CanvasTexture(c);
    ringTex.needsUpdate = true;
    return ringTex;
  }

  function ensureRing() {
    var THREE = api.THREE;
    if (!THREE) return null;
    if (ring) return ring;
    ringMat = new THREE.SpriteMaterial({
      map: buildRingTexture(THREE),
      color: 0xffd9a0,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    ring = new THREE.Sprite(ringMat);
    ring.scale.set(RING_SIZE, RING_SIZE, 1);
    ring.renderOrder = 8;
    ring.visible = false;
    ringT0 = 0;
    api.addObject(ring);
    return ring;
  }

  function highlight(regime, point) {
    var s = ensureRing();
    if (!s) return;
    if (point) s.position.set(point.x, point.y + 6, point.z);
    if (ringMat && regime && regime.color) {
      try { ringMat.color.set(regime.color); } catch (e) { ringMat.color.set(0xffd9a0); }
    }
    if (!s.visible) ringT0 = 0;
    s.visible = true;
  }

  function clearHighlight() {
    if (ring) ring.visible = false;
  }

  /* ---------------- hover / click ---------------- */

  function clearHover() {
    hideTip();
    clearHighlight();
    setCursor('');
    hoverId = null;
  }

  function processHover() {
    if (!pending) return;
    var p = pending;
    pending = null;
    if (!enabled()) { clearHover(); return; }

    var hit = null;
    try { hit = api.pick(p.x, p.y); } catch (e) { hit = null; }
    var regime = hit ? resolveRegime(hit.regimeId) : null;

    if (!regime) { clearHover(); return; }
    hoverId = regime.id;
    placeTip(regime, p.x, p.y);
    setCursor('pointer');
    if (hit.point) highlight(regime, hit.point);
  }

  function onPointerMove(e) {
    if (!enabled()) return;
    // 拖拽旋转/平移时（有按键按下）不做 hover raycast，避免拖慢 OrbitControls；也避免提示框跟着乱飘
    if (e.buttons) {
      pending = null;
      if (hoverId) clearHover();
      return;
    }
    pending = { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(e) {
    if (!enabled()) return;
    if (e.button !== 0) { down = null; return; }
    down = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    if (!enabled()) { down = null; return; }
    var d = down;
    down = null;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > CLICK_SLOP || Math.abs(e.clientY - d.y) > CLICK_SLOP) return;
    if (typeof window.atlasSelectRegime !== 'function') return;

    var hit = null;
    try { hit = api.pick(e.clientX, e.clientY); } catch (e2) { hit = null; }
    var regime = hit ? resolveRegime(hit.regimeId) : null;
    if (!regime) return;               // 未命中不处理

    window.atlasSelectRegime(regime.id);
    // 点击后提示框保持显示（不是重新 hover 一次，但位置与内容保持一致）
    placeTip(regime, e.clientX, e.clientY);
    setCursor('pointer');
    if (hit.point) highlight(regime, hit.point);
    hoverId = regime.id;
  }

  function onPointerLeave() {
    pending = null;
    down = null;
    clearHover();
  }

  /* ---------------- 事件挂载 / 卸载 ---------------- */

  function bind() {
    var canvas = api.renderer && api.renderer.domElement;
    if (!canvas || canvas === boundCanvas) return;
    unbind();
    boundCanvas = canvas;
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
    canvas.addEventListener('pointercancel', onPointerLeave, { passive: true });
    unbound = function () {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointercancel', onPointerLeave);
      boundCanvas = null;
    };
  }

  function unbind() {
    if (unbound) { unbound(); unbound = null; }
    boundCanvas = null;
  }

  /* ---------------- 每帧：处理合并后的 hover + 圆环脉动 ---------------- */

  api.onFrame(function () {
    if (!enabled()) {
      if (hoverId || pending) { pending = null; clearHover(); }
      return;
    }
    if (pending) processHover();

    if (ring && ring.visible && ringMat) {
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (!ringT0) ringT0 = now;
      var ph = (now - ringT0) / 260;
      var k = 1 + 0.10 * Math.sin(ph);
      ring.scale.set(RING_SIZE * k, RING_SIZE * k, 1);
      ringMat.opacity = 0.78 + 0.22 * Math.sin(ph);
    }
  });

  api.onEnter(function () {
    bind();
  });

  api.onExit(function () {
    pending = null;
    down = null;
    clearHover();
    unbind();
  });

  // 极端情况下 canvas 在 init 后才出现（例如其它模块先 enter）：首次事件前兜底绑定
  if (api.renderer) bind();
})();
