/* 全局搜索：人物 / 政权 / 大事 / 州府，命中后直接跳到对应视图与年份 */
(function () {
  'use strict';
  let input, box, items = [], cursor = -1;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build(q) {
    q = q.trim();
    if (!q) return [];
    const out = [];
    ATLAS.regimes.forEach(r => {
      if ((r.name + r.full + r.capital).includes(q)) {
        out.push({
          kind: '政权', cls: 'k-regime', color: r.color,
          label: r.name, sub: `${r.founded.year}–${r.ended.year}　都 ${r.capital}`,
          run: () => {
            if (window.PeopleView) PeopleView.setView('map');
            if (window.atlasSelectRegime) window.atlasSelectRegime(r.id);
            if (window.atlasSetYear) window.atlasSetYear(r.founded.year);
          }
        });
      }
    });
    PEOPLE.forEach(p => {
      if (p.n.includes(q) || p.role.includes(q) || (p.tags || []).some(t => t.includes(q))) {
        const reg = ATLAS.regimes.find(r => r.id === p.r);
        out.push({
          kind: '人物', cls: 'k-person', color: reg ? reg.color : '#888',
          label: p.n, sub: `${p.role}　${p.a[0]}–${p.a[1]}`,
          run: () => { if (window.PeopleView) PeopleView.focus(p.id); }
        });
      }
    });
    ATLAS.events.forEach(e => {
      if (e.text.includes(q)) {
        out.push({
          kind: '大事', cls: 'k-event', color: '#a63b2f',
          label: e.year + ' 年', sub: e.text.slice(0, 30) + (e.text.length > 30 ? '…' : ''),
          run: () => {
            if (window.PeopleView) PeopleView.setView('map');
            if (window.atlasSetYear) window.atlasSetYear(e.year);
          }
        });
      }
    });
    ATLAS.cities.forEach(c => {
      if ((c.name + (c.alt || '')).includes(q)) {
        out.push({
          kind: '州府', cls: 'k-city', color: '#7d7d7d',
          label: c.name, sub: (c.alt ? c.alt + '　' : '') + c.note.slice(0, 22),
          run: () => { if (window.PeopleView) PeopleView.setView('map'); }
        });
      }
    });
    // 同名优先精确匹配
    out.sort((a, b) => (b.label === q) - (a.label === q));
    return out.slice(0, 10);
  }

  function render() {
    if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = items.map((it, i) =>
      `<button class="sr-item ${it.cls}${i === cursor ? ' on' : ''}" data-i="${i}">
        <i style="background:${it.color}"></i>
        <span class="sr-kind">${it.kind}</span>
        <span class="sr-label">${esc(it.label)}</span>
        <span class="sr-sub">${esc(it.sub)}</span>
      </button>`).join('');
    // 用 fixed 定位，避免被顶栏/主区域的层叠上下文遮住
    const r = input.getBoundingClientRect();
    const w = Math.min(430, window.innerWidth - 24);
    box.style.position = 'fixed';
    box.style.width = w + 'px';
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    box.style.top = Math.round(r.bottom + 8) + 'px';
    box.querySelectorAll('[data-i]').forEach(b => {
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(+b.getAttribute('data-i')); });
    });
  }

  function pick(i) {
    const it = items[i];
    if (!it) return;
    it.run();
    box.hidden = true;
    input.blur();
  }

  function update() {
    items = build(input.value);
    cursor = -1;
    render();
  }

  function init() {
    input = $('#search');
    box = $('#search-results');
    if (!input || !box) return;
    // 移到 body 下，避免被顶栏的 backdrop-filter 层叠上下文困住
    document.body.appendChild(box);
    input.addEventListener('input', update);
    input.addEventListener('focus', () => { if (input.value.trim()) update(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { box.hidden = true; input.blur(); return; }
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + items.length) % items.length; render(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(cursor >= 0 ? cursor : 0); }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchbox')) box.hidden = true;
    });
    if (input.value.trim()) update();
  }

  window.AtlasSearch = { update };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
