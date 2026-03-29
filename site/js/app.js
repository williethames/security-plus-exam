/* ===========================
   PUBLIC API — assigned first so onclick handlers always find App.
   All functions below are declared with `function` keyword and are
   therefore hoisted to the top of this scope, making them valid here.
   =========================== */
window.App = {
  startExam:    function(l, m) { return startExam(l, m); },
  submitAnswer: function()      { return submitAnswer(); },
  nextQuestion: function()      { return nextQuestion(); },
  toggleFlag:   function()      { return toggleFlag(); },
  confirmExit:  function()      { return confirmExit(); },
  cancelExit:   function()      { return cancelExit(); },
  forceExit:    function()      { return forceExit(); },
  reviewExam:   function()      { return reviewExam(); },
  goHome:       function()      { return goHome(); },
  openVideo:    function()      { return openVideo(); },
};

/* ===========================
   App State
   =========================== */
var State = {
  examLetter: null,
  mode: null,           // 'timed' | 'study'
  questions: [],
  currentIndex: 0,
  answers: {},          // { qId: [selectedLetters] }
  results: {},          // { qId: true/false }
  flagged: new Set(),
  timerInterval: null,
  secondsRemaining: 5400,
  submitted: false,
  reviewMode: false,
  finishing: false,
  actionLockedUntil: 0,
};

function nowMs() {
  return Date.now ? Date.now() : new Date().getTime();
}

function lockAction(ms) {
  State.actionLockedUntil = nowMs() + (ms || 250);
}

function isActionLocked() {
  return nowMs() < State.actionLockedUntil;
}

function resetRuntimeGuards() {
  State.finishing = false;
  State.actionLockedUntil = 0;
}

function safeQuestionId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
}

function normalizeScoreRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  var correct = Number(raw.correct);
  var total = Number(raw.total);
  var pct = Number(raw.pct);
  var mode = raw.mode === 'Study' ? 'Study' : 'Timed';
  var date = typeof raw.date === 'string' ? raw.date.slice(0, 40) : '';

  if (!isFinite(correct) || !isFinite(total) || total <= 0 || correct < 0 || correct > total) {
    return null;
  }

  if (!isFinite(pct)) {
    pct = Math.round((correct / total) * 100);
  }

  pct = Math.max(0, Math.min(100, pct));

  return {
    correct: Math.round(correct),
    total: Math.round(total),
    pct: Math.round(pct),
    mode: mode,
    date: date
  };
}

function setScoreSummary(scoreEl, saved) {
  if (!scoreEl) return;
  scoreEl.textContent = '';

  if (!saved) return;

  var pct = Math.round((saved.correct / saved.total) * 100);
  var color = pct >= 80 ? '#77b300' : pct >= 70 ? '#ff8800' : '#cc0000';

  scoreEl.appendChild(document.createTextNode('Last: '));

  var strong = document.createElement('strong');
  strong.style.color = color;
  strong.textContent = pct + '%';
  scoreEl.appendChild(strong);

  scoreEl.appendChild(document.createTextNode(' (' + saved.correct + '/' + saved.total + ') — ' + saved.mode));
}

function sanitizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;

  var optionKeys = q.options && typeof q.options === 'object' ? Object.keys(q.options) : [];
  if (!q.id || typeof q.question !== 'string' || !Array.isArray(q.correct_answers) || !optionKeys.length) {
    return null;
  }

  var options = {};
  optionKeys.forEach(function(letter) {
    if (/^[A-G]$/.test(letter) && typeof q.options[letter] === 'string') {
      options[letter] = q.options[letter];
    }
  });

  var validAnswers = q.correct_answers.filter(function(letter) {
    return Object.prototype.hasOwnProperty.call(options, letter);
  });

  if (!Object.keys(options).length || !validAnswers.length) {
    return null;
  }

  return {
    num: q.num,
    exam: q.exam,
    id: safeQuestionId(q.id),
    question: q.question,
    options: options,
    correct_answers: validAnswers,
    explanation: typeof q.explanation === 'string' ? q.explanation : '',
    objective: typeof q.objective === 'string' ? q.objective : '',
    url: typeof q.url === 'string' ? q.url : ''
  };
}

function getExamQuestions(examLetter) {
  if (examLetter === 'D') {
    return ['A', 'B', 'C'].reduce(function(acc, letter) {
      var list = Array.isArray(EXAM_DATA[letter]) ? EXAM_DATA[letter] : [];
      return acc.concat(list);
    }, []);
  }
  return Array.isArray(EXAM_DATA[examLetter]) ? EXAM_DATA[examLetter] : [];
}

