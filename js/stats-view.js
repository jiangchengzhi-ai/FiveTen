/* 数据视图：规模概览、完整性自检、分布统计
 * 目的：让人能一眼确认这份地图的数据是否自洽，而不是只看渲染结果。
 */
(function () {
  'use strict';
  let active = false, built = false;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const SPAN = ATLAS.span;
  const YEARS = SPAN.end - SPAN.start + 1;

  function checks() {
    const keys = RELATIONS.map(r => r[0] + '|' + r[1] + '|' + r[2]);
    const ids = new Set(PEOPLE.map(p => p.id));
    const dangling = RELATIONS.filter(r => !ids.has(r[0]) || !ids.has(r[1]));
    const noSrc = ATLAS.events.filter(e => !e.src);
    const noAct = PEOPLE.filter(p => !p.act);
    const noSpan = keys.filter(k => !(window.REL_SPANS || {})[k]);
    const years = new Set(ATLAS.events.map(e => e.year));
    const missingYears = [];
    for (let y = SPAN.start; y <= SPAN.end; y++) if (!years.has(y)) missingYears.push(y);
    const evOut = ATLAS.events.filter(e => e.year < SPAN.start || e.year > SPAN.end);
    const badTerritory = ATLAS.territories.filter(t => !ATLAS.regimes.some(r => r.id === t.regime));
    const endAfterDeath = PEOPLE.filter(p => p.end[1] > p.a[1]);
    const spanOrder = Object.entries(window.REL_SPANS || {}).filter(([, v]) => !(v[0] <= v[1]));

    return [
      { name: '事件年份都在 875–979 内', fail: evOut.length, total: ATLAS.events.length },
      { name: '每一年都有大事', fail: missingYears.length, total: YEARS, extra: missingYears.length ? missingYears.join('、') : '' },
      { name: '每条大事都有史源', fail: noSrc.length, total: ATLAS.events.length },
      { name: '每位人物都有活跃期', fail: noAct.length, total: PEOPLE.length },
      { name: '每条关系两端人物都存在', fail: dangling.length, total: RELATIONS.length },
      { name: '每条关系都有起止年', fail: noSpan.length, total: RELATIONS.length },
      { name: '关系起止年不倒置', fail: spanOrder.length, total: keys.length },
      { name: '人物结局年不晚于卒年', fail: endAfterDeath.length, total: PEOPLE.length },
      { name: '疆域段都指向存在的政权', fail: badTerritory.length, total: ATLAS.territories.length }
    ];
  }

  function barRow(label, value, max, color, suffix) {
    const w = Math.max(2, (value / max) * 100);
    return `<div class="st-row">
      <span class="st-label">${esc(label)}</span>
      <span class="st-track"><i style="width:${w.toFixed(0)}%;background:${color}"></i></span>
      <span class="st-num">${value}${suffix || ''}</span></div>`;
  }

  function build() {
    const body = $('#stats-body');
    if (!body) return;

    const kpi = [
      ['政权', ATLAS.regimes.length],
      ['疆域段', ATLAS.territories.length],
      ['大事', ATLAS.events.length],
      ['人物', PEOPLE.length],
      ['关系', RELATIONS.length],
      ['年份跨度', YEARS + ' 年']
    ].map(([k, v]) => `<div class="st-kpi"><b>${v}</b><span>${k}</span></div>`).join('');

    const cs = checks();
    const bad = cs.filter(c => c.fail > 0);
    const checkRows = cs.map(c => {
      const ok = c.fail === 0;
      return `<div class="st-check ${ok ? 'ok' : 'bad'}">
        <span class="st-mark">${ok ? '✓' : '✕'}</span>
        <span class="st-name">${esc(c.name)}</span>
        <span class="st-val">${ok ? c.total + ' 项通过' : c.fail + ' / ' + c.total + ' 未通过'}</span>
        ${c.extra ? `<span class="st-extra">${esc(c.extra)}</span>` : ''}
      </div>`;
    }).join('');

    // 每十年大事数
    const decades = [];
    for (let d = SPAN.start; d <= SPAN.end; d += 10) {
      const a = d, b = Math.min(d + 9, SPAN.end);
      const n = ATLAS.events.filter(e => e.year >= a && e.year <= b).length;
      decades.push([`${a}–${b}`, n]);
    }
    const maxDec = Math.max.apply(null, decades.map(d => d[1]));
    const decRows = decades.map(([l, n]) => barRow(l, n, maxDec, '#a8823c', ' 条')).join('');

    // 政权寿命 top10
    const life = ATLAS.regimes.map(r => ({ r, n: r.ended.year - r.founded.year + 1 }))
      .sort((a, b) => b.n - a.n).slice(0, 10);
    const maxLife = life[0].n;
    const lifeRows = life.map(x => barRow(x.r.name, x.n, maxLife, x.r.color, ' 年')).join('');

    // 结局分布
    const ends = {};
    PEOPLE.forEach(p => { ends[p.end[0]] = (ends[p.end[0]] || 0) + 1; });
    const endList = Object.entries(ends).sort((a, b) => b[1] - a[1]);
    const maxEnd = endList[0][1];
    const endRows = endList.map(([k, n]) => barRow(k, n, maxEnd, k === '病卒' || k === '善终' ? '#6f8494' : '#a63b2f', ' 人')).join('');

    // 关系类型分布
    const rels = {};
    RELATIONS.forEach(r => { rels[r[2]] = (rels[r[2]] || 0) + 1; });
    const relList = Object.entries(rels).sort((a, b) => b[1] - a[1]);
    const maxRel = relList[0][1];
    const relRows = relList.map(([k, n]) => barRow(k, n, maxRel, '#8a6a4a', ' 条')).join('');

    body.innerHTML = `
      <div class="st-kpis">${kpi}</div>
      <div class="st-grid">
        <section class="st-card">
          <h3>完整性自检 <small>${bad.length ? bad.length + ' 项待修' : '全部通过'}</small></h3>
          ${checkRows}
        </section>
        <section class="st-card">
          <h3>待核条目 <small>已知年份异说 / 低置信</small></h3>
          <ul class="st-watch">
            <li><b>925</b> 后唐封马殷楚国王：有 924 / 927 异说，暂置 925。</li>
            <li><b>931</b> 徐知诰出镇金陵：931 / 932 两说。</li>
            <li><b>949 / 950</b> 郭威天雄军节度使、邺都留守：同职异名，两条并存。</li>
            <li><b>910</b> 柏乡之战：战事跨 910 冬—911 春，系于 911 条。</li>
            <li>大事史源现为麦老师书稿年表（二次文献），<b>正史卷次待逐条回填</b>。</li>
            <li>疆域为示意边界，人物结局只标到年。</li>
          </ul>
        </section>
        <section class="st-card">
          <h3>每十年大事数</h3>
          ${decRows}
        </section>
        <section class="st-card">
          <h3>政权寿命 Top 10</h3>
          ${lifeRows}
        </section>
        <section class="st-card">
          <h3>人物结局分布 <small>${PEOPLE.length} 人</small></h3>
          ${endRows}
        </section>
        <section class="st-card">
          <h3>关系类型分布 <small>${RELATIONS.length} 条</small></h3>
          ${relRows}
        </section>
        <section class="st-card">
          <h3>口径提醒</h3>
          <p class="st-note">疆域为示意性简化边界；人物结局标到年，不区分月份；大事史源标到「纪/传/世家」一级，不虚构卷次。数据源与取舍见 <code>research/史料与口径.md</code>。</p>
        </section>
      </div>`;
    built = true;
  }

  function setActive(on) {
    active = on;
    if (on && !built) build();
  }

  function init() {
    // 供校验函数读取关系起止年
    window.REL_SPANS = REL_SPANS;
    build();
  }

  window.StatsView = { setActive, rebuild: () => { built = false; if (active) build(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
