/**
 * TOEIC-style Final Exam — Google Apps Script backend.
 *
 * Setup (once):
 *   1. Create a Google Sheet in Drive → Extensions → Apps Script → paste this file.
 *   2. Run setup() (authorize when asked). It creates the Settings, Questions,
 *      Scores and Starts tabs with sample questions.
 *   3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *   4. Copy the /exec URL into API_URL in toeic/index.html.
 *
 * The answer key stays in the Sheet; grading happens here, never in the browser.
 */

const TAB = { settings: 'Settings', questions: 'Questions', scores: 'Scores', starts: 'Starts' };

const DEFAULT_SETTINGS = [
  ['Key', 'Value', 'Note'],
  ['examTitle', 'English Final Exam (TOEIC format)', 'Shown to students'],
  ['examCode', 'FINAL2026', 'Students must type this to start'],
  ['isOpen', true, 'TRUE = students can start. Set FALSE after the exam (late submissions are still accepted and flagged).'],
  ['durationMinutes', 120, 'One timer for the whole test (real TOEIC: 45 L + 75 R)'],
  ['graceMinutes', 2, 'Submissions later than duration + grace are flagged LATE'],
  ['audioPlayLimit', 1, 'Times each audio clip may be played (0 = unlimited). Real TOEIC: 1'],
  ['showScoreToStudent', false, 'TRUE = student sees their score after submitting'],
  ['allowRetake', false, 'TRUE = same Student ID may submit more than once'],
];

const QUESTION_HEADERS = ['Part', 'Group', 'Passage', 'Image', 'Audio', 'Question', 'A', 'B', 'C', 'D', 'Answer'];

const SCORE_HEADERS = [
  'Submitted', 'Student ID', 'Name', 'Class',
  'Listening raw', 'Reading raw', 'Listening (5–495)', 'Reading (5–495)', 'Total', 'Percent',
  'Part 1', 'Part 2', 'Part 3', 'Part 4', 'Part 5', 'Part 6', 'Part 7',
  'Minutes used', 'Late', 'Tab switches', 'Answers',
];

// ---------- setup ----------

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const make = (name, rows) => {
    let sh = ss.getSheetByName(name);
    if (sh) return sh;                       // never overwrite existing data
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    return sh;
  };
  make(TAB.settings, DEFAULT_SETTINGS);
  make(TAB.questions, [QUESTION_HEADERS].concat(SAMPLE_QUESTIONS));
  make(TAB.scores, [SCORE_HEADERS]);
  make(TAB.starts, [['Student ID', 'Name', 'Class', 'First opened', 'Times opened', 'Last opened']]);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

// ---------- web endpoints ----------

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'info') {
      const s = settings_();
      return json_({ ok: true, title: s.examTitle, isOpen: s.isOpen });
    }
    if (p.action === 'exam') return json_(getExam_(p));
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'submit') return json_(submit_(body));
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ---------- exam delivery ----------