function getSafeExamQuestions(examLetter) {
  return getExamQuestions(examLetter).map(sanitizeQuestion).filter(Boolean);
}

function isSafeExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    var parsed = new URL(url, window.location.href);
    return parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/* ===========================
   DOM Helpers
   =========================== */
function el(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var target = document.getElementById('screen-' + id);
  if (target) {
    target.classList.add('active');
    target.scrollTop = 0;
  }
}

var _toastTimeout = null;
function showToast(msg, duration) {
  duration = duration || 2500;
  var t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(function() { t.classList.add('hidden'); }, duration);
}

/* ===========================
   Local Storage
   =========================== */
var Store = {
  key: function(exam) { return 'secplus_score_' + exam; },
  save: function(exam, data) {
    try { localStorage.setItem(Store.key(exam), JSON.stringify(data)); } catch(e) {}
  },
  load: function(exam) {
    try { return JSON.parse(localStorage.getItem(Store.key(exam))); } catch(e) { return null; }
  }
};

/* ===========================
   Home Screen — show past scores
   =========================== */
function renderHomeScores() {
  ['A', 'B', 'C', 'D'].forEach(function(letter) {
    var saved = normalizeScoreRecord(Store.load(letter));
    var scoreEl = el('score-' + letter);
    setScoreSummary(scoreEl, saved);
  });
}

/* ===========================
   Shuffle Helper
   =========================== */
function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/* ===========================
   Start Exam
   =========================== */
function startExam(examLetter, mode) {
  if (isActionLocked()) return;
  lockAction(300);

  State.examLetter = examLetter;
  State.mode = mode === 'study' ? 'study' : 'timed';
  State.currentIndex = 0;
  State.answers = {};
  State.results = {};
  State.flagged = new Set();
  State.submitted = false;
  State.reviewMode = false;
  resetRuntimeGuards();

  /* Build question list */
  if (examLetter === 'D') {
    State.questions = shuffleArray(getSafeExamQuestions('D')).slice(0, 85);
  } else {
    var raw = getSafeExamQuestions(examLetter).slice();
    var shuffleEl = document.getElementById('shuffle-' + examLetter);
    State.questions = (shuffleEl && shuffleEl.checked) ? shuffleArray(raw) : raw;
  }

  if (!State.questions.length) {
    showToast('No valid questions found for this exam.');
    return;
  }

  clearInterval(State.timerInterval);
  State.secondsRemaining = 5400;

  var titleMap = {
    A: 'Practice Exam A',
    B: 'Practice Exam B',
    C: 'Practice Exam C',
    D: 'Practice Exam D \u2014 Random Mix',
  };
  el('exam-title-bar').textContent = titleMap[examLetter] || 'Practice Exam';
  el('mode-badge').textContent = mode === 'timed' ? 'TIMED' : 'STUDY';
  el('mode-badge').className = 'mode-badge' + (mode === 'study' ? ' study-mode' : '');
  el('timer-wrap').classList.toggle('hidden', mode !== 'timed');

  showScreen('exam');
  buildNavGrid();
  renderQuestion();

  if (mode === 'timed') {
    updateTimerDisplay();
    State.timerInterval = setInterval(tickTimer, 1000);
  }
}

/* ===========================
   Timer
   =========================== */
function tickTimer() {
  if (State.finishing || State.submitted) {
    clearInterval(State.timerInterval);
    return;
  }

  State.secondsRemaining = Math.max(0, State.secondsRemaining - 1);
  updateTimerDisplay();

  if (State.secondsRemaining <= 0) {
    clearInterval(State.timerInterval);
    if (!State.finishing) {
      State.finishing = true;
      showToast('Time is up! Submitting exam\u2026', 3000);
      setTimeout(function() { finishExam(); }, 1500);
    }
  }
}

function updateTimerDisplay() {
  var s = Math.max(0, State.secondsRemaining);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  var mm = String(m).padStart ? String(m).padStart(2,'0') : (m < 10 ? '0'+m : ''+m);
  var ss = String(sec).padStart ? String(sec).padStart(2,'0') : (sec < 10 ? '0'+sec : ''+sec);
  el('timer-display').textContent = mm + ':' + ss;
  var wrap = el('timer-wrap');
  wrap.className = 'timer-wrap';
  if (s <= 300) wrap.classList.add('critical');
  else if (s <= 900) wrap.classList.add('warning');
}

