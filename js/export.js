/* 导出当前 SVG 视图为 PNG（离线可用：序列化 + canvas 栅格化 + 下载） */
(function () {
  'use strict';

  const PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size',
    'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'letter-spacing',
    'filter', 'visibility'];

  function inlineStyles(srcRoot, cloneRoot) {
    const src = [srcRoot].concat(Array.prototype.slice.call(srcRoot.querySelectorAll('*')));
    const dst = [cloneRoot].concat(Array.prototype.slice.call(cloneRoot.querySelectorAll('*')));
    const n = Math.min(src.length, dst.length);
    for (let i = 0; i < n; i++) {
      const s = getComputedStyle(src[i]);
      let css = '';
      PROPS.forEach(p => {
        const v = s.getPropertyValue(p);
        if (v && v !== 'none' || p === 'fill' || p === 'stroke') css += p + ':' + v + ';';
      });
      dst[i].setAttribute('style', css);
    }
  }

  function serialize(svg, bg) {
    const vb = (svg.getAttribute('viewBox') || '0 0 840 1000').split(/\s+/).map(Number);
    const w = vb[2], h = vb[3];
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    inlineStyles(svg, clone);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', vb[0]); rect.setAttribute('y', vb[1]);
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('fill', bg || '#f6eeda');
    clone.insertBefore(rect, clone.firstChild);
    return { svgText: new XMLSerializer().serializeToString(clone), w, h };
  }

  function toDataURL(svgId, done) {
    const svg = document.querySelector(svgId);
    if (!svg) { done(null); return; }
    let data;
    try { data = serialize(svg); } catch (e) { done(null, e); return; }
    const blob = new Blob([data.svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(data.w * scale);
        canvas.height = Math.round(data.h * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f6eeda';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, data.w, data.h);
        URL.revokeObjectURL(url);
        done(canvas.toDataURL('image/png'));
      } catch (e) { URL.revokeObjectURL(url); done(null, e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); done(null, new Error('svg render failed')); };
    img.src = url;
  }

  function exportCurrent() {
    const target = document.body.dataset.view === 'people' ? '#people-stage'
      : document.body.dataset.view === 'chrono' ? '#chrono-stage' : '#stage';
    const stamp = (document.querySelector('#year-big') || {}).textContent || '';
    toDataURL(target, (url, err) => {
      if (!url) { alert('导出失败：' + (err ? err.message : '未知错误')); return; }
      const a = document.createElement('a');
      a.href = url;
      a.download = '五代十国-' + (stamp ? stamp + '年-' : '') + (document.body.dataset.view || 'map') + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); }, 500);
    });
  }

  function init() {
    const btn = document.querySelector('#export-png');
    if (btn) btn.addEventListener('click', exportCurrent);
    // 自检钩子：用于无头浏览器验证导出管线（标志在启动时读取，避免被地址栏同步覆盖）
    const wantSelfTest = /selftest=export/.test(location.hash);
    const wantImg = /exportimg/.test(location.hash);
    if (wantSelfTest) {
      const start = Date.now();
      const tryRun = () => {
        if (!document.querySelector('#stage') && Date.now() - start < 4000) { setTimeout(tryRun, 100); return; }
        toDataURL('#stage', (url, err) => {
          document.title = 'export:' + (url ? 'ok:' + url.length : 'fail:' + (err && err.message));
          if (url && wantImg) {
            document.body.innerHTML = '<img id="exported" src="' + url + '" style="display:block;width:840px">';
            document.body.style.cssText = 'margin:0;background:#fff';
          }
        });
      };
      tryRun();
    }
  }

  window.AtlasExport = { exportCurrent, toDataURL };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