function getExam_(p) {
  const s = settings_();
  const sid = clean_(p.sid), name = clean_(p.name), cls = clean_(p.cls);
  if (!sid || !name) return { ok: false, error: 'Please enter your Student ID and name.' };
  if (String(p.code || '').trim().toUpperCase() !== String(s.examCode).trim().toUpperCase())
    return { ok: false, error: 'Exam code is incorrect.' };
  if (!s.allowRetake && hasSubmitted_(sid)) return { ok: false, error: 'This Student ID has already submitted the exam.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let startedAt;
  try {
    const existing = findStart_(sid);
    if (!existing && !s.isOpen) return { ok: false, error: 'The exam is not open.' };
    startedAt = recordStart_(sid, name, cls, existing);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    title: s.examTitle,
    durationMinutes: Number(s.durationMinutes) || 120,
    audioPlayLimit: Number(s.audioPlayLimit) || 0,
    startedAt: startedAt.getTime(),
    serverNow: Date.now(),
    groups: publicGroups_(readQuestions_()),
  };
}

/** Questions grouped for display, with NO answers. Parts 1–2 send no text (spoken only, as in TOEIC). */
function publicGroups_(qs) {
  const groups = [];
  let cur = null;
  qs.forEach(q => {
    if (!cur || !q.group || q.group !== cur.key || q.part !== cur.part) {
      cur = { key: q.group, part: q.part, passage: '', image: '', audio: '', questions: [] };
      groups.push(cur);
    }
    if (!cur.passage && q.passage) cur.passage = q.passage;
    if (!cur.image && q.image) cur.image = mediaUrl_(q.image, 'image');
    if (!cur.audio && q.audio) cur.audio = mediaUrl_(q.audio, 'audio');
    const spoken = q.part <= 2;
    const letters = ['A', 'B', 'C', 'D'];
    let options;
    if (spoken) {
      options = letters.slice(0, q.part === 2 ? 3 : 4).map(l => ({ letter: l, text: '' }));
    } else {
      options = letters.map((l, i) => ({ letter: l, text: q.options[i] })).filter(o => o.text !== '');
    }
    cur.questions.push({ n: q.n, text: spoken ? '' : q.question, options });
  });
  return groups.map(g => ({ part: g.part, passage: g.passage, image: g.image, audio: g.audio, questions: g.questions }));
}

// ---------- grading ----------

function submit_(b) {
  const s = settings_();
  const sid = clean_(b.sid), name = clean_(b.name), cls = clean_(b.cls);
  if (!sid) return { ok: false, error: 'Missing Student ID.' };
  if (String(b.code || '').trim().toUpperCase() !== String(s.examCode).trim().toUpperCase())
    return { ok: false, error: 'Exam code is incorrect.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!s.allowRetake && hasSubmitted_(sid)) return { ok: true, duplicate: true };
    const start = findStart_(sid);
    if (!start) return { ok: false, error: 'No exam start found for this Student ID.' };

    const qs = readQuestions_();
    const answers = b.answers || {};
    const part = {}, sec = { L: { raw: 0, n: 0 }, R: { raw: 0, n: 0 } };
    qs.forEach(q => {
      const given = String(answers[q.n] || '').trim().toUpperCase();
      const ok = q.answer !== '' && given === q.answer;
      part[q.part] = part[q.part] || { raw: 0, n: 0 };
      part[q.part].n++; if (ok) part[q.part].raw++;
      const k = q.part <= 4 ? 'L' : 'R';
      sec[k].n++; if (ok) sec[k].raw++;
    });

    const scaled = x => (x.n ? 5 + 5 * Math.round(98 * x.raw / x.n) : ''); // linear 5–495 estimate
    const L = scaled(sec.L), R = scaled(sec.R);
    const total = (L === '' ? 0 : L) + (R === '' ? 0 : R);
    const nAll = sec.L.n + sec.R.n, rawAll = sec.L.raw + sec.R.raw;
    const pct = nAll ? Math.round(1000 * rawAll / nAll) / 10 : 0;

    const now = new Date();
    const minutes = Math.round((now - start.first) / 600) / 100;
    const late = minutes > Number(s.durationMinutes) + Number(s.graceMinutes || 0);

    const row = [
      now, sid, name, cls,
      sec.L.n ? sec.L.raw + '/' + sec.L.n : '', sec.R.n ? sec.R.raw + '/' + sec.R.n : '',
      L, R, total, pct,
    ];
    for (let p = 1; p <= 7; p++) row.push(part[p] ? part[p].raw + '/' + part[p].n : '');
    row.push(minutes, late ? 'LATE' : '', Number(b.leaves) || 0,
      qs.map(q => q.n + ':' + (String(answers[q.n] || '-').toUpperCase())).join(' '));

    const sh = sheet_(TAB.scores);
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 2).setNumberFormat('@').setValue(sid); // keep leading zeros

    const res = { ok: true };
    if (s.showScoreToStudent) res.score = { listening: L, reading: R, total, percent: pct };
    return res;
  } finally {
    lock.releaseLock();
  }
}

// ---------- sheet helpers ----------

function settings_() {
  const rows = sheet_(TAB.settings).getDataRange().getValues().slice(1);
  const s = {};
  rows.forEach(r => { if (r[0]) s[String(r[0]).trim()] = r[1]; });
  ['isOpen', 'showScoreToStudent', 'allowRetake'].forEach(k => {
    s[k] = s[k] === true || String(s[k]).toUpperCase() === 'TRUE';
  });
  return s;
}

function readQuestions_() {
  const rows = sheet_(TAB.questions).getDataRange().getValues().slice(1);
  const qs = [];
  rows.forEach(r => {
    const part = Number(r[0]);
    if (!(part >= 1 && part <= 7)) return;            // skip blank / invalid rows
    qs.push({
      n: qs.length + 1, part,
      group: String(r[1]).trim(),
      passage: String(r[2]).trim(),
      image: String(r[3]).trim(),
      audio: String(r[4]).trim(),
      question: String(r[5]).trim(),
      options: [r[6], r[7], r[8], r[9]].map(v => String(v).trim()),
      answer: String(r[10]).trim().toUpperCase().charAt(0),
    });
  });
  return qs;
}

function hasSubmitted_(sid) {
  const sh = sheet_(TAB.scores);
  if (sh.getLastRow() < 2) return false;
  const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  const key = sid.toUpperCase();
  return ids.some(r => String(r[0]).trim().toUpperCase() === key);
}

