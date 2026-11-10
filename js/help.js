/* 帮助 / 关于面板：用法、数据规模、口径与版本 */
(function () {
  'use strict';
  let modal, openFlag = false;

  const $ = (s) => document.querySelector(s);
  const n = (x) => String(x);

  function fill() {
    const spans = window.REL_SPANS ? Object.keys(window.REL_SPANS).length : 0;
    const stats = [
      ['政权', ATLAS.regimes.length],
      ['疆域段', ATLAS.territories.length],
      ['大事', ATLAS.events.length],
      ['人物', PEOPLE.length],
      ['关系', RELATIONS.length],
      ['年份', ATLAS.span.end - ATLAS.span.start + 1 + ' 年']
    ];
    $('#hp-stats').innerHTML = stats.map(([k, v]) =>
      `<div class="hp-stat"><b>${n(v)}</b><span>${k}</span></div>`).join('');
  }

  function open() { modal.hidden = false; openFlag = true; document.body.classList.add('modal-open'); }
  function close() { modal.hidden = true; openFlag = false; document.body.classList.remove('modal-open'); }

  function init() {
    modal = $('#help-modal');
    if (!modal) return;
    fill();
    $('#help-btn').addEventListener('click', () => (openFlag ? close() : open()));
    $('#help-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && openFlag) { close(); return; }
      if (e.target.matches('input, textarea')) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); openFlag ? close() : open(); return; }
      // 1–4 切换视图
      const map = { '1': 'map', '2': 'people', '3': 'chrono', '4': 'stats' };
      if (map[e.key] && window.PeopleView) { e.preventDefault(); window.PeopleView.setView(map[e.key]); }
    });
    if (/help/.test(location.hash)) open();
  }

  window.HelpPanel = { open, close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
