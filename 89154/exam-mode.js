/* Exam mode for the reading quiz pages.
 *
 * Off by default. Add ?exam to a quiz link to turn it on, e.g.
 *   reading-test-12.html?exam#passage-1        (3 departures allowed, the default)
 *   reading-test-12.html?exam=2#passage-1      (submit on the 2nd departure)
 *   reading-test-12.html?c=fju&exam#passage-1  (works with the class header too)
 *
 * What it does:
 *  - Shows a start screen; Start asks for full screen (where the device supports it).
 *  - Records every departure: switching tab or app, switching window, leaving full screen,
 *    reloading the page. Each departure gets a warning; the last allowed one submits the
 *    passage automatically.
 *  - Blocks copy, cut, paste, right-click, dragging and printing. Selecting text still works,
 *    so the highlighter keeps working.
 *  - Hides "Try again", and adds a record of departures and time away to the result.
 *
 * A web page cannot stop a student using another device; this only detects and deters.
 */
(function () {
  'use strict';
  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  if (!params.has('exam')) return;

  var MAX = parseInt(params.get('exam'), 10);
  if (!(MAX >= 1 && MAX <= 20)) MAX = 3;
  var KEY = 'exam:' + location.pathname + (location.hash || '#all');

  // Where reports go: the Web app URL of the "Exam mode reports" Google Sheet (see exam-reports.gs).
  // Empty = nothing is sent; the record still shows on the student's screen.
  var REPORT_URL = window.EXAM_REPORT_URL || '';
  var CLASS = params.get('c') || (/\/89154\//.test(location.pathname) ? '89154' : '');

  // ---------- passages in this exam
  var only = /^#passage-[1-3]$/.test(location.hash) ? document.querySelector(location.hash) : null;
  var all = [].slice.call(document.querySelectorAll('.psg'));
  var active = only ? [only] : all;
  all.forEach(function (p) { if (only && p !== only) p.hidden = true; });
  active.forEach(function (p) { p.open = true; });

  // ---------- state (kept in this browser so a reload is recorded, not a fresh start)
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var state = { started: false, done: false, auto: false, startedAt: null, finishedAt: null, events: [],
                who: null, session: null, seq: 0 };
  var previous = load();

  var awayStart = null, blurTimer = null, ignoreUntil = 0, autoSubmitting = false;

  // ---------- styles
  var css = document.createElement('style');
  css.textContent =
    '.psg .reset{display:none!important}' +
    '@media print{body{display:none!important}}' +
    '.xm-veil{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}' +
    '.xm-veil.dim{background:rgba(0,0,0,.55)}' +
    '.xm-card{max-width:560px;width:100%;background:var(--card);color:var(--ink);border:1px solid var(--rule);border-radius:12px;padding:26px 28px;box-shadow:0 10px 40px rgba(0,0,0,.25)}' +
    '.xm-card h2{margin:0 0 12px;font-size:24px;font-weight:650}' +
    '.xm-card p,.xm-card li{font-size:17px;line-height:1.55;color:var(--mute)}' +
    '.xm-card ul{margin:0 0 16px;padding-left:20px}' +
    '.xm-card li{margin-bottom:6px}' +
    '.xm-card b{color:var(--ink)}' +
    '.xm-card .xm-warn{color:var(--bad);font-weight:700}' +
    '.xm-who{display:grid;gap:10px;margin:4px 0 14px}' +
    '.xm-who label{display:grid;gap:4px;font-size:15px;font-weight:650;color:var(--ink)}' +
    '.xm-who input{font:inherit;font-size:17px;padding:9px 12px;border:1.5px solid var(--rule);border-radius:7px;background:var(--bg);color:var(--ink)}' +
    '.xm-who input:focus-visible{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}' +
    '.xm-err{color:var(--bad);font-size:15px;font-weight:650;margin:0 0 8px}' +
    '.xm-card button{font:inherit;font-size:17px;font-weight:650;padding:12px 24px;border-radius:8px;border:0;background:var(--accent);color:#fff;cursor:pointer;margin-top:6px}' +
    '@media (prefers-color-scheme: dark){.xm-card button{color:#141414}}' +
    '.xm-badge{position:fixed;top:10px;right:10px;z-index:90;font-size:13.5px;font-weight:700;letter-spacing:.02em;padding:6px 12px;border-radius:999px;background:var(--card);color:var(--ink);border:1.5px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,.15)}' +
    '.xm-badge.hot{border-color:var(--bad);color:var(--bad)}' +
    '.xm-report{margin-top:12px;padding-top:12px;border-top:1px solid var(--rule);font-size:16px;line-height:1.5}' +
    '.xm-report ol{margin:6px 0 0;padding-left:22px}' +
    '.xm-report .xm-ok{color:var(--ok);font-weight:700}' +
    '.xm-report .xm-bad{color:var(--bad);font-weight:700}';
  document.head.appendChild(css);

  // ---------- helpers
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function canFs() { var d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  function goFs() {
    var d = document.documentElement;
    ignoreUntil = Date.now() + 1500;
    try {
      var r = d.requestFullscreen ? d.requestFullscreen() : d.webkitRequestFullscreen && d.webkitRequestFullscreen();
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }
  function clock(t) { var d = new Date(t); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function dur(ms) {
    if (ms == null) return 'still away';
    var s = Math.round(ms / 1000); if (s < 60) return s + ' s';
    return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
  }
  function totalAway() { return state.events.reduce(function (a, e) { return a + (e.ms || 0); }, 0); }
  function submitted(p) { var b = p.querySelector('.submit'); return !b || b.hidden; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function newSession() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '', r = null;
    try { r = crypto.getRandomValues(new Uint8Array(20)); } catch (e) {}
    for (var i = 0; i < 20; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % 36];
    return s;
  }
  function scoreOf() {
    var got = 0, out = 0, any = false;
    active.forEach(function (p) {
      var t = (p.querySelector('.score b') || {}).textContent || '';
      var m = t.match(/(\d+)\s*\/\s*(\d+)/), o = t.match(/\/\s*(\d+)/);
      if (m) { got += +m[1]; any = true; }
      if (o) out += +o[1];
    });
    return { score: any ? got : null, outOf: out };
  }
  function results() {
    var r = [];
    active.forEach(function (p) {
      p.querySelectorAll('.q').forEach(function (q) {
        var res = q.querySelector('.fb .res'); if (!res || q.querySelector('.fb').hidden) return;
        var part = res.textContent.match(/(\d+)\s*\/\s*(\d+) marks/);
        r.push(q.dataset.n + (part ? ' ' + part[1] + '/' + part[2] : res.classList.contains('ok') ? ' \u2713' : ' \u2717'));
      });
    });
    return r.join(', ');
  }
  // Fire-and-forget: sendBeacon still delivers while the page is being hidden or closed.
  function send(status) {
    if (!REPORT_URL || !state.who || !state.session) return;
    state.seq++; save();
    var sc = scoreOf();
    var body = JSON.stringify({
      session: state.session, seq: state.seq, status: status, cls: CLASS, test: document.title,
      passage: only ? only.id.replace('passage-', 'Passage ') : 'All passages',
      name: state.who.name, id: state.who.id, score: sc.score, outOf: sc.outOf,
      departures: state.events.length, awaySec: Math.round(totalAway() / 1000), auto: state.auto,
      started: state.startedAt, finished: state.finishedAt,
      log: state.events.map(function (e) { return clock(e.at) + ' ' + e.kind + ' (' + dur(e.ms) + ')'; }).join('; '),
      results: results(), device: (navigator.userAgent || '').slice(0, 150)
    });
    try { if (navigator.sendBeacon && navigator.sendBeacon(REPORT_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return; } catch (e) {}
    try { fetch(REPORT_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body }); } catch (e) {}
  }

  var veil = null;
  function show(html, dim, onBtn) {
    hide();
    veil = document.createElement('div');
    veil.className = 'xm-veil' + (dim ? ' dim' : '');
    veil.innerHTML = '<div class="xm-card" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(veil);
    var b = veil.querySelector('button');
    if (b) { b.addEventListener('click', function () { if (onBtn) onBtn(); }); b.focus(); }
  }
  function hide() { if (veil) { veil.remove(); veil = null; } }

  var badge = document.createElement('div');
  badge.className = 'xm-badge'; badge.hidden = true;
  document.body.appendChild(badge);
  function updateBadge() {
    badge.hidden = !state.started || state.done;
    badge.textContent = 'Exam mode · left page ' + state.events.length + ' / ' + MAX;
    badge.classList.toggle('hot', state.events.length > 0);
  }

  // ---------- the record shown under each result
  function report() {
    var n = state.events.length;
    var h = '<div class="xm-report"><b>Exam mode record' + (state.who ? ' for ' + esc(state.who.name) + ' (' + esc(state.who.id) + ')' : '') + '.</b> ';
    h += n === 0 ? '<span class="xm-ok">Stayed on the page the whole time.</span>'
                 : '<span class="xm-bad">Left the page ' + n + (n === 1 ? ' time' : ' times') + '</span>, ' + dur(totalAway()) + ' away in total.';
    if (state.auto) h += ' <span class="xm-bad">Submitted automatically.</span>';
    if (state.startedAt) h += ' Started ' + clock(state.startedAt) + (state.finishedAt ? ', finished ' + clock(state.finishedAt) : '') + '.';
    if (n) {
      h += '<ol>' + state.events.map(function (e) { return '<li>' + clock(e.at) + ' – ' + e.kind + ' (' + dur(e.ms) + ')</li>'; }).join('') + '</ol>';
    }
    return h + '</div>';
  }
  function renderReports() {
    active.forEach(function (p) {
      var sum = p.querySelector('.sum'); if (!sum || sum.hidden) return;
      var old = sum.querySelector('.xm-report'); if (old) old.remove();
      sum.insertAdjacentHTML('beforeend', report());
    });
  }

  // ---------- submitting
  var nativeConfirm = window.confirm;
  window.confirm = function (m) {
    if (autoSubmitting) return true;
    ignoreUntil = Date.now() + 100000;
    try { return nativeConfirm.call(window, m); } finally { ignoreUntil = Date.now() + 800; }
  };
  function checkDone() {
    if (state.done || !active.every(submitted)) return;
    state.done = true; state.finishedAt = Date.now(); save(); updateBadge(); renderReports();
    send('submitted');
  }
  function submitAll() {
    autoSubmitting = true;
    active.forEach(function (p) { var b = p.querySelector('.submit'); if (b && !b.hidden) b.click(); });
    autoSubmitting = false;
    checkDone();
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.submit')) setTimeout(checkDone, 0);
  }, true);
  // a result re-rendered by the page keeps its record
  new MutationObserver(function () { if (state.started) renderReports(); })
    .observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });

  // ---------- departures
  // sure = the page was really hidden; focus and full-screen changes get a short grace period,
  // because the browser's own full-screen switch and our confirm dialog also move focus.
  function leave(kind, sure) {
    if (!state.started || state.done || awayStart !== null) return;
    if (!sure && Date.now() < ignoreUntil) return;
    awayStart = Date.now();
    state.events.push({ at: awayStart, kind: kind, ms: null });
    save(); updateBadge();
    if (state.events.length >= MAX) { state.auto = true; submitAll(); }
    else send('in progress');
  }
  function back() {
    if (awayStart === null) return;
    var ev = state.events[state.events.length - 1];
    ev.ms = Date.now() - awayStart; awayStart = null;
    save(); updateBadge(); renderReports();
    send(state.done ? 'submitted' : 'in progress');
    var n = state.events.length;
    if (state.done) {
      show('<h2>Your answers were submitted</h2><p class="xm-warn">You left the quiz page ' + n + ' times, so your answers were submitted automatically.</p><p>Your result and the record of when you left are on the page. Show them to your teacher if asked.</p><button type="button">See my result</button>', true, hide);
    } else {
      var left = MAX - n;
      show('<h2>You left the quiz page</h2><p class="xm-warn">This has been recorded (' + n + ' of ' + MAX + ').</p><p>' +
           (left === 1 ? 'If you leave <b>once more</b>, your answers will be submitted automatically.' : 'If you leave ' + left + ' more times, your answers will be submitted automatically.') +
           '</p><button type="button">Continue the quiz</button>', true, function () { hide(); if (canFs() && !fsEl()) goFs(); });
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { clearTimeout(blurTimer); leave('switched tab or app', true); }
    else back();
  });
  window.addEventListener('blur', function () {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(function () { if (!document.hasFocus()) leave('switched to another window'); }, 400);
  });
  window.addEventListener('focus', function () { clearTimeout(blurTimer); if (document.visibilityState !== 'hidden') back(); });
  function onFs() {
    if (fsEl() || !state.started || state.done) return;
    if (awayStart !== null) return;                 // already away (switching tabs also leaves full screen)
    leave('left full screen');
    if (awayStart !== null) {                      // left full screen but is still here: end it at once
      setTimeout(function () { if (document.visibilityState !== 'hidden' && document.hasFocus()) back(); }, 300);
    }
  }
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  // ---------- copy, paste, right-click, print
  ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop'].forEach(function (t) {
    document.addEventListener(t, function (e) { if (state.started && !state.done) e.preventDefault(); }, true);
  });
  document.addEventListener('keydown', function (e) {
    if (!state.started || state.done) return;
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'p', 's', 'u'].indexOf(k) > -1) e.preventDefault();
    if (k === 'printscreen') e.preventDefault();
  }, true);
  window.addEventListener('beforeprint', function () { if (state.started && !state.done) leave('tried to print'); });

  // ---------- start
  function start() {
    if (!state.who) {
      var n = veil && veil.querySelector('#xm-name'), i = veil && veil.querySelector('#xm-id');
      var nv = n ? n.value.trim() : '', iv = i ? i.value.trim() : '';
      if (!nv || !iv) { var er = veil.querySelector('.xm-err'); if (er) er.hidden = false; (nv ? i : n).focus(); return; }
      state.who = { name: nv.slice(0, 80), id: iv.slice(0, 40) };
      try { localStorage.setItem('exam:who', JSON.stringify(state.who)); } catch (e) {}
    }
    if (!state.session) state.session = newSession();
    state.started = true;
    if (!state.startedAt) state.startedAt = Date.now();
    save(); hide(); updateBadge();
    if (canFs()) goFs();
    active.forEach(function (p) {
      var t = p.querySelector('.timer');
      if (t && /Start/.test(t.textContent)) t.click();
    });
    if (state.events.length >= MAX) { state.auto = true; submitAll(); }
    else send(state.events.length ? 'in progress' : 'started');
  }

  var rules =
    '<ul>' +
    '<li><b>Stay on this page until you submit.</b> Switching to another tab or app, another window, or out of full screen is recorded.</li>' +
    '<li>You may leave <b>' + (MAX - 1) + (MAX - 1 === 1 ? ' time' : ' times') + '</b> with a warning. The ' + (MAX === 1 ? 'first' : MAX === 2 ? '2nd' : MAX === 3 ? '3rd' : MAX + 'th') + ' time, your answers are <b>submitted automatically</b>.</li>' +
    '<li>Copying, pasting, right-click and printing are turned off. You can still highlight the passage.</li>' +
    '<li>Your result will show how many times you left and for how long. Your teacher may ask to see it.</li>' +
    '</ul>';

  if (previous && previous.done) {
    state = previous;
    show('<h2>Already submitted</h2><p>This quiz was submitted on this device at ' + clock(previous.finishedAt || previous.startedAt) +
         ' (left the page ' + previous.events.length + (previous.events.length === 1 ? ' time' : ' times') + ').</p><p>Ask your teacher if you need to take it again.</p>');
    return;
  }
  if (previous && previous.started) {
    state = previous;
    // A reload first looks like the page being hidden; turn that unfinished departure into the reload record.
    var last = state.events[state.events.length - 1];
    if (last && last.ms == null) { last.kind = 'reloaded or closed the page (answers were lost)'; last.ms = Date.now() - last.at; }
    else state.events.push({ at: Date.now(), kind: 'reloaded the page (answers were lost)', ms: 0 });
    save();
    send('in progress');
    show('<h2>Exam mode</h2><p class="xm-warn">You reloaded the page during the quiz. This has been recorded (' + state.events.length + ' of ' + MAX + '), and your earlier answers were lost.</p>' + rules +
         '<button type="button">' + (state.events.length >= MAX ? 'Submit and see my result' : 'Continue the quiz') + '</button>', false, start);
    return;
  }
  var who = null;
  try { who = JSON.parse(localStorage.getItem('exam:who')); } catch (e) {}
  show('<h2>Exam mode</h2><p>Read this before you begin.</p>' + rules +
       (canFs() ? '' : '<p>Full screen is not available on this device; leaving the page is still recorded.</p>') +
       '<div class="xm-who"><label>Your name<input id="xm-name" autocomplete="name" maxlength="80" value="' + esc(who && who.name || '') + '"></label>' +
       '<label>Student number<input id="xm-id" autocomplete="off" maxlength="40" value="' + esc(who && who.id || '') + '"></label></div>' +
       '<p class="xm-err" hidden>Please enter your name and student number.</p>' +
       '<button type="button">Start the quiz' + (canFs() ? ' in full screen' : '') + '</button>', false, start);
  if (veil) veil.querySelectorAll('input').forEach(function (inp) {
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); start(); } });
  });
  if (veil) { var first = veil.querySelector('#xm-name'); if (first && !first.value) first.focus(); }
})();
