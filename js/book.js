/* 章节导航：把书稿 8 部 78 章映射到年份，点章节跳到对应年份 */
(function () {
  'use strict';
  let modal, openFlag = false;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function currentYear() {
    return (window.atlasGetYear && window.atlasGetYear()) || 0;
  }

  function render() {
    const body = $('#book-body');
    if (!body) return;
    const vols = [];
    BOOK_CHAPTERS.forEach(c => {
      let v = vols.find(x => x.name === c.v);
      if (!v) { v = { name: c.v, chapters: [] }; vols.push(v); }
      v.chapters.push(c);
    });
    const cur = currentYear();
    body.innerHTML = vols.map(v => {
      const ys = v.chapters.map(c => c.y).filter(y => y);
      const lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      const chapters = v.chapters.map(c => {
        const active = cur && c.y && Math.abs(c.y - cur) <= 1 ? ' on' : '';
        const tip = (c.s && c.e && c.s !== c.e) ? '本章涉及 ' + c.s + '–' + c.e + ' 年' : '';
        return `<button class="bk-ch${active}" data-y="${c.y}" title="${esc(tip)}">
          <span class="bk-n">${esc(c.c)}</span>
          <span class="bk-y">约 ${c.y || '?'} 年${c.n ? ' · ' + c.n + ' 节' : ''}</span>
        </button>`;
      }).join('');
      return `<section class="bk-vol">
        <h3>${esc(v.name)}<small>${lo}–${hi}</small></h3>
        <div class="bk-chaps">${chapters}</div>
      </section>`;
    }).join('');
    body.querySelectorAll('[data-y]').forEach(b => {
      b.addEventListener('click', () => {
        const y = +b.getAttribute('data-y');
        if (y && window.atlasSetYear) window.atlasSetYear(y);
        close();
      });
    });
  }

  function open() { render(); modal.hidden = false; openFlag = true; document.body.classList.add('modal-open'); }
  function close() { modal.hidden = true; openFlag = false; document.body.classList.remove('modal-open'); }

  function init() {
    modal = $('#book-modal');
    if (!modal || typeof BOOK_CHAPTERS === 'undefined') return;
    $('#book-btn').addEventListener('click', () => (openFlag ? close() : open()));
    $('#book-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'Escape' && openFlag) { close(); return; }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); openFlag ? close() : open(); }
    });
    if (/book/.test(location.hash)) open();
  }

  window.BookNav = { open, close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
