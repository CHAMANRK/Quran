let quranData = [];
let currentAyat = null;
let selectedAyats = [];
let fromPara = 1, toPara = 30;
let quizIndex = 0;
let score = 0;
let totalQuestions = 10;
let mode = 'practice';
let usedIndexes = [];
let surahCorrectCount = {};
let startTime = 0, totalTime = 0, timer = null, timePerQ = [];
let survivalActive = true;
let hintCount = 0;
const maxHints = 2;
let streak = 0;
const TASBIH_BEADS = 20;
let searchFilter = 'all';
let typeTimer = null;

/* ============ AYAT TYPEWRITER EFFECT ============ */
function typeAyatText(text) {
  const el = document.getElementById('ayatText');
  if (typeTimer) clearInterval(typeTimer);
  el.textContent = '';
  el.classList.add('typing');
  const card = el.closest('.ayat-card');
  if (card) {
    card.classList.remove('pulse-in');
    void card.offsetWidth; // restart animation if triggered rapidly
    card.classList.add('pulse-in');
  }
  const chars = Array.from(text);
  let i = 0;
  typeTimer = setInterval(() => {
    el.textContent += chars[i];
    i++;
    if (i >= chars.length) {
      clearInterval(typeTimer);
      typeTimer = null;
      el.classList.remove('typing');
    }
  }, 38);
}

/* ============ SECTION SWITCH ============ */
function showSection(sectionId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(sectionId).classList.add('active');
  // Header (logo/title/streak/feedback) only makes sense on the home screen.
  const header = document.querySelector('.app-header');
  if (header) header.classList.toggle('hidden', sectionId !== 'welcomeScreen');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============ CORRECT/WRONG SCREEN FLASH ============
   Shared by single-player (script.js) and multiplayer (multiplayer.js) —
   exposed on window so the multiplayer module can call it too. */
function flashFeedback(isCorrect) {
  const el = document.getElementById('feedbackFlash');
  if (!el) return;
  el.classList.remove('flash-correct', 'flash-wrong');
  void el.offsetWidth; // restart animation if triggered rapidly
  el.classList.add(isCorrect ? 'flash-correct' : 'flash-wrong');
  setTimeout(() => el.classList.remove('flash-correct', 'flash-wrong'), 700);
}
window.flashFeedback = flashFeedback;

/* ============ TASBIH / STREAK ============ */
function initTasbih() {
  const track = document.getElementById('tasbihTrack');
  track.innerHTML = '';
  for (let i = 0; i < TASBIH_BEADS; i++) {
    const b = document.createElement('span');
    b.className = 'tasbih-bead';
    track.appendChild(b);
  }
}
function renderStreak() {
  document.getElementById('streakCount').textContent = streak;
  const beads = document.querySelectorAll('.tasbih-bead');
  beads.forEach((b, i) => {
    b.classList.toggle('filled', i < (streak % TASBIH_BEADS === 0 && streak > 0 ? TASBIH_BEADS : streak % TASBIH_BEADS));
  });
}

/* ============ MODE CARDS ============
   Tapping a mode card sets the mode AND jumps straight into para
   selection — no separate "Shuru Karein" button needed anymore. */
const MODE_LABELS = { practice: '🎯 Practice', timed: '⏱️ Timed', survival: '💥 Survival' };
function selectMode(m) {
  mode = m;
  const label = document.getElementById('selectedModeLabel');
  if (label) label.textContent = MODE_LABELS[m] || '';
  showSection('paraSelectScreen');
}
window.selectMode = selectMode;

/* ============ PARA PRESETS ============ */
document.querySelectorAll('.preset-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    document.getElementById('fromPara').value = card.dataset.from;
    document.getElementById('toPara').value = card.dataset.to;
  });
});

/* ============ SEARCH SCREEN ============ */
function openSearchScreen() {
  showSection('searchScreen');
  document.getElementById('searchInput').focus();
}

/* ============ QURAN DATA LOAD ============ */
async function loadQuranData() {
  try {
    quranData = await (await fetch('quran_full.json')).json();
    // `let` at top-level is NOT a window property, so we set this explicitly —
    // multiplayer.js (loaded as a separate <script type="module">) needs it.
    window.quranData = quranData;
    window.dispatchEvent(new Event('quranDataReady'));
  } catch (e) {
    alert('❌ Quran data load error: ' + e.message);
  }
}

