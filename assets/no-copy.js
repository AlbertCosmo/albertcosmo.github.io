/* Copy protection for the reading and quiz pages. Always on; no setup needed.
 *
 * Used by 89154/reading-test-*.html and 84202/reading-quiz-*.html, which serve
 * 89154, 84202, 44201, 19203 and FJCU Advanced English (?c=fju).
 *
 * What it does:
 *  - Blocks copy and cut (keyboard shortcuts, the right-click menu, the phone's Copy button).
 *  - Blocks paste into the answer boxes, and dragging text in or out of the page.
 *  - Turns off the right-click menu, printing and "Save page as", so the text
 *    cannot be taken out through a PDF or a saved copy.
 *  - Selecting text still works, so the passage highlighter keeps working.
 *  - A short note tells the student why nothing happened.
 *
 * A web page cannot stop a photo, a screenshot or a student retyping the text;
 * this only stops copying and pasting in the browser.
 */
(function () {
  'use strict';
  if (window.__noCopy) return;
  window.__noCopy = true;

  var css = document.createElement('style');
  css.textContent =
    '@media print{body{display:none!important}}' +
    'html{-webkit-touch-callout:none}' +
    'img{-webkit-user-drag:none}' +
    '.nc-note{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:120;max-width:calc(100% - 32px);' +
    'font:600 15px/1.4 system-ui,-apple-system,sans-serif;padding:9px 16px;border-radius:8px;' +
    'background:var(--ink,#111);color:var(--bg,#fff);box-shadow:0 4px 14px rgba(0,0,0,.25);' +
    'opacity:0;transition:opacity .15s;pointer-events:none}' +
    '.nc-note.on{opacity:1}';
  (document.head || document.documentElement).appendChild(css);

  var note = null, noteTimer = null;
  function tell(msg) {
    if (!document.body) return;
    if (!note) {
      note = document.createElement('div');
      note.className = 'nc-note';
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      document.body.appendChild(note);
    }
    note.textContent = msg;
    note.classList.add('on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.classList.remove('on'); }, 1800);
  }

  function block(msg) {
    return function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.clipboardData) { try { e.clipboardData.setData('text/plain', ''); } catch (err) {} }
      if (msg) tell(msg);
      return false;
    };
  }

  var COPY = 'Copying is turned off on this page.';
  var PASTE = 'Pasting is turned off on this page. Please type your answer.';

  document.addEventListener('copy', block(COPY), true);
  document.addEventListener('cut', block(COPY), true);
  document.addEventListener('paste', block(PASTE), true);
  document.addEventListener('contextmenu', block(''), true);
  document.addEventListener('dragstart', block(''), true);
  document.addEventListener('drop', block(PASTE), true);
  document.addEventListener('dragover', function (e) { e.preventDefault(); }, true);
  // Backstop for browsers that insert pasted or dropped text without a paste event.
  document.addEventListener('beforeinput', function (e) {
    var t = e.inputType || '';
    if (t === 'insertFromPaste' || t === 'insertFromPasteAsQuotation' || t === 'insertFromDrop' || t === 'insertFromYank') {
      e.preventDefault(); tell(PASTE);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    var hit = '';
    if (mod && (k === 'c' || k === 'x')) hit = COPY;
    else if (mod && k === 'v') hit = PASTE;
    else if (mod && (k === 'p' || k === 's' || k === 'u')) hit = COPY;
    else if (k === 'insert' && (e.ctrlKey || e.shiftKey)) hit = e.shiftKey ? PASTE : COPY;  // Windows: Ctrl+Ins copy, Shift+Ins paste
    if (hit) { e.preventDefault(); e.stopPropagation(); tell(hit); }
  }, true);

  window.addEventListener('beforeprint', function () { tell('Printing is turned off on this page.'); });
})();