/* ===========================
   Render Question
   =========================== */
function renderQuestion() {
  var q = State.questions[State.currentIndex];
  if (!q) return;

  var total = State.questions.length;
  var idx   = State.currentIndex;

  /* Progress bar */
  var pct = ((idx + 1) / total) * 100;
  el('progress-bar').style.width = pct + '%';
  el('progress-bar').setAttribute('aria-valuenow', Math.round(pct));
  el('progress-label').textContent = (idx + 1) + ' / ' + total;

  /* Live score */
  var answered = Object.keys(State.results).length;
  if (answered > 0) {
    var correct = Object.values(State.results).filter(Boolean).length;
    el('score-display').textContent = 'Score: ' + correct + '/' + answered;
  } else {
    el('score-display').textContent = 'Score: \u2014';
  }

  /* Question text */
  el('q-number').textContent = 'Question ' + (idx + 1) + ' of ' + total + ' \u2014 ' + q.id;
  el('q-text').textContent = q.question;

  var isMulti = q.correct_answers.length > 1;
  el('q-hint').textContent = isMulti ? 'Select ' + q.correct_answers.length + ' answers' : '';

  renderOptions(q);

  /* Flag button state */
  el('btn-flag').className = 'btn btn-flag' + (State.flagged.has(q.id) ? ' flagged' : '');

  var alreadyAnswered = Object.prototype.hasOwnProperty.call(State.results, q.id);

  if (alreadyAnswered || State.reviewMode) {
    el('btn-submit').classList.add('hidden');
    el('btn-next').classList.remove('hidden');
    markOptionsReveal(q);
    showFeedback(q);
  } else {
    el('btn-submit').classList.remove('hidden');
    el('btn-submit').disabled = true;
    el('btn-next').classList.add('hidden');
    hideFeedback();
  }

  updateNavGrid();
}

/* ===========================
   Render Options
   =========================== */
function renderOptions(q) {
  var list = el('options-list');
  list.innerHTML = '';
  var selectedAnswers = State.answers[q.id] || [];
  var alreadyAnswered = Object.prototype.hasOwnProperty.call(State.results, q.id);
  var isMulti = q.correct_answers.length > 1;

  Object.keys(q.options).forEach(function(letter) {
    var text = q.options[letter];

    var item = document.createElement('div');
    item.className = 'option-item';
    item.setAttribute('data-letter', letter);

    if (alreadyAnswered || State.reviewMode) {
      item.classList.add('disabled');
    }
    if (selectedAnswers.indexOf(letter) >= 0) {
      item.classList.add('selected');
    }

    var letterEl = document.createElement('div');
    letterEl.className = 'option-letter';
    letterEl.textContent = letter + '.';

    var textEl = document.createElement('div');
    textEl.className = 'option-text';
    textEl.textContent = text;

    var checkEl = document.createElement('div');
    checkEl.className = 'option-check';

    item.appendChild(letterEl);
    item.appendChild(textEl);
    item.appendChild(checkEl);

    if (!alreadyAnswered && !State.reviewMode) {
      item.addEventListener('click', (function(ltr) {
        return function() { toggleOption(q, ltr, isMulti); };
      }(letter)));
    }

    list.appendChild(item);
  });
}

/* ===========================
   Toggle Option Selection
   =========================== */
function toggleOption(q, letter, isMulti) {
  if (!q || State.finishing || State.reviewMode) return;
  if (Object.prototype.hasOwnProperty.call(State.results, q.id)) return;
  if (!Object.prototype.hasOwnProperty.call(q.options, letter)) return;

  if (!State.answers[q.id]) State.answers[q.id] = [];
  var arr = State.answers[q.id];
  var idx = arr.indexOf(letter);

  if (isMulti) {
    if (idx >= 0) arr.splice(idx, 1);
    else if (arr.indexOf(letter) === -1) arr.push(letter);
  } else {
    State.answers[q.id] = [letter];
  }

  renderOptions(q);
  el('btn-submit').disabled = State.answers[q.id].length === 0;
}

/* ===========================
   Reveal Correct / Incorrect After Submit
   =========================== */