/* ============ START GAME ============ */
function startGame() {
  fromPara = parseInt(document.getElementById('fromPara').value);
  toPara = parseInt(document.getElementById('toPara').value);
  const errDiv = document.getElementById('selectError');
  errDiv.classList.add('hidden');
  if (isNaN(fromPara) || isNaN(toPara) || fromPara < 1 || toPara > 30 || fromPara > toPara) {
    errDiv.textContent = "❌ Galat range! Para range 1–30 ke andar aur From <= To hona zaruri hai.";
    errDiv.classList.remove('hidden');
    return;
  }
  if (!quranData || quranData.length === 0) {
    errDiv.textContent = "❌ Quran data abhi load nahi hui.";
    errDiv.classList.remove('hidden');
    return;
  }
  selectedAyats = quranData.filter(a => fromPara <= a.para && a.para <= toPara);
  if (!selectedAyats.length) {
    errDiv.textContent = "❌ Is range ke andar ayat nahi mile.";
    errDiv.classList.remove('hidden');
    return;
  }
  quizIndex = 0;
  score = 0;
  usedIndexes = [];
  surahCorrectCount = {};
  timePerQ = [];
  totalTime = 0;
  hintCount = 0;
  streak = 0;
  renderStreak();
  document.getElementById('hintBtn').disabled = false;
  document.getElementById('hintInfo').textContent = `${hintCount}/${maxHints}`;
  document.getElementById('survivalAnswer').classList.add('hidden');
  if (mode === 'timed') totalQuestions = 10;
  else if (mode === 'practice') totalQuestions = 9999;
  else if (mode === 'survival') { totalQuestions = 9999; survivalActive = true; }
  nextQuestion();
  showSection('quizScreen');
  updateScore();
}

/* ============ QUESTION FLOW ============ */
function randomAyatIndex() {
  if (usedIndexes.length >= Math.min(totalQuestions, selectedAyats.length)) return -1;
  let i;
  do {
    i = Math.floor(Math.random() * selectedAyats.length);
  } while (usedIndexes.includes(i));
  usedIndexes.push(i);
  return i;
}

function updateProgressBar() {
  const fill = document.getElementById('progressFill');
  if (mode === 'timed') {
    fill.style.width = `${Math.min(100, (quizIndex / totalQuestions) * 100)}%`;
  } else {
    // practice / survival: show streak-based motion, cap visually
    fill.style.width = `${Math.min(100, (streak % 10) * 10 || (streak > 0 ? 100 : 0))}%`;
  }
}

function nextQuestion() {
  document.getElementById('quizError').classList.add('hidden');
  document.getElementById('quizResult').classList.add('hidden');
  document.getElementById('survivalAnswer').classList.add('hidden');
  document.getElementById('answerForm').reset();
  document.querySelector('.next-button').classList.add('hidden');
  document.getElementById('hintBtn').disabled = hintCount >= maxHints;
  document.getElementById('hintInfo').textContent = `${hintCount}/${maxHints}`;
  if (quizIndex >= totalQuestions || usedIndexes.length >= selectedAyats.length) {
    endQuiz();
    return;
  }
  const i = randomAyatIndex();
  if (i === -1) {
    endQuiz();
    return;
  }
  currentAyat = selectedAyats[i];
  typeAyatText(currentAyat.text);
  quizIndex++;
  updateScore();
  updateProgressBar();
  document.getElementById('quizProgress').textContent =
    mode === 'practice' ? `Practice Mode · Sawal ${quizIndex}` : `Sawal ${quizIndex} / ${mode === 'timed' ? totalQuestions : '∞'}`;
  startTime = Date.now();
  if (mode === 'timed') {
    startTimer(30);
  } else {
    document.getElementById('timer').textContent = '';
  }
}

function startTimer(seconds) {
  let time = seconds;
  document.getElementById('timer').textContent = `⏱️ ${time}s`;
  startTime = Date.now();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    time--;
    document.getElementById('timer').textContent = `⏱️ ${time}s`;
    if (time <= 0) {
      clearInterval(timer);
      document.getElementById('timer').textContent = "⏱️ Time's up!";
      timePerQ.push(seconds);
      streak = 0;
      renderStreak();
      showWrong("⏱️ Time's up!");
      if (mode === 'survival') {
        showSurvivalAnswer();
        setTimeout(() => endQuiz(), 1900);
      } else {
        document.querySelector('.next-button').classList.remove('hidden');
      }
    }
  }, 1000);
}

