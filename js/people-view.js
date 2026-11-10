/* 人物视图：关系网络 + 性格标签 + 结局统计（与疆域视图共用同一条时间轴） */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 720;

  const byId = {};
  PEOPLE.forEach(p => { byId[p.id] = p; });

  const ENDING_GROUPS = {
    violent: { label: '暴力而终', types: ['被弑', '被杀', '赐死', '自焚', '战死', '暴卒', '自尽'], color: '#a63b2f' },
    power: { label: '失权而终', types: ['被废', '出降', '被俘', '失踪'], color: '#8a6a4a' },
    calm: { label: '病卒 / 善终', types: ['病卒', '善终'], color: '#6f8494' }
  };

  let year = 907;
  let selected = null;
  let active = false;
  let svg, gEdges, gNodes, gLabels, tipEl;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const isAlive = (p, y) => { const r = p.act || p.a; return y >= r[0] && y <= r[1]; };
  const aliveAt = (y) => PEOPLE.filter(p => isAlive(p, y));

  /* 关系的"在场"集合：两端人物都在场，关系才成立 */
  const relKey = (r) => r[0] + '|' + r[1] + '|' + r[2];
  function relSetAt(y) {
    const set = new Set();
    RELATIONS.forEach(r => {
      const A = byId[r[0]], B = byId[r[1]];
      if (!A || !B) return;
      const key = relKey(r);
      const span = REL_SPANS[key];
      if (span) { if (y >= span[0] && y <= span[1]) set.add(key); return; }
      if (isAlive(A, y) && isAlive(B, y)) set.add(key);
    });
    return set;
  }
  let newRelKeys = new Set(), lostRelKeys = new Set();

  /* ------------- 布局 ------------- */
  function layout(y) {
    const shown = aliveAt(y);
    const groups = new Map();
    shown.forEach(p => {
      if (!groups.has(p.r)) groups.set(p.r, []);
      groups.get(p.r).push(p);
    });
    const order = ATLAS.regimes.filter(r => groups.has(r.id))
      .sort((a, b) => a.founded.year - b.founded.year);
    const COLS = 4, ROWS = Math.max(1, Math.ceil(order.length / COLS));
    const TOP_PAD = 34, BOTTOM_PAD = 74;
    const cw = W / COLS, ch = (H - TOP_PAD - BOTTOM_PAD) / ROWS;
    const pos = {};
    const clusterOf = {};
    const clusterSize = {};
    const clusters = [];
    order.forEach((r, i) => {
      const cx = (i % COLS) * cw + cw / 2;
      const cy = TOP_PAD + Math.floor(i / COLS) * ch + ch / 2;
      const members = groups.get(r.id);
      const n = members.length;
      const rad = n <= 1 ? 0
        : n >= 10 ? Math.min(cw * 0.40, ch * 0.42, 20 + n * 6)
          : Math.min(cw * 0.34, ch * 0.32, 18 + n * 8);
      members.forEach((p, k) => {
        const ang = n === 1 ? 0 : (k / n) * Math.PI * 2 - Math.PI / 2;
        pos[p.id] = { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad };
        clusterOf[p.id] = { x: cx, y: cy };
        clusterSize[p.id] = n;
      });
      const topY = n ? Math.min.apply(null, members.map(p => pos[p.id].y)) : cy;
      clusters.push({ regime: r, cx, labelY: Math.max(14, topY - 34), members });
    });
    return { pos, clusters, clusterOf, clusterSize, shown };
  }

  /* ------------- 渲染 ------------- */
  function render() {
    if (!svg) return;
    const { pos, clusters, clusterOf, clusterSize, shown } = layout(year);
    gEdges.innerHTML = '';
    gNodes.innerHTML = '';
    gLabels.innerHTML = '';

    // 关系边
    const shownIds = new Set(shown.map(p => p.id));
    const curRel = relSetAt(year), prevRel = relSetAt(year - 1);
    newRelKeys = new Set([...curRel].filter(k => !prevRel.has(k)));
    lostRelKeys = new Set([...prevRel].filter(k => !curRel.has(k)));
    RELATIONS.forEach(([a, b, type]) => {
      if (!shownIds.has(a) || !shownIds.has(b) || !pos[a] || !pos[b]) return;
      const st = REL_TYPES[type] || { color: '#999', dash: '' };
      const key = relKey([a, b, type]);
      const isNew = newRelKeys.has(key);
      const line = el('path', {
        d: `M${pos[a].x.toFixed(1)} ${pos[a].y.toFixed(1)} L${pos[b].x.toFixed(1)} ${pos[b].y.toFixed(1)}`,
        class: 'p-edge' + (isNew ? ' new' : ''),
        'data-type': type,
        'data-a': a,
        'data-b': b
      }, gEdges);
      line.style.stroke = st.color;
      line.style.strokeDasharray = st.dash || 'none';
      line.style.opacity = isNew ? .9 : .34;
      if (isNew) line.style.strokeWidth = 2.4;
      const title = el('title', {}, line);
      title.textContent = `${byId[a].n} —${type}— ${byId[b].n}` + (isNew ? '（本年新出现）' : '');
    });

    // 人物节点
    shown.forEach(p => {
      const pt = pos[p.id];
      const regime = ATLAS.regimes.find(r => r.id === p.r);
      const dense = (clusterSize[p.id] || 0) >= 10;
      const g = el('g', {
        class: 'p-node' + (selected === p.id ? ' sel' : '') + (dense ? ' dense' : ''),
        transform: `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`,
        'data-id': p.id
      }, gNodes);
      const c = el('circle', { r: dense ? 8 : 10.5 }, g);
      c.style.fill = regime ? regime.color : '#888';
      const ring = el('circle', { r: dense ? 10.5 : 13.5, class: 'ring' }, g);
      // 名字沿"由政权簇中心向外"的方向摆放；单独人物则放在圆点下方
      const cc = clusterOf[p.id] || { x: pt.x, y: pt.y };
      let dx = pt.x - cc.x, dy = pt.y - cc.y;
      const len = Math.hypot(dx, dy);
      let lx, ly;
      if (len < 1) { lx = 0; ly = 24; }
      else { lx = (dx / len) * 22; ly = (dy / len) * 22 + 4; }
      const name = el('text', {
        x: lx.toFixed(1), y: ly.toFixed(1), class: 'p-name',
        'text-anchor': len < 1 ? 'middle' : (lx > 6 ? 'start' : (lx < -6 ? 'end' : 'middle'))
      }, g);
      name.textContent = p.n;
      const title = el('title', {}, g);
      title.textContent = `${p.n}（${p.role}）${p.a[0]}–${p.a[1]}　${p.end[0]}：${p.end[2]}`;
      g.addEventListener('mouseenter', (ev) => { hover(p.id, true); showTip(ev, p); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', (ev) => { hover(p.id, false); tipEl.hidden = true; });
      g.addEventListener('click', (ev) => { ev.stopPropagation(); select(p.id); });
      g._p = p;
    });

    // 图例：本年存续政权 + 关系类型
    const lg = $('#people-legend');
    if (lg) {
      lg.innerHTML =
        '<span class="legend-group">' + clusters.map(c =>
          `<span class="reg-legend"><i style="background:${c.regime.color}"></i>${c.regime.name}</span>`).join('') + '</span>' +
        '<span class="legend-group">' + Object.keys(REL_TYPES).map(t => {
          const st = REL_TYPES[t];
          return `<span class="rel-legend"><i style="border-top-color:${st.color};border-top-style:${st.dash ? 'dashed' : 'solid'}"></i>${t}</span>`;
        }).join('') + '</span>';
    }

    // 统计与侧栏
    renderSummary(shown);
    renderRelChange();
    renderDetail();
  }

  function hover(id, on) {
    if (!gEdges) return;
    gEdges.querySelectorAll('.p-edge').forEach(e => {
      const hit = e.getAttribute('data-a') === id || e.getAttribute('data-b') === id;
      e.style.opacity = hit ? .85 : (on ? .08 : .34);
      e.style.strokeWidth = hit ? 1.8 : 1;
    });
    gNodes.querySelectorAll('.p-node').forEach(n => {
      const hit = n.getAttribute('data-id') === id;
      n.style.opacity = on ? (hit ? 1 : .35) : 1;
    });
  }

  /* ------------- 侧栏 ------------- */
  function renderSummary(shown) {
    const alive = shown.length;
    const dead = shown.filter(p => p.end[1] <= year);
    $('#p-summary').innerHTML = `
      <div class="p-kpi"><b>${alive}</b> 人在世 / 活跃　<span>（全库 ${PEOPLE.length} 人）</span></div>
      <div class="p-kpi"><b>${dead.length}</b> 人已见结局</div>
      <div class="p-kpi rel-kpi"><span class="rel-add">＋${newRelKeys.size}</span> 组本年新出现关系　
        <span class="rel-lost">－${lostRelKeys.size}</span> 组本年中断</div>`;

    const counts = { violent: 0, power: 0, calm: 0 };
    dead.forEach(p => {
      for (const k in ENDING_GROUPS) {
        if (ENDING_GROUPS[k].types.includes(p.end[0])) counts[k]++;
      }
    });
    const max = Math.max(1, dead.length);
    const bars = Object.keys(ENDING_GROUPS).map(k => {
      const g = ENDING_GROUPS[k];
      return `<div class="bar-row">
        <span class="bar-label">${g.label}</span>
        <span class="bar-track"><i style="width:${(counts[k] / max * 100).toFixed(0)}%;background:${g.color}"></i></span>
        <span class="bar-num">${counts[k]}</span></div>`;
    }).join('');
    // 结局细分
    const detail = {};
    dead.forEach(p => { detail[p.end[0]] = (detail[p.end[0]] || 0) + 1; });
    const chips = Object.keys(detail).sort((a, b) => detail[b] - detail[a])
      .map(t => `<span class="end-chip">${t}<b>${detail[t]}</b></span>`).join('');
    $('#p-stats').innerHTML = bars + `<div class="end-chips">${chips}</div>`;

    const deaths = shown.filter(p => p.end[1] === year);
    $('#p-deaths').innerHTML = deaths.length
      ? deaths.map(p => {
        const r = ATLAS.regimes.find(x => x.id === p.r);
        return `<div class="death-row"><b style="color:${r ? r.color : '#555'}">${p.n}</b>
          <span class="dt">${p.end[0]}</span><em>${p.end[2]}</em></div>`;
      }).join('')
      : `<div class="death-row muted">本年无人物结局。</div>`;
  }

  function renderRelChange() {
    const box = $('#p-relchg');
    if (!box) return;
    const group = (keys, cls, label) => {
      const items = [...keys].slice(0, 10).map(k => {
        const parts = k.split('|');
        const A = byId[parts[0]], B = byId[parts[1]];
        if (!A || !B) return '';
        return `<button class="relchg-item ${cls}" data-a="${parts[0]}" data-b="${parts[1]}" title="${label}：${A.n} —${parts[2]}— ${B.n}">
          <span class="rt">${parts[2]}</span>${A.n} · ${B.n}</button>`;
      }).join('');
      const more = keys.size > 10 ? `<span class="relchg-more">另有 ${keys.size - 10} 组…</span>` : '';
      return items ? `<div class="relchg-group">${items}${more}</div>` : '';
    };
    const nh = group(newRelKeys, 'new', '本年新出现');
    const lh = group(lostRelKeys, 'lost', '本年中断');
    box.innerHTML = (nh || lh) ? (nh + lh)
      : '<div class="relchg-group muted">本年无关系变化（两端人物与上年相同）。</div>';
    box.querySelectorAll('[data-a]').forEach(b => {
      b.addEventListener('click', () => select(b.getAttribute('data-a')));
    });
  }

  function personTimeline(p) {
    const act = p.act || p.a;
    const items = [{ y: act[0], t: `出场：${p.role}`, cls: 'start' }];
    RELATIONS.forEach(([a, b, t]) => {
      if (a !== p.id && b !== p.id) return;
      const sp = REL_SPANS[a + '|' + b + '|' + t];
      if (!sp) return;
      const other = a === p.id ? b : a;
      const o = byId[other];
      if (!o) return;
      items.push({ y: sp[0], t: `与 ${o.n} 结为「${t}」`, cls: 'rel' });
      items.push({ y: sp[1], t: `与 ${o.n} 的「${t}」关系终结`, cls: 'rel-end' });
    });
    ATLAS.events.forEach(e => {
      if (e.text.includes(p.n)) {
        items.push({ y: e.year, t: e.text.length > 48 ? e.text.slice(0, 48) + '…' : e.text, cls: 'ev' });
      }
    });
    const endY = Math.max(p.end[1], act[1]);
    items.push({ y: p.end[1], t: `${p.end[0]}：${p.end[2]}`, cls: 'end' });
    // 去重、按年排序、去掉与出场/结局重叠的重复项
    const seen = new Set();
    const out = items.filter(it => it.y >= act[0] && it.y <= endY)
      .filter(it => { const k = it.y + '|' + it.t; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y2) => x.y - y2.y || (x.cls === 'rel' ? -1 : 0));
    return out.slice(0, 26);
  }

  function renderDetail() {
    const box = $('#p-detail');
    if (!selected || !byId[selected]) { box.innerHTML = ''; box.hidden = true; return; }
    const p = byId[selected];
    const r = ATLAS.regimes.find(x => x.id === p.r);
    const tags = (p.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    const rels = RELATIONS.filter(([a, b]) => a === selected || b === selected).map(([a, b, t]) => {
      const other = a === selected ? b : a;
      if (!byId[other]) return '';
      const sp = REL_SPANS[a + '|' + b + '|' + t];
      const yr = sp ? `<span class="rel-yr">${sp[0]}–${sp[1]}</span>` : '';
      return `<button class="rel-item" data-go="${other}"><span class="rt">${t}</span>${byId[other].n}${yr}</button>`;
    }).join('');
    box.hidden = false;
    box.innerHTML = `
      <div class="p-detail-head">
        <span class="p-dot" style="background:${r ? r.color : '#888'}"></span>
        <div>
          <h3>${p.n}</h3>
          <div class="p-role">${p.role}　<span>${p.a[0]}–${p.a[1]}</span></div>
        </div>
        <button class="p-close" aria-label="关闭">×</button>
      </div>
      <div class="p-tags">${tags}</div>
      <div class="p-end ${ENDING_GROUPS.violent.types.includes(p.end[0]) ? 'violent' : ENDING_GROUPS.power.types.includes(p.end[0]) ? 'power' : 'calm'}">
        <b>${p.end[0]}</b>（${p.end[1]}）　${p.end[2]}
      </div>
      <p class="p-note">${p.note || ''}</p>
      <div class="p-rels"><span class="p-rels-title">关系</span>${rels || '<em class="muted">暂无收录</em>'}</div>
      <div class="p-tl">
        <span class="p-rels-title">生平时间线 <small>（按年）</small></span>
        ${personTimeline(p).map(it =>
          `<div class="p-tl-row ${it.cls}"><span class="p-tl-y">${it.y}</span><span class="p-tl-t">${esc(it.t)}</span></div>`
        ).join('')}
      </div>`;
    box.querySelector('.p-close').addEventListener('click', () => { selected = null; render(); });
    box.querySelectorAll('[data-go]').forEach(b => {
      b.addEventListener('click', () => select(b.getAttribute('data-go')));
    });
  }

  function select(id) {
    selected = id;
    render();
    const p = byId[id];
    if (p && typeof window.atlasSetYear === 'function' && !isAlive(p, year)) {
      const act = p.act || p.a;
      window.atlasSetYear(Math.min(act[1], Math.max(act[0], p.end[1])));
    }
    // 选中后把人物卡滚进视野（侧栏可滚动）
    setTimeout(() => {
      const d = $('#p-detail');
      if (d && !d.hidden) d.scrollIntoView({ block: 'nearest' });
    }, 60);
  }

  /* ------------- 提示框 ------------- */
  function showTip(ev, p) {
    if (!tipEl) return;
    const alive = isAlive(p, year);
    const actLine = p.act ? `<br><span class="tip-sub">活跃 ${p.act[0]}–${p.act[1]}</span>` : '';
    tipEl.innerHTML = `<b>${p.n}</b>　${p.role}<br>
      <span class="tip-sub">${p.a[0]}–${p.a[1]}　${alive ? '在场' : '未出场'}</span>${actLine}<br>
      <span class="tip-sub">${(p.tags || []).join(' · ')}</span>`;
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

  /* ------------- 模式切换 ------------- */
  function setView(v) {
    active = v === 'people';
    document.body.dataset.view = v;
    document.querySelectorAll('[data-view]').forEach(b =>
      b.classList.toggle('on', b.getAttribute('data-view') === v));
    $('#side-map').hidden = v !== 'map';
    $('#side-people').hidden = v !== 'people';
    const sc = $('#side-chrono'); if (sc) sc.hidden = v !== 'chrono';
    const pw = $('#people-wrap'); if (pw) pw.hidden = v !== 'people';
    const cw = $('#chrono-wrap'); if (cw) cw.hidden = v !== 'chrono';
    const sw = $('#stats-wrap'); if (sw) sw.hidden = v !== 'stats';
    if (window.ChronoView) window.ChronoView.setActive(v === 'chrono');
    if (window.StatsView) window.StatsView.setActive(v === 'stats');
    if (active) render();
  }

  function init() {
    svg = $('#people-stage');
    if (!svg) return;
    gEdges = el('g', { class: 'p-edges' }, svg);
    gNodes = el('g', { class: 'p-nodes' }, svg);
    gLabels = el('g', { class: 'p-clusters' }, svg);
    tipEl = $('#p-tip');
    document.querySelectorAll('[data-view]').forEach(b => {
      b.addEventListener('click', () => setView(b.getAttribute('data-view')));
    });
    svg.addEventListener('click', () => { if (selected) { selected = null; render(); } });
    document.addEventListener('atlas:year', (e) => {
      year = e.detail.year;
      if (active) render();
    });
    year = (window.atlasGetYear && window.atlasGetYear()) || 907;
    const m = /view=(map|people|chrono|stats)/.exec(location.hash);
    setView(m ? m[1] : (document.body.dataset.view || 'map'));
  }

  function focus(id) {
    const p = byId[id];
    if (!p) return;
    setView('people');
    const act = p.act || p.a;
    if (typeof window.atlasSetYear === 'function' && !isAlive(p, year)) {
      window.atlasSetYear(Math.min(act[1], Math.max(act[0], p.end[1])));
    }
    select(id);
  }

  window.PeopleView = {
    refresh: (y) => { year = y; if (active) render(); },
    setView,
    focus,
    select: (id) => { setView('people'); select(id); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
