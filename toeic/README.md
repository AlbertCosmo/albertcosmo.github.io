# TOEIC-format Final Exam

Students open **https://albertcosmo.github.io/toeic/** on a phone, iPad or computer.
Questions, answer key and scores live in one Google Sheet in your Drive.

## One-time setup (≈10 min)

1. **Google Drive → New → Google Sheets.** Name it e.g. `TOEIC Final 2026`.
2. **Extensions → Apps Script.** Delete the sample code, paste all of [`Code.gs`](Code.gs), save.
3. Choose **`setup`** in the function menu → **Run** → authorize. The Sheet now has tabs
   `Settings`, `Questions` (15 sample items), `Scores`, `Starts`.
4. **Deploy → New deployment → Web app.** Execute as **Me**; Who has access **Anyone** → Deploy.
   Copy the URL ending in `/exec`.
5. In `toeic/index.html`, set `const API_URL = '<that URL>';` and push.

After editing `Code.gs` later, use **Deploy → Manage deployments → Edit → New version**
(keeps the same URL). Editing the Sheet needs no redeploy.

## Writing the test (`Questions` tab)

| Part | Group | Passage | Image | Audio | Question | A | B | C | D | Answer |
|---|---|---|---|---|---|---|---|---|---|---|

- One row = one question, numbered in row order. **Part** 1–7; **Answer** A–D.
- Rows with the same **Group** (e.g. `G1`) appear on one screen and share the first
  Passage/Image/Audio given — use for Parts 3, 4, 6, 7.
- Parts 1–2: Question and A–D text are **never sent** to students (spoken only, as in TOEIC),
  so you can keep transcripts there. Part 2 shows A–C; Part 1 shows A–D.
- **Audio/Image:** either a Google Drive share link (file shared "Anyone with the link")
  or a file in this repo, e.g. `media/part3-g1.mp3`. Repo hosting is more reliable;
  Drive audio can fail on some iPhones or for large files. Test on a phone first.
- No audio? Leave it blank and play the listening section on the classroom speakers.

## Settings tab

`examCode`, `isOpen`, `durationMinutes`, `graceMinutes`, `audioPlayLimit` (1 = TOEIC rule),
`showScoreToStudent`, `allowRetake`.

## Results (`Scores` tab)

One row per student: raw and per-part scores, Listening/Reading/Total, percent, minutes used,
`LATE` flag, tab-switch count, and every answer. Sort/filter or download as Excel.

**Score scale caveat:** the 5–495 section scores are a *linear estimate*
(`5 + 5·round(98·correct/total)`). Official TOEIC uses form-specific equating tables,
so these are not official TOEIC scores; use Percent if you prefer.

## Integrity features

- Answer key stays in the Sheet; grading is server-side.
- Exam code + open/close switch; one submission per Student ID.
- Timer is server-anchored (reloading does not reset it); auto-submits at 0.
- Answers autosave on the device; a reload or dropped Wi-Fi loses nothing.
- Tab switches are counted (a signal, not proof — screen locks also count).
- Not a lockdown browser: proctor the room as usual.

## To reset a student

Delete their row in `Scores` (and in `Starts` to restart their timer).