function markOptionsReveal(q) {
  var items = el('options-list').querySelectorAll('.option-item');
  var userAnswers = State.answers[q.id] || [];
  var correctSet = {};
  q.correct_answers.forEach(function(a) { correctSet[a] = true; });

  items.forEach(function(item) {
    var letter = item.getAttribute('data-letter');
    item.classList.remove('selected', 'correct', 'incorrect', 'reveal-correct');

    var checkEl = item.querySelector('.option-check');
    var userPicked = userAnswers.indexOf(letter) >= 0;
    var isCorrect  = correctSet[letter];

    if (userPicked && isCorrect) {
      item.classList.add('correct');
      checkEl.textContent = '\u2713';
    } else if (userPicked && !isCorrect) {
      item.classList.add('incorrect');
      checkEl.textContent = '\u2717';
    } else if (!userPicked && isCorrect) {
      item.classList.add('reveal-correct');
      checkEl.textContent = '\u2713';
    }
  });
}

/* ===========================
   Submit Answer
   =========================== */
function submitAnswer() {
  if (State.finishing || State.reviewMode || isActionLocked()) return;

  var q = State.questions[State.currentIndex];
  if (!q || Object.prototype.hasOwnProperty.call(State.results, q.id)) return;

  var userAnswers = (State.answers[q.id] || []).filter(function(letter) {
    return Object.prototype.hasOwnProperty.call(q.options, letter);
  });

  if (!userAnswers.length) {
    showToast('Please select an answer.');
    return;
  }

  lockAction(250);

  /* Grade */
  var correct = q.correct_answers.slice().sort().join(',');
  var user    = userAnswers.slice().sort().join(',');
  var isCorrect = (correct === user);

  State.answers[q.id] = userAnswers.slice();
  State.results[q.id] = isCorrect;

  el('btn-submit').disabled = true;
  el('btn-submit').classList.add('hidden');
  el('btn-next').classList.remove('hidden');
  markOptionsReveal(q);
  showFeedback(q, isCorrect);
  updateNavGrid();
  updateScoreDisplay();
}

function updateScoreDisplay() {
  var answered = Object.keys(State.results).length;
  if (answered > 0) {
    var correct = Object.values(State.results).filter(Boolean).length;
    el('score-display').textContent = 'Score: ' + correct + '/' + answered;
  }
}

/* ===========================
   Feedback Panel
   =========================== */
function showFeedback(q, isCorrectParam) {
  var panel = el('feedback-panel');
  panel.classList.remove('hidden');

  var wasCorrect = Object.prototype.hasOwnProperty.call(State.results, q.id)
    ? State.results[q.id]
    : isCorrectParam;

  var resultEl = el('feedback-result');
  resultEl.textContent = wasCorrect ? '\u2713 Correct!' : '\u2717 Incorrect';
  resultEl.className = 'fw-bold fs-5 mb-2 ' + (wasCorrect ? 'text-success' : 'text-danger');

  var explEl = el('feedback-explanation');
  var explText = '';
  if (!wasCorrect) {
    var correctLetters = q.correct_answers.join(', ');
    explText = 'Correct answer' + (q.correct_answers.length > 1 ? 's' : '') + ': ' + correctLetters + '\n\n';
  }
  explText += (q.explanation || 'No explanation available.');
  explEl.textContent = explText;

  var objEl = el('feedback-objective');
  if (q.objective) {
    objEl.textContent = 'Objective: ' + q.objective;
    objEl.classList.remove('hidden');
  } else {
    objEl.classList.add('hidden');
  }

  var linkEl = el('feedback-link');
  if (isSafeExternalUrl(q.url)) {
    linkEl.setAttribute('data-url', q.url);
    linkEl.classList.remove('hidden');
    linkEl.disabled = false;
  } else {
    linkEl.setAttribute('data-url', '');
    linkEl.classList.add('hidden');
    linkEl.disabled = true;
  }
}

function hideFeedback() {
  el('feedback-panel').classList.add('hidden');
}

/* ===========================
   Navigate Between Questions
   =========================== */
function nextQuestion() {
  if (State.finishing || isActionLocked()) return;
  lockAction(200);

  var total = State.questions.length;
  if (State.currentIndex < total - 1) {
    State.currentIndex++;
    var examScreen = el('screen-exam');
    if (examScreen) examScreen.scrollTop = 0;
    renderQuestion();
  } else {
    if (State.reviewMode) {
      goHome();
    } else {
      finishExam();
    }
  }
}

/* ===========================
   Question Navigator Grid
   =========================== */
function buildNavGrid() {
  var grid = el('nav-grid');
  grid.innerHTML = '';
  State.questions.forEach(function(q, i) {
    var btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.textContent = i + 1;
    btn.title = q.id;
    btn.addEventListener('click', (function(idx) {
      return function() {
        if (State.finishing || isActionLocked()) return;
        lockAction(120);
        State.currentIndex = idx;
        var examScreen = el('screen-exam');
        if (examScreen) examScreen.scrollTop = 0;
        renderQuestion();
      };
    }(i)));
    grid.appendChild(btn);
  });
}