function findStart_(sid) {
  const sh = sheet_(TAB.starts);
  if (sh.getLastRow() < 2) return null;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  const key = sid.toUpperCase();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toUpperCase() === key)
      return { row: i + 2, first: new Date(vals[i][3]), count: Number(vals[i][4]) || 1 };
  }
  return null;
}

function recordStart_(sid, name, cls, existing) {
  const sh = sheet_(TAB.starts);
  const now = new Date();
  if (existing) {
    sh.getRange(existing.row, 5, 1, 2).setValues([[existing.count + 1, now]]);
    return existing.first;
  }
  sh.appendRow([sid, name, cls, now, 1, now]);
  sh.getRange(sh.getLastRow(), 1).setNumberFormat('@').setValue(sid);
  return now;
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() in Apps Script.');
  return sh;
}

/** Google Drive share links → direct links. Other URLs (e.g. files on GitHub Pages) pass through. */
function mediaUrl_(url, kind) {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/);
  if (!m) return url;
  return kind === 'image'
    ? 'https://lh3.googleusercontent.com/d/' + m[1]
    : 'https://drive.google.com/uc?export=download&id=' + m[1];
}

function clean_(v) { return String(v || '').trim().slice(0, 100); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- sample questions (replace with your own) ----------
// Columns: Part | Group | Passage | Image | Audio | Question | A | B | C | D | Answer
// Rows sharing a Group share the first Passage / Image / Audio given.
// Parts 1–2: Question/A–D are never sent to students, so you may keep transcripts there.

const SAMPLE_QUESTIONS = [
  [1, '', '', '', '', '(Transcript) A) He is typing. B) He is reading a document. C) He is drinking coffee. D) He is closing a window.', '', '', '', '', 'B'],
  [2, '', '', '', '', '(Transcript) When does the meeting start? A) At ten o\'clock. B) In the conference room. C) Yes, it did.', '', '', '', '', 'A'],
  [2, '', '', '', '', '(Transcript) Who is in charge of the budget? A) It was expensive. B) Next month. C) Ms. Lee is.', '', '', '', '', 'C'],
  [3, 'G1', '', '', '', 'Where most likely are the speakers?', 'At a bank', 'At a hotel front desk', 'At a train station', 'At a restaurant', 'B'],
  [3, 'G1', '', '', '', 'What does the woman ask for?', 'A late checkout', 'A room upgrade', 'A taxi', 'Directions', 'A'],
  [3, 'G1', '', '', '', 'What does the man offer to do?', 'Call a manager', 'Print a receipt', 'Store her luggage', 'Change her booking', 'C'],
  [4, 'G2', '', '', '', 'What is being announced?', 'A delayed flight', 'A gate change', 'A lost item', 'A new airline lounge', 'B'],
  [4, 'G2', '', '', '', 'What are passengers asked to do?', 'Show their passports', 'Check their bags', 'Go to Gate 14', 'Wait in their seats', 'C'],
  [5, '', '', '', '', 'The new software will be installed ------- all office computers next week.', 'on', 'at', 'of', 'by', 'A'],
  [5, '', '', '', '', 'Ms. Tanaka was ------- for her excellent work on the merger.', 'recognize', 'recognized', 'recognizing', 'recognition', 'B'],
  [5, '', '', '', '', 'Applicants should submit their résumés ------- the end of the month.', 'before', 'during', 'between', 'among', 'A'],
  [6, 'G3', 'To all staff:\n\nBeginning Monday, the east parking lot will be closed for repairs. Employees are asked to park in the west lot ---(12)---. The work is expected to ---(13)--- about two weeks. Thank you for your patience.\n\nFacilities Department', '', '', 'Question 12', 'instead', 'therefore', 'although', 'unless', 'A'],
  [6, 'G3', '', '', '', 'Question 13', 'last', 'lasting', 'lasted', 'lasts', 'A'],
  [7, 'G4', 'From: Daniel Ortiz, Office Manager\nTo: All employees\nSubject: Holiday party\n\nThe annual holiday party will be held on Friday, December 18, at the Riverside Hotel. Dinner will be served at 7 p.m. Please reply to this e-mail by December 4 so that we can give the hotel an accurate count. Family members are welcome.', '', '', 'Why did Mr. Ortiz send the e-mail?', 'To announce an event', 'To change a reservation', 'To request a report', 'To introduce a new employee', 'A'],
  [7, 'G4', '', '', '', 'What are employees asked to do by December 4?', 'Pay a fee', 'Confirm attendance', 'Book a hotel room', 'Choose a meal', 'B'],
];
