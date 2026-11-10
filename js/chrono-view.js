/* 年表视图：政权寿命条（Gantt）+ 大事年刻 + 与时间轴联动 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 760;
  const M = { left: 152, right: 26, top: 58, bottom: 22 };
  const SPAN = ATLAS.span.end - ATLAS.span.start;

  let year = 907, active = false, selected = null;
  let svg, gGrid, gBars, gCursor, gAxis, tipEl;
  let rows = [], rowH = 0;

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const X = (y) => M.left + (Math.max(ATLAS.span.start, Math.min(ATLAS.span.end, y)) - ATLAS.span.start) / SPAN * (W - M.left - M.right);
  const fmt = (r) => `${r.founded.year}–${r.ended.year}`;

  function build() {
    svg = $('#chrono-stage');
    if (!svg) return;
    const defs = el('defs', {}, svg);
    defs.innerHTML = '<filter id="cink" x="-4%" y="-40%" width="108%" height="180%">' +
      '<feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#463726" flood-opacity="0.28"/></filter>';
    gGrid = el('g', { class: 'c-grid' }, svg);
    gAxis = el('g', { class: 'c-axis' }, svg);
    gBars = el('g', { class: 'c-bars' }, svg);
    gCursor = el('g', { class: 'c-cursor' }, svg);
    tipEl = $('#chrono-tip');

    rows = ATLAS.regimes.slice().sort((a, b) => (a.founded.year - b.founded.year) || (a.ended.year - b.ended.year));
    rowH = (H - M.top - M.bottom) / rows.length;

    // 纵向年代网格
    for (let y = ATLAS.span.start; y <= ATLAS.span.end; y += 5) {
      const x = X(y);
      el('line', { x1: x, y1: M.top - 8, x2: x, y2: H - M.bottom, class: y % 10 === 0 ? 'c-grid-major' : 'c-grid-minor' }, gGrid);
      if (y % 10 === 0 || y === ATLAS.span.start) {
        const t = el('text', { x, y: 46, class: 'c-year' }, gAxis);
        t.textContent = y;
      }
    }
    // 大事刻
    ATLAS.events.forEach(e => {
      const x = X(e.year);
      const d = el('path', {
        d: `M${x} ${M.top - 30} l4 4 l-4 4 l-4 -4 z`, class: 'c-evdot'
      }, gAxis);
      el('title', {}, d).textContent = `${e.year}：${e.text}`;
      d.addEventListener('click', (ev) => { ev.stopPropagation(); jump(e.year); });
    });

    // 政权寿命条
    rows.forEach((r, i) => {
      const cy = M.top + i * rowH + rowH / 2;
      const x1 = X(r.founded.year), x2 = X(Math.max(r.ended.year, r.founded.year + 1));
      const w = Math.max(2, x2 - x1);
      const g = el('g', { class: 'c-row', 'data-id': r.id }, gBars);
      el('text', { x: M.left - 10, y: cy + 4, class: 'c-name', 'text-anchor': 'end' }, g).textContent = r.name;
      const rect = el('rect', {
        x: x1, y: cy - 6.5, width: w, height: 13, rx: 2.5, class: 'c-bar', filter: 'url(#cink)'
      }, g);
      rect.style.fill = r.color;
      const t = el('title', {}, rect);
      t.textContent = `${r.name}　${fmt(r)}　都 ${r.capital}　${r.ended.how}`;
      g.addEventListener('mouseenter', (ev) => { showTip(ev, r); mark(r.id, true); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', () => { tipEl.hidden = true; mark(r.id, false); });
      g.addEventListener('click', (ev) => { ev.stopPropagation(); select(r); });
    });

    renderCursor();
    renderSide();
  }

  function mark(id, on) {
    if (!gBars) return;
    gBars.querySelectorAll('.c-row').forEach(g => {
      const hit = g.getAttribute('data-id') === id;
      g.style.opacity = on ? (hit ? 1 : .32) : 1;
    });
  }

  function renderCursor() {
    if (!gCursor) return;
    gCursor.innerHTML = '';
    const x = X(year);
    el('line', { x1: x, y1: M.top - 36, x2: x, y2: H - M.bottom, class: 'c-cursor-line' }, gCursor);
    const tag = el('g', { transform: `translate(${x.toFixed(1)},${M.top - 44})` }, gCursor);
    el('rect', { x: -22, y: -14, width: 44, height: 19, rx: 3, class: 'c-cursor-tag' }, tag);
    const t = el('text', { x: 0, y: 0, class: 'c-cursor-year', 'text-anchor': 'middle' }, tag);
    t.textContent = year;
    if (selected) {
      gBars.querySelectorAll('.c-row').forEach(g => g.classList.toggle('sel', g.getAttribute('data-id') === selected));
    }
    // 同期对照：本年立国 / 亡国的政权横条加标记
    gBars.querySelectorAll('.c-row').forEach(g => {
      const r = rows.find(x => x.id === g.getAttribute('data-id'));
      if (!r) return;
      g.classList.toggle('birth', r.founded.year === year);
      g.classList.toggle('death', r.ended.year === year);
    });
  }

  function renderSide() {
    const list = $('#c-list');
    if (!list) return;
    const sorted = rows.slice().sort((a, b) => (a.ended.year - b.ended.year) || (a.founded.year - b.founded.year));
    list.innerHTML = sorted.map(r => {
      const aliveRow = r.founded.year <= year && year <= r.ended.year;
      const birth = r.founded.year === year, death = r.ended.year === year;
      const tag = birth ? '<span class="c-tag born">立国</span>' : (death ? '<span class="c-tag died">亡国</span>' : '');
      return `<button class="c-item${aliveRow ? ' on' : ''}" data-id="${r.id}">
        <i style="background:${r.color}"></i>
        <span class="c-nm">${r.name}${tag}</span>
        <span class="c-yr">${fmt(r)}</span>
        <span class="c-how">${r.ended.how}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('.c-item').forEach(b => {
      b.addEventListener('click', () => {
        const r = ATLAS.regimes.find(x => x.id === b.getAttribute('data-id'));
        if (r) select(r);
      });
    });

    const now = $('#c-now');
    if (!now) return;
    const act = ATLAS.regimes.filter(r => r.founded.year <= year && year <= r.ended.year)
      .sort((a, b) => a.founded.year - b.founded.year);
    now.innerHTML = act.length
      ? act.map(r => `<div class="c-now-row"><i style="background:${r.color}"></i><b>${r.name}</b>
          <span>${r.capital}</span><em>第 ${year - r.founded.year + 1} 年</em></div>`).join('')
      : '<div class="c-now-row muted">本年无存续政权。</div>';
  }

  function select(r) {
    selected = r.id;
    renderCursor();
    jump(r.founded.year);
    renderSide();
  }

  function jump(y) {
    if (typeof window.atlasSetYear === 'function') window.atlasSetYear(y);
    else { year = y; renderCursor(); renderSide(); }
  }

  function showTip(ev, r) {
    if (!tipEl) return;
    tipEl.innerHTML = `<b style="color:${r.color}">${r.name}</b>　${r.full}<br>
      <span class="tip-sub">${fmt(r)}　都 ${r.capital}</span><br>
      <span class="tip-sub">${r.ended.how}</span>`;
    tipEl.hidden = false;
    moveTip(ev);
  }
  function moveTip(ev) {
    if (!tipEl) return;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    const r = tipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }

  function setActive(on) {
    active = on;
    if (!svg) return;
    if (on) {
      year = (window.atlasGetYear && window.atlasGetYear()) || year;
      renderCursor(); renderSide(); hideTip();
    }
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  function init() {
    build();
    if (window.atlasGetYear) year = window.atlasGetYear();
    if (svg) { renderCursor(); renderSide(); }
    svg.addEventListener('click', () => { tipEl.hidden = true; });
    svg.addEventListener('click', (ev) => {
      // 空白处点击：按 x 位置跳年
      const r = svg.getBoundingClientRect();
      const vx = (ev.clientX - r.left) / r.width * W;
      const y = ATLAS.span.start + (vx - M.left) / (W - M.left - M.right) * SPAN;
      if (vx >= M.left && vx <= W - M.right) jump(Math.round(y));
    });
    document.addEventListener('atlas:year', (e) => {
      year = e.detail.year;
      if (active) { renderCursor(); renderSide(); }
    });
  }

  // 立即暴露接口：people-view 的视图切换可能早于本文件 init 执行
  window.ChronoView = {
    setActive,
    refresh: (y) => { year = y; if (active && svg) { renderCursor(); renderSide(); } },
    jump
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