function updateNavGrid() {
  var btns = el('nav-grid').querySelectorAll('.nav-btn');
  State.questions.forEach(function(q, i) {
    var btn = btns[i];
    if (!btn) return;
    btn.className = 'nav-btn';
    if (i === State.currentIndex) {
      btn.classList.add('current');
    } else if (Object.prototype.hasOwnProperty.call(State.results, q.id)) {
      btn.classList.add(State.results[q.id] ? 'correct' : 'incorrect');
    } else if (State.flagged.has(q.id)) {
      btn.classList.add('flagged');
    }
  });
}

/* ===========================
   Flag Question
   =========================== */
function toggleFlag() {
  if (State.finishing || isActionLocked()) return;
  lockAction(120);

  var q = State.questions[State.currentIndex];
  if (!q) return;
  if (State.flagged.has(q.id)) {
    State.flagged.delete(q.id);
    el('btn-flag').className = 'btn btn-flag';
    showToast('Flag removed');
  } else {
    State.flagged.add(q.id);
    el('btn-flag').className = 'btn btn-flag flagged';
    showToast('Flagged for review');
  }
  updateNavGrid();
}

/* ===========================
   Finish Exam → Results Screen
   =========================== */
function finishExam() {
  if (State.submitted) return;

  State.finishing = true;
  clearInterval(State.timerInterval);
  State.submitted = true;

  var total    = State.questions.length;
  var answered = Object.keys(State.results).length;
  var correct  = Object.values(State.results).filter(Boolean).length;
  var pct      = Math.round((correct / total) * 100);
  var timeTaken = 5400 - State.secondsRemaining;

  Store.save(State.examLetter, {
    correct: correct,
    total: total,
    pct: pct,
    mode: State.mode === 'timed' ? 'Timed' : 'Study',
    date: new Date().toLocaleDateString()
  });
  renderHomeScores();

  /* Header */
  var titleMap = {
    A: 'Practice Exam A', B: 'Practice Exam B',
    C: 'Practice Exam C', D: 'Practice Exam D \u2014 Random Mix'
  };
  el('results-exam-label').textContent = titleMap[State.examLetter] || 'Practice Exam';
  el('results-title').textContent = 'Exam Complete';

  /* Score ring animation */
  var circumference = 327;
  var offset = circumference - (pct / 100) * circumference;
  var ringFill = el('ring-fill');
  ringFill.style.strokeDashoffset = circumference;
  ringFill.style.stroke = pct >= 80 ? '#77b300' : pct >= 70 ? '#ff8800' : '#cc0000';
  el('ring-pct').textContent = pct + '%';
  setTimeout(function() { ringFill.style.strokeDashoffset = offset; }, 200);

  /* Stats */
  var elapsed = State.mode === 'timed' ? formatTime(timeTaken) : '\u2014';
  el('results-stats').innerHTML =
    '<div class="stat-item"><div class="stat-value green">' + correct + '</div><div class="stat-label">CORRECT</div></div>' +
    '<div class="stat-item"><div class="stat-value red">'   + (total - correct) + '</div><div class="stat-label">INCORRECT</div></div>' +
    '<div class="stat-item"><div class="stat-value accent">'+ (total - answered) + '</div><div class="stat-label">SKIPPED</div></div>' +
    '<div class="stat-item"><div class="stat-value" style="color:#888">' + elapsed + '</div><div class="stat-label">TIME USED</div></div>';

  /* Grade */
  var gradeEl = el('results-grade');
  if (pct >= 80) {
    gradeEl.textContent = '\uD83C\uDF89 Excellent \u2014 You passed with high marks!';
    gradeEl.className = 'text-center mb-4 fs-5 fw-semibold results-grade pass';
  } else if (pct >= 70) {
    gradeEl.textContent = '\uD83D\uDCDA Almost there \u2014 Keep studying!';
    gradeEl.className = 'text-center mb-4 fs-5 fw-semibold results-grade close';
  } else {
    gradeEl.textContent = '\uD83D\uDD01 More study needed \u2014 Review the detailed answers.';
    gradeEl.className = 'text-center mb-4 fs-5 fw-semibold results-grade fail';
  }

  renderBreakdown();
  showScreen('results');
}

function formatTime(seconds) {
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  return m + 'm ' + s + 's';
}

