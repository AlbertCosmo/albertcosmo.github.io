/**
 * Exam mode reports: receives reports from the reading quiz pages and writes them to this Google Sheet.
 *
 * Set-up (once):
 *   1. Open the "Exam mode reports" sheet in Google Drive.
 *   2. Extensions > Apps Script. Delete everything in Code.gs and paste this file. Save.
 *   3. Deploy > New deployment > Select type: Web app.
 *        Execute as: Me.   Who has access: Anyone.   Deploy, then allow access.
 *   4. Copy the Web app URL (it ends in /exec) and put it in EXAM_REPORT_URL in exam-mode.js.
 *
 * One row per attempt (identified by Session). The row is created when the student starts,
 * updated each time they leave the page, and completed when the quiz is submitted.
 * Started and Submitted are stamped with Google's clock when those reports arrive, so a wrong
 * clock on the student's device does not matter. (If the "started" report is lost, the device's
 * start time is used instead.)
 */

var HEADERS = ['Last update', 'Status', 'Class', 'Test', 'Passage', 'Student name', 'Student no.', 'Score', 'Out of',
               'Departures', 'Time away (s)', 'Auto-submitted', 'Started', 'Submitted', 'Departure log',
               'Question results', 'Device', 'Session', 'Update no.'];
var STARTED_COL = 13, SUBMITTED_COL = 14, SESSION_COL = 18, SEQ_COL = 19;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d || typeof d.session !== 'string' || !/^[a-z0-9]{8,40}$/i.test(d.session)) return out('bad request');

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    var now = new Date();
    var row = [
      now, d.status, d.cls, d.test, d.passage, d.name, d.id, num(d.score), num(d.outOf),
      num(d.departures), num(d.awaySec), d.auto ? 'yes' : '',
      d.status === 'started' ? now : time(d.started),
      d.status === 'submitted' ? now : '',
      d.log, d.results, d.device, d.session, num(d.seq)
    ].map(clean);

    var n = sheet.getLastRow() - 1, at = -1;
    if (n > 0) {
      var ids = sheet.getRange(2, SESSION_COL, n, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) if (ids[i][0] === d.session) { at = i + 2; break; }
    }
    if (at > 0) {
      // updates can arrive out of order: keep the newest, and never undo a submission
      var cur = sheet.getRange(at, 1, 1, SEQ_COL).getValues()[0];
      if (cur[1] === 'submitted' && d.status !== 'submitted') return out('ok');
      if (typeof cur[SEQ_COL - 1] === 'number' && typeof d.seq === 'number' && cur[SEQ_COL - 1] >= d.seq) return out('ok');
      // keep the first recorded start and submit times
      if (cur[STARTED_COL - 1] instanceof Date) row[STARTED_COL - 1] = cur[STARTED_COL - 1];
      if (cur[SUBMITTED_COL - 1] instanceof Date) row[SUBMITTED_COL - 1] = cur[SUBMITTED_COL - 1];
      sheet.getRange(at, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return out('ok');
  } catch (err) {
    return out('error');
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return out('Exam mode reports: the receiver is running.'); }

function out(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : ''; }
function time(t) { return (typeof t === 'number' && t > 0) ? new Date(t) : ''; }
// Plain text only: cap the length, and stop text being read as a spreadsheet formula.
function clean(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number') return v;
  v = String(v).slice(0, 2000);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
