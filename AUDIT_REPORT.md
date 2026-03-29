# Codebase Audit and Patch Report

## Scope
Audited:
- `site/index.html`
- `site/js/app.js`
- `site/js/data.js`
- `site/css/styles.css`

## Initial Findings
1. **Stored DOM injection risk**
   - Home score summaries were rendered with `innerHTML` from `localStorage` values.
   - Risk: tampered localStorage could inject markup into the page.

2. **Rapid action / button-mashing race conditions**
   - Start, submit, next, review, flag, and nav actions could be triggered repeatedly in quick succession.
   - Risk: inconsistent UI state, duplicate grading/finish attempts, timer race behavior.

3. **Timer finish race**
   - Timed auto-submit could overlap with manual finish navigation.
   - Risk: duplicate result rendering or unstable final state.

4. **Unsafe external URL handling**
   - Feedback links were opened without validating protocol.
   - Risk: malicious or malformed URLs.

5. **Keyboard shortcut collision**
   - `F` both selected answer choice `F` and flagged the question.
   - Risk: accidental flags and incorrect answer state.

6. **Question data trust**
   - Raw question objects were used without structural sanitization.
   - Risk: malformed content could break rendering or grading.

## Patches Applied
### Patch 1
- Added runtime guards:
  - `State.finishing`
  - short action lock / debounce helpers
- Added question sanitization before exam load
- Added score-record normalization
- Replaced score summary `innerHTML` usage with safe DOM construction

### Audit after Patch 1
- Syntax check passed
- Stored score rendering no longer trusts raw localStorage HTML
- Exam launch now resists repeated rapid start actions
- Invalid question structures are filtered before use

### Patch 2
- Hardened:
  - `tickTimer()`
  - `submitAnswer()`
  - `nextQuestion()`
  - `toggleFlag()`
  - `finishExam()`
  - `reviewExam()`
  - `confirmExit()`
  - `goHome()`
  - `openVideo()`
- Added duplicate-submit / duplicate-finish protections
- Added HTTPS-only external link validation

### Audit after Patch 2
- Syntax check passed
- Timer and manual finish paths no longer race
- Rapid clicks on submit/next/flag are throttled
- Invalid or unsafe links are blocked with user feedback

### Patch 3
- Updated feedback link visibility to only show safe URLs
- Added nav-grid click throttling
- Reworked keyboard handling:
  - suppress repeated keydown flooding for critical actions
  - `Shift+F` flags question to avoid collision with answer choice `F`
- Added browser-side security headers via meta tags:
  - Content Security Policy
  - Referrer Policy
- Updated on-screen shortcut help text

### Audit after Patch 3
- Syntax check passed
- Keyboard collision resolved
- Link button hidden/disabled when URL is unsafe
- CSP and referrer policy added without altering app flow

## Final Residual Risk Review
### Acceptable / Controlled Uses of `innerHTML`
Remaining `innerHTML` calls are limited to:
- clearing containers
- rendering numeric/stat markup from app-controlled values
- rendering escaped question text in review breakdown

These are low risk in the current design because:
- question text is escaped before injection
- score/stat fields are numeric or app-generated
- no user-supplied HTML is passed through

## Recommended Future Hardening
- Move CDN assets local or add SRI hashes
- Replace remaining inline `onclick` handlers with `addEventListener`
- Add automated browser tests for submit/next/timer flow
- Add optional session autosave / recovery
- Add accessibility announcements for timer warnings and result feedback

## Summary
The app logic was preserved while improving:
- **Confidentiality / integrity:** safer DOM rendering and URL validation
- **Availability:** reduced state corruption from rapid repeated actions
- **Reliability:** filtered malformed question data and prevented finish/timer races