function showWrong(msg) {
  const resultDiv = document.getElementById('quizResult');
  resultDiv.textContent = msg;
  resultDiv.classList.remove('hidden', 'result');
  resultDiv.classList.add('error');
}

/* ============ ANSWER CHECK ============ */
function checkAnswer() {
  if (mode === 'timed' && timer) clearInterval(timer);
  let timeSpent = Math.round((Date.now() - startTime) / 1000);
  const user_page = document.getElementById('user_page').value.trim();
  const user_para = document.getElementById('user_para').value.trim();
  const user_page_in_para = document.getElementById('user_page_in_para').value.trim();
  const user_surah = document.getElementById('user_surah').value.trim().toLowerCase();

  const errorDiv = document.getElementById('quizError');
  const resultDiv = document.getElementById('quizResult');
  errorDiv.classList.add('hidden');
  resultDiv.classList.add('hidden');
  document.querySelector('.next-button').classList.add('hidden');
  document.getElementById('survivalAnswer').classList.add('hidden');
  let resultParts = [];
  let page_check = false, para_check = false, page_in_para_check = false, surah_check = true;

  if (!user_page && (!user_para || !user_page_in_para)) {
    errorDiv.textContent = "❌ Kam az kam Page Number ya Para Number + Page In Para likhiye.";
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 2300);
    return false;
  }

  const page_num_in_data = parseInt(currentAyat.page);
  const actual_para_num = parseInt(currentAyat.para);
  const actual_page_in_para = parseInt(currentAyat.pip);

  if (user_page) {
    const user_page_num = parseInt(user_page);
    if (user_page_num === page_num_in_data) {
      page_check = true;
    } else {
      resultParts.push(`❌ Page Number Galat! Sahi: ${page_num_in_data}`);
    }
  }

  if (user_para && user_page_in_para) {
    const user_para_num = parseInt(user_para);
    const user_page_in_para_num = parseInt(user_page_in_para);
    if (user_para_num === actual_para_num) {
      para_check = true;
    } else {
      resultParts.push(`❌ Para Galat! Sahi: ${actual_para_num}`);
    }
    if (user_page_in_para_num === actual_page_in_para) {
      page_in_para_check = true;
    } else {
      resultParts.push(`❌ Page In Para Galat! Sahi: ${actual_page_in_para}`);
    }
  }

  if (user_surah) {
    if (!currentAyat.surah_name.toLowerCase().includes(user_surah)) {
      resultParts.push(`❌ Surah Name Galat! Sahi: ${currentAyat.surah_name}`);
      surah_check = false;
    }
  }

  let isCorrect = ((!user_page || page_check) && para_check && page_in_para_check && surah_check);
  flashFeedback(isCorrect);
  if (isCorrect) {
    score++;
    streak++;
    let sname = currentAyat.surah_name;
    surahCorrectCount[sname] = (surahCorrectCount[sname] || 0) + 1;
    resultDiv.textContent = "✅ Sahi! +1 Point";
    resultDiv.classList.remove('hidden', 'error');
    resultDiv.classList.add('result');
  } else {
    streak = 0;
    resultDiv.innerHTML = resultParts.join('<br>') || "❌ Kuch Galat Hai ❌<br> 0 Point";
    resultDiv.classList.remove('hidden', 'result');
    resultDiv.classList.add('error');
    if (mode === 'survival') {
      survivalActive = false;
      renderStreak();
      showSurvivalAnswer();
      setTimeout(() => endQuiz(), 1900);
      timePerQ.push(timeSpent);
      updateScore();
      return false;
    }
  }
  renderStreak();
  updateProgressBar();
  document.querySelector('.next-button').classList.remove('hidden');
  timePerQ.push(timeSpent);
  updateScore();
  setTimeout(() => resultDiv.classList.add('hidden'), 5000);
  return false;
}

function showSurvivalAnswer() {
  let div = document.getElementById('survivalAnswer');
  let page_num_in_data = parseInt(currentAyat.page);
  let actual_para_num = parseInt(currentAyat.para);
  let actual_page_in_para = parseInt(currentAyat.pip);
  div.innerHTML = `<b>Sahi Jawab:</b><br>
  Surah: <b>${currentAyat.surah_name}</b><br>
  Para: <b>${actual_para_num}</b><br>
  Page: <b>${page_num_in_data}</b><br>
  Page in Para: <b>${actual_page_in_para}</b>`;
  div.classList.remove('hidden');
}