function renderBreakdown() {
  var container = el('results-breakdown');
  var rows = State.questions.map(function(q) {
    var answered = Object.prototype.hasOwnProperty.call(State.results, q.id);
    var correct  = State.results[q.id];
    var cls  = !answered ? 'skipped' : correct ? 'correct' : 'incorrect';
    var icon = !answered ? 'SKIPPED' : correct ? '\u2713' : '\u2717';
    return '<div class="breakdown-row">' +
      '<div class="breakdown-q-id">' + q.id + '</div>' +
      '<div class="breakdown-q-text">' + escapeHtml(q.question) + '</div>' +
      '<div class="breakdown-result ' + cls + '">' + icon + '</div>' +
      '</div>';
  }).join('');

  container.innerHTML =
    '<div class="card-body">' +
      '<div class="breakdown-title">Question Breakdown</div>' +
      '<div class="breakdown-grid">' + rows + '</div>' +
    '</div>';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ===========================
   Review Mode
   =========================== */
function reviewExam() {
  if (isActionLocked()) return;
  lockAction(250);
  State.reviewMode = true;
  State.currentIndex = 0;
  el('mode-badge').textContent = 'REVIEW';
  el('mode-badge').className = 'mode-badge';
  el('timer-wrap').classList.add('hidden');
  showScreen('exam');
  buildNavGrid();
  renderQuestion();
}

/* ===========================
   Exit Handling
   =========================== */
function confirmExit() {
  if (isActionLocked()) return;
  lockAction(150);
  var noAnswersYet = Object.keys(State.results).length === 0;
  if (State.submitted || (State.mode === 'study' && noAnswersYet)) {
    forceExit();
    return;
  }
  el('modal-exit').classList.remove('hidden');
}

function cancelExit() {
  el('modal-exit').classList.add('hidden');
}

function forceExit() {
  el('modal-exit').classList.add('hidden');
  clearInterval(State.timerInterval);
  goHome();
}

function goHome() {
  clearInterval(State.timerInterval);
  resetRuntimeGuards();
  State.reviewMode = false;
  renderHomeScores();
  showScreen('home');
}

/* ===========================
   Init on DOM Ready
   =========================== */

/* ===========================
   Open Video Link
   =========================== */
function openVideo() {
  if (isActionLocked()) return;
  lockAction(200);

  var linkEl = el('feedback-link');
  var url = linkEl ? linkEl.getAttribute('data-url') : null;
  if (!isSafeExternalUrl(url)) {
    showToast('Unable to open this link safely.');
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

document.addEventListener('DOMContentLoaded', function() {
  renderHomeScores();
  showScreen('home');

  document.addEventListener('keydown', function(e) {
    var examScreen = document.getElementById('screen-exam');
    if (!examScreen || !examScreen.classList.contains('active')) return;
    if (e.repeat && (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || (e.key === 'F' && e.shiftKey))) {
      return;
    }

    var q = State.questions[State.currentIndex];
    if (!q) return;

    /* A/B/C/D/E/F/G to select option */
    var keyLower = e.key.toLowerCase();
    if ('abcdefg'.indexOf(keyLower) >= 0 && !State.reviewMode) {
      if (Object.prototype.hasOwnProperty.call(State.results, q.id)) return;
      var letter = e.key.toUpperCase();
      if (q.options[letter]) {
        toggleOption(q, letter, q.correct_answers.length > 1);
      }
    }

    /* Enter → submit or advance */
    if (e.key === 'Enter') {
      e.preventDefault();
      var submitBtn = el('btn-submit');
      var nextBtn   = el('btn-next');
      if (submitBtn && !submitBtn.classList.contains('hidden') && !submitBtn.disabled) {
        submitAnswer();
      } else if (nextBtn && !nextBtn.classList.contains('hidden')) {
        nextQuestion();
      }
      return;
    }

    /* Arrow navigation */
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      var nb = el('btn-next');
      if (nb && !nb.classList.contains('hidden')) nextQuestion();
      return;
    }
    if (e.key === 'ArrowLeft' && State.currentIndex > 0) {
      e.preventDefault();
      if (!isActionLocked()) {
        lockAction(120);
        State.currentIndex--;
        var screen = el('screen-exam');
        if (screen) screen.scrollTop = 0;
        renderQuestion();
      }
      return;
    }

    /* Shift+F → flag without colliding with answer choice F */
    if ((e.key === 'F' || e.key === 'f') && e.shiftKey) {
      e.preventDefault();
      toggleFlag();
    }
  });
});

