/* 真 3D 沙盘 · 相机预设（俯视 / 沙盘 / 低角）
 * 只在本文件内新增逻辑：在 #gl-stage 里生成 .gl-presets 三个按钮（样式由 atlas.css 统一维护），
 * 点击后 700ms easeInOut 补间 camera.position 与 controls.target；双击画布复位到「沙盘」。
 * 补间期间交出 OrbitControls 控制权（enabled=false），pointerdown 立刻取消补间，避免和拖拽打架。
 * 依赖 window.Terrain3D（核心 API）；不修改任何其它文件。
 */
(function () {
  'use strict';

  var T3 = window.Terrain3D;
  if (!T3 || !T3.api) return;
  var api = T3.api;

  var DURATION = 700;
  var PRESETS = {
    top: { label: '俯视', pos: [0, 1250, 60], target: [0, 0, -10] },
    sand: { label: '沙盘', pos: [0, 560, 880], target: [0, 0, -10] },
    low: { label: '低角', pos: [-140, 150, 760], target: [0, 0, -10] }
  };
  var ORDER = ['top', 'sand', 'low'];

  var stage = null;
  var bar = null;
  var tween = null;
  var unsubFrame = null;
  var booted = false;

  function isRunning() {
    try { return !!(T3.isRunning && T3.isRunning()); } catch (e) { return false; }
  }

  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  /* ---------- 按钮 UI（只加 class，样式交给 atlas.css） ---------- */
  function ensureUI() {
    if (bar) return;
    stage = document.getElementById('gl-stage');
    if (!stage) return;
    bar = document.createElement('div');
    bar.className = 'gl-presets';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', '3D 相机预设');
    ORDER.forEach(function (name) {
      var p = PRESETS[name];
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.preset = name;
      b.textContent = p.label;
      b.title = name === 'top' ? '近乎垂直俯视'
        : name === 'sand' ? '默认 45° 沙盘视角（双击画布复位）'
          : '低角度贴近地形，看喜马拉雅与秦岭';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        flyTo(name);
      });
      bar.appendChild(b);
    });
    stage.appendChild(bar);
    // 右下角 .map-controls 在 gl-stage 之上（z-index 5 > gl-stage 2），同角会互相遮挡；
    // 这里只做内联避让，把预设放在其上方，不改样式表。
    bar.style.right = '18px';
    bar.style.bottom = '48px';
    bar.style.display = 'none'; // 只在真 3D 运行时显示
  }

  function showBar(show) {
    ensureUI();
    if (!bar) return;
    bar.style.display = show ? '' : 'none';
  }

  function markActive(name) {
    if (!bar) return;
    var btns = bar.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset.preset === name;
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      // 不新增样式表：用内联覆盖，既有 hover 规则仍可作用于未选中按钮
      btns[i].style.borderColor = on ? 'rgba(217, 201, 169, .55)' : '';
      btns[i].style.color = on ? '#f0dfc0' : '';
    }
  }

  /* ---------- 补间 ---------- */
  function stopTween() {
    if (!tween) return;
    tween = null;
    if (unsubFrame) {
      try { unsubFrame(); } catch (e) { /* noop */ }
      unsubFrame = null;
    }
    // 恢复 OrbitControls（即使中途 exit / pointerdown 也要恢复，否则下次进入拖不动）
    if (api.controls) {
      api.controls.enabled = true;
      api.controls.enableDamping = tweenPrevDamping;
    }
  }

  var tweenPrevDamping = true;

  function step() {
    if (!tween) return;
    var cam = api.camera, controls = api.controls;
    if (!cam || !controls) { stopTween(); return; }
    var t = Math.min(1, (nowMs() - tween.start) / DURATION);
    // easeInOutCubic
    var k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    cam.position.lerpVectors(tween.fromPos, tween.toPos, k);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    cam.lookAt(controls.target); // OrbitControls 的阻尼不会在补间里累积
    if (t >= 1) {
      cam.position.copy(tween.toPos);
      controls.target.copy(tween.toTarget);
      stopTween();
    }
  }

  function flyTo(name) {
    var p = PRESETS[name];
    if (!p || !isRunning()) return; // 不在 3D 模式时忽略
    var cam = api.camera, controls = api.controls, THREE = api.THREE;
    if (!cam || !controls || !THREE) return;

    stopTween();
    tweenPrevDamping = controls.enableDamping;
    tween = {
      fromPos: cam.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]),
      toTarget: new THREE.Vector3(p.target[0], p.target[1], p.target[2]),
      start: nowMs()
    };
    controls.enabled = false;      // 补间期间禁用轨道控制
    controls.enableDamping = false; // 防止残余阻尼把相机往回拉
    markActive(name);
    // api.onFrame 由 Terrain3D 的 requestAnimationFrame 渲染循环逐帧驱动
    unsubFrame = api.onFrame(step);
  }

  function cancelTween() { stopTween(); }

  /* ---------- 事件 ---------- */
  function onPointerDown() {
    if (tween) cancelTween(); // 用户一碰画布就让位给 OrbitControls
  }

  function onDblClick(e) {
    var t = e.target;
    if (!t || t.tagName !== 'CANVAS') return; // 只认 3D 画布
    if (t.closest && t.closest('.gl-presets')) return;
    flyTo('sand');
  }

  function bind() {
    ensureUI();
    if (stage && !stage.__camPresetBound) {
      stage.__camPresetBound = true;
      stage.addEventListener('pointerdown', onPointerDown, true);
      stage.addEventListener('dblclick', onDblClick);
    }
    // 进入真 3D 才显示；退出即隐藏（#gl-stage 本身也会 hidden，双保险）
    api.onEnter(function () {
      showBar(true);
      if (isRunning()) markActive('sand');
    });
    api.onExit(function () {
      stopTween();
      showBar(false);
    });
    if (isRunning()) showBar(true);
  }

  function setup() {
    if (booted) return;
    booted = true;
    bind();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