/* ============ END QUIZ / RESULT ============ */
function endQuiz() {
  let bestSurahName = '';
  let maxCorrect = 0;
  Object.entries(surahCorrectCount).forEach(([s, c]) => {
    if (c > maxCorrect) { maxCorrect = c; bestSurahName = s; }
  });
  let avgTime = timePerQ.length ? Math.round(timePerQ.reduce((a, b) => a + b, 0) / timePerQ.length) : 0;
  let pct = quizIndex > 0 ? Math.round((score / quizIndex) * 100) : 0;

  document.getElementById('scoreRing').style.setProperty('--pct', pct);
  document.getElementById('scoreRingText').textContent = `${pct}%`;
  document.getElementById('resultHeadline').textContent =
    mode === 'survival' && !survivalActive ? '💥 Survival Khatam!' :
    pct >= 80 ? '🎉 Zabardast!' : pct >= 50 ? '👍 Achha Kiya!' : '💪 Aur Practice Karo';

  document.getElementById('finalResult').innerHTML = `
    🧠 Score: <b>${score}/${quizIndex}</b><br>
    📖 Best Surah: <b>${bestSurahName || '-'}</b><br>
    ⏱️ Average Time: <b>${avgTime} sec</b><br>
    🔥 Best Streak: <b>${streak}</b>
  `;
  showSection('resultScreen');
}

function restartGame(home = false) {
  quizIndex = 0;
  score = 0;
  usedIndexes = [];
  surahCorrectCount = {};
  timePerQ = [];
  totalTime = 0;
  hintCount = 0;
  document.getElementById('hintBtn').disabled = false;
  document.getElementById('hintInfo').textContent = `${hintCount}/${maxHints}`;
  if (home) showSection('welcomeScreen');
  else showSection('paraSelectScreen');
}

/* ============ HINT ============ */
function showHint() {
  if (hintCount >= maxHints) return;
  hintCount++;
  document.getElementById('hintInfo').textContent = `${hintCount}/${maxHints}`;
  if (hintCount >= maxHints) document.getElementById('hintBtn').disabled = true;
  let surahWords = currentAyat.surah_name.split(" ");
  let first2 = surahWords.slice(0, 2).join(" ");
  let para = parseInt(currentAyat.para);
  document.getElementById('quizError').innerHTML =
    `<b>💡 Hint:</b> Surah: <b>${first2}...</b>, Para: <b>${para}</b>`;
  document.getElementById('quizError').classList.remove('hidden');
  setTimeout(() => document.getElementById('quizError').classList.add('hidden'), 3200);
}

function updateScore() {
  document.getElementById('scoreBoard').innerHTML = `Score: ${score} / ${quizIndex}`;
}

/* ============ SEARCH (live, debounced, filtered) ============ */
function removeDiacritics(text) {
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
}

// Unifies Arabic letter shapes that are the SAME letter but written differently
// (e.g. ٱ/أ/إ/آ are all forms of Alef, ى is a form of Yeh). This is ONLY used
// for matching during search — the original ayat text shown to the user is
// never changed. Distinct letters (like ة vs ه) are deliberately left alone.
function normalizeArabic(text) {
  return removeDiacritics(text)
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ -> ا
    .replace(/\u0649/g, '\u064A');                     // ى -> ي
}

let currentSearchResults = [];
let currentSearchPage = 0;
const RESULTS_PER_PAGE = 20;

document.getElementById('filterChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  searchFilter = chip.dataset.filter;
  searchAyats();
});

function highlightExactWord(text, input) {
  const words = text.split(/(\s+)/);
  return words.map(word => {
    const wordClean = normalizeArabic(word.toLowerCase());
    return wordClean === input || wordClean.includes(input) ? `<mark>${word}</mark>` : word;
  }).join('');
}

function searchAyats() {
  const inputRaw = document.getElementById('searchInput').value.trim();
  const input = normalizeArabic(inputRaw.toLowerCase());
  const resultsDiv = document.getElementById('searchResults');
  const metaDiv = document.getElementById('searchMeta');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  if (!input) {
    resultsDiv.innerHTML = "";
    metaDiv.classList.add('hidden');
    loadMoreBtn.classList.add('hidden');
    currentSearchResults = [];
    return;
  }

  currentSearchResults = quranData.filter(a => {
    const paraNum = String(a.para);
    if (searchFilter === 'text') return normalizeArabic(a.text.toLowerCase()).includes(input);
    if (searchFilter === 'surah') return normalizeArabic(a.surah_name.toLowerCase()).includes(input);
    if (searchFilter === 'page') return String(a.page) === input || paraNum === input;
    return normalizeArabic(a.text.toLowerCase()).includes(input) ||
      normalizeArabic(a.surah_name.toLowerCase()).includes(input) ||
      String(a.page) === input || paraNum === input;
  });

  currentSearchPage = 0;
  renderSearchResults(input);
}

function renderSearchResults(input) {
  const resultsDiv = document.getElementById('searchResults');
  const metaDiv = document.getElementById('searchMeta');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const total = currentSearchResults.length;

  if (total === 0) {
    resultsDiv.innerHTML = "<p style='color:var(--text-muted);text-align:center;padding:20px 0;'>Koi result nahi mila.</p>";
    metaDiv.classList.add('hidden');
    loadMoreBtn.classList.add('hidden');
    return;
  }

  metaDiv.textContent = `Total Matched: ${total}`;
  metaDiv.classList.remove('hidden');

  const endIndex = (currentSearchPage + 1) * RESULTS_PER_PAGE;
  const pageResults = currentSearchResults.slice(0, endIndex);

  resultsDiv.innerHTML = pageResults.map((r, idx) => {
    const paraNum = r.para;
    const globalIdx = quranData.indexOf(r);
    return `
      <div class="search-result" onclick="openReader(${globalIdx})">
        <div class="ayat-snippet">${highlightExactWord(r.text, input)}</div>
        <div class="result-meta">
          <span class="badge">${highlightExactWord(r.surah_name, input)}</span>
          <span class="badge">Page ${r.page}</span>
          <span class="badge">Para ${paraNum}</span>
        </div>
      </div>
    `;
  }).join("");

  loadMoreBtn.classList.toggle('hidden', endIndex >= total);
}

function loadMoreResults() {
  currentSearchPage++;
  const inputRaw = document.getElementById('searchInput').value.trim();
  renderSearchResults(normalizeArabic(inputRaw.toLowerCase()));
}

/* ============ IN-APP READER ============ */
const STANDARD_BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

function splitBismillah(ayat) {
  // Al-Faatiha's ayat 1 IS the Bismillah itself, and At-Tawba (surah 9) has none.
  if (ayat.ayat_no !== 1 || ayat.surah_number === 1 || ayat.surah_number === 9) {
    return { bismillah: null, body: ayat.text };
  }
  const words = ayat.text.split(' ');
  const first4 = words.slice(0, 4).join(' ');
  if (normalizeArabic(first4) === normalizeArabic(STANDARD_BISMILLAH)) {
    return { bismillah: first4, body: words.slice(4).join(' ') };
  }
  return { bismillah: null, body: ayat.text };
}

function openReader(clickedIndex) {
  const clicked = quranData[clickedIndex];
  if (!clicked) return;

  const pageAyats = quranData.filter(a => a.para === clicked.para && a.pip === clicked.pip);

  document.getElementById('readerParaLabel').textContent = `پارہ ${clicked.para} · صفحہ ${clicked.pip}`;

  let lastSurah = null;
  let html = '';
  pageAyats.forEach(a => {
    const isClicked = a === clicked;
    if (a.surah_name !== lastSurah) {
      html += `<div class="reader-surah-header">${a.surah_name}</div>`;
      lastSurah = a.surah_name;
    }
    const { bismillah, body } = splitBismillah(a);
    if (bismillah) {
      html += `<div class="reader-bismillah">${bismillah}</div>`;
    }
    html += `<span class="reader-ayat${isClicked ? ' jump-highlight' : ''}" ${isClicked ? 'id="jumpTarget"' : ''}>${body}<span class="ayat-num-marker">${a.ayat_no}</span></span> `;
  });

  document.getElementById('readerContent').innerHTML = html;
  showSection('readerScreen');

  setTimeout(() => {
    const target = document.getElementById('jumpTarget');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(searchAyats, 250);
});
document.getElementById('searchInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { searchAyats(); e.preventDefault(); }
});

/* ============ INIT ============ */
window.addEventListener('DOMContentLoaded', async () => {
  initTasbih();
  await loadQuranData();
});
