/* ============================================================
   ONLINE MULTIPLAYER (Beta) — Room-code based 1v1, Kahoot-style
   live-synced questions, powered by Firebase Realtime Database.

   Loaded as <script type="module"> so it can `import` Firebase directly.
   Talks to the DOM (screens defined in index.html) the same way script.js
   does, and reads the already-loaded Quran data off `window.quranData`
   (see the quranDataReady event dispatched from script.js).

   GAME FLOW (confirmed design):
   - Both players get the same 9 ayat, same order.
   - Each player answers at their OWN pace — no waiting between
     questions. Only your own progress/score is written to Firebase,
     so there is never a write-conflict between the two players.
   - Whoever finishes first sees a "waiting for opponent" screen with
     the opponent's LIVE progress (e.g. "Opponent 6/9 pe hai...").
   - Once both finish, winner is decided in this order:
       1) Higher score wins.
       2) Score tied -> lower total time wins.
       3) Score AND time both tied (true race condition) -> 2 new
          "Sudden Death" questions. Same rule applies to just those
          2 questions (score first, then time). If still tied, repeat
          with 2 more questions, forever, until someone wins.
   - Disconnect handling: presence (online/offline) is tracked via
     Firebase's ".info/connected" + onDisconnect. If your opponent
     goes offline mid-game, you get a 30s countdown; if they don't
     reconnect in time, you're declared the winner (forfeit). This
     is judged independently by whichever client is still online, so
     there's no conflict with the disconnected client (it can't write).

   FUTURE (not built yet): a "Random Opponent" auto-matchmaking mode.
   Plan: push the waiting player into /matchmaking/{uid}, have the next
   player who queues get paired with them into a fresh /rooms/{code}
   automatically instead of typing a code. Left as a TODO for now since
   the current requirement is just 1v1 via room code.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getDatabase, ref, set, get, update, remove, onValue, off,
  serverTimestamp, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

/* ============ FIREBASE INIT ============
   NOTE: `databaseURL` was missing from the config snippet — Realtime
   Database needs it explicitly (it isn't inferred from projectId). */
const firebaseConfig = {
  apiKey: "AIzaSyB99IukU3A9SHpmYiO2QJ7anYuoohwlwnc",
  authDomain: "quran-quiz-85.firebaseapp.com",
  databaseURL: "https://quran-quiz-85-default-rtdb.firebaseio.com/",
  projectId: "quran-quiz-85",
  storageBucket: "quran-quiz-85.firebasestorage.app",
  messagingSenderId: "1074137604510",
  appId: "1:1074137604510:web:cc7caceb53b9045fc9f68f"
};
const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);

/* ============ STATE ============ */
let mpRoomCode = null;
let mpRole = null;            // 'host' | 'guest'
let mpRoomRef = null;
let mpMyName = '';

let mpCurrentAyat = null;
let mpHasAnsweredThisQ = false;

let mpLastStageKey = null;      // 'main' or `sd-<round>` — detects new stage
let mpLastLoadedStageKey = null;
let mpLastMyProgress = -1;      // detects when *my* next question should load

let mpDeciding = false;         // guards host's winner-decision writes
let mpDisconnectTimer = null;
let mpDisconnectSeconds = 30;
let mpTypeTimer = null;         // drives the ayat typewriter effect

const MP_TOTAL_QUESTIONS = 9;
const MP_SD_QUESTIONS = 2;
const MP_DISCONNECT_GRACE = 30; // seconds

function waitForQuranData() {
  return new Promise(resolve => {
    if (window.quranData && window.quranData.length) return resolve();
    window.addEventListener('quranDataReady', () => resolve(), { once: true });
  });
}

function mpGenerateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ============ AYAT TYPEWRITER EFFECT (matches single-player feel) ============ */
function mpTypeAyatText(text) {
  const el = document.getElementById('mpAyatText');
  if (mpTypeTimer) clearInterval(mpTypeTimer);
  el.textContent = '';
  el.classList.add('typing');
  const card = el.closest('.ayat-card');
  if (card) {
    card.classList.remove('pulse-in');
    void card.offsetWidth;
    card.classList.add('pulse-in');
  }
  const chars = Array.from(text);
  let i = 0;
  mpTypeTimer = setInterval(() => {
    el.textContent += chars[i];
    i++;
    if (i >= chars.length) {
      clearInterval(mpTypeTimer);
      mpTypeTimer = null;
      el.classList.remove('typing');
    }
  }, 38);
}

function mpFreshPlayerState(name) {
  return { name, online: true, score: 0, progress: 0, finished: false, finishedAt: null };
}

/* ============ PRESENCE (handles disconnect + reconnect) ============ */
function mpSetupPresence() {
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snap) => {
    if (snap.val() === true && mpRoomCode && mpRole) {
      const onlineRef = ref(db, `rooms/${mpRoomCode}/${mpRole}/online`);
      onDisconnect(onlineRef).set(false);
      set(onlineRef, true).catch(() => {});
    }
  });
}

/* ============ COPY ROOM CODE ============
   Three-tier fallback because clipboard behavior varies a lot across
   browsers/sandboxed preview frames:
     1) navigator.clipboard.writeText (modern, secure-context only)
     2) a temp, visible-enough textarea + document.execCommand('copy')
        (works in most non-secure/older contexts)
     3) iOS Safari special case: execCommand ignores an <textarea> that
        isn't "contentEditable" the normal way, so we select the actual
        on-screen code element via the Selection API and execCommand
        from that — this also means if literally everything is blocked
        (e.g. clipboard permissions denied by a sandboxed iframe), the
        text ends up selected so the user can still long-press → Copy. */
function mpSelectCodeElement() {
  const codeEl = document.getElementById('mpRoomCodeDisplay');
  if (!codeEl) return false;
  try {
    const range = document.createRange();
    range.selectNodeContents(codeEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch (e) {
    console.error('mpSelectCodeElement failed:', e);
    return false;
  }
}

function mpFallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.contentEditable = 'true';
  ta.style.position = 'absolute';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.fontSize = '16px'; // avoids iOS auto-zoom on focus
  document.body.appendChild(ta);

  const range = document.createRange();
  range.selectNodeContents(ta);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  ta.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    console.error('execCommand copy failed:', e);
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

window.mpCopyRoomCode = async function () {
  if (!mpRoomCode) return;
  const btn = document.getElementById('mpCopyCodeBtn');
  let ok = false;

  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(mpRoomCode);
      ok = true;
    } catch (e) {
      console.error('navigator.clipboard.writeText failed, trying fallback:', e);
    }
  }

  if (!ok) ok = mpFallbackCopy(mpRoomCode);
  if (!ok) ok = mpSelectCodeElement(); // last resort: at least select it for manual copy

  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = ok ? '✅' : '👆';
  btn.title = ok ? 'Copy ho gaya!' : 'Code select ho gaya — dabaye rakhein aur Copy karein';
  btn.classList.toggle('copied', ok);
  setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
};

/* ============ CREATE ROOM (host) ============ */
window.mpCreateRoom = async function () {
  const errDiv = document.getElementById('mpCreateError');
  errDiv.classList.add('hidden');
  const name = document.getElementById('mpCreateName').value.trim();
  const fromPara = parseInt(document.getElementById('mpFromPara').value) || 1;
  const toPara = parseInt(document.getElementById('mpToPara').value) || 30;

  if (!name) { errDiv.textContent = '❌ Apna naam likhein.'; errDiv.classList.remove('hidden'); return; }
  if (fromPara < 1 || toPara > 30 || fromPara > toPara) {
    errDiv.textContent = '❌ Galat Para range.'; errDiv.classList.remove('hidden'); return;
  }

  await waitForQuranData();
  mpMyName = name;
  mpRole = 'host';

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = mpGenerateRoomCode();
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) break;
  }
  mpRoomCode = code;
  mpRoomRef = ref(db, `rooms/${mpRoomCode}`);

  await set(mpRoomRef, {
    status: 'waiting',
    createdAt: serverTimestamp(),
    fromPara, toPara,
    totalQuestions: MP_TOTAL_QUESTIONS,
    ayatIndexes: null,
    usedAyatIndexes: null,
    activeStartedAt: null,
    sd: null,
    winner: null,
    winReason: null,
    sdRoundFinal: null,
    host: mpFreshPlayerState(name),
    guest: null
  });

  mpSetupPresence();
  mpListenToRoom();
  document.getElementById('mpRoomCodeDisplay').textContent = mpRoomCode;
  showSection('mpLobbyScreen');
};

/* ============ JOIN ROOM (guest) ============ */
window.mpJoinRoom = async function () {
  const errDiv = document.getElementById('mpJoinError');
  errDiv.classList.add('hidden');
  const name = document.getElementById('mpJoinName').value.trim();
  const code = document.getElementById('mpJoinCode').value.trim().toUpperCase();

  if (!name || !code) { errDiv.textContent = '❌ Naam aur Room Code dono likhein.'; errDiv.classList.remove('hidden'); return; }

  await waitForQuranData();
  const roomRef = ref(db, `rooms/${code}`);
  const snap = await get(roomRef);
  if (!snap.exists()) { errDiv.textContent = '❌ Ye Room Code nahi mila.'; errDiv.classList.remove('hidden'); return; }
  const room = snap.val();
  if (room.status !== 'waiting') { errDiv.textContent = '❌ Ye game pehle hi shuru ho chuka hai.'; errDiv.classList.remove('hidden'); return; }
  if (room.guest) { errDiv.textContent = '❌ Ye room already full hai.'; errDiv.classList.remove('hidden'); return; }

  mpMyName = name;
  mpRole = 'guest';
  mpRoomCode = code;
  mpRoomRef = roomRef;

  await update(roomRef, { guest: mpFreshPlayerState(name) });

  mpSetupPresence();
  mpListenToRoom();
  document.getElementById('mpRoomCodeDisplay').textContent = mpRoomCode;
  showSection('mpLobbyScreen');
};

/* ============ ROOM LISTENER (drives lobby / quiz / result) ============ */
function mpListenToRoom() {
  mpLastStageKey = null;
  mpLastLoadedStageKey = null;
  mpLastMyProgress = -1;
  onValue(mpRoomRef, snap => {
    const room = snap.val();
    if (!room) {
      alert('⚠️ Room band ho gaya (host chala gaya).');
      mpLeaveRoom();
      return;
    }
    if (room.status === 'waiting') mpRenderLobby(room);
    else if (room.status === 'active') mpRenderQuiz(room);
    else if (room.status === 'finished') mpRenderResult(room);
  });
}

/* ============ LOBBY ============ */
function mpRenderLobby(room) {
  document.getElementById('mpRoomCodeDisplay').textContent = mpRoomCode;
  document.getElementById('mpLobbyRange').textContent = `Para ${room.fromPara}–${room.toPara} · ${room.totalQuestions} Sawal`;
  document.querySelector('#mpLobbyHost .mp-player-name').textContent = room.host ? room.host.name : '-';

  const guestBox = document.getElementById('mpLobbyGuest');
  if (room.guest) {
    guestBox.querySelector('.mp-player-avatar').textContent = '🧑';
    guestBox.querySelector('.mp-player-name').textContent = room.guest.name;
  } else {
    guestBox.querySelector('.mp-player-avatar').textContent = '⏳';
    guestBox.querySelector('.mp-player-name').textContent = 'Intezaar...';
  }

  const startBtn = document.getElementById('mpStartBtn');
  const waitingText = document.getElementById('mpWaitingText');
  if (mpRole === 'host') {
    startBtn.classList.toggle('hidden', !room.guest);
    waitingText.classList.add('hidden');
  } else {
    startBtn.classList.add('hidden');
    waitingText.classList.remove('hidden');
  }
}

/* ============ START QUIZ (host only) ============ */
window.mpStartQuiz = async function () {
  if (mpRole !== 'host') return;
  await waitForQuranData();
  const room = (await get(mpRoomRef)).val();
  if (!room || !room.guest) return;

  const pool = [];
  window.quranData.forEach((a, idx) => {
    if (a.para >= room.fromPara && a.para <= room.toPara) pool.push(idx);
  });
  if (pool.length < 1) {
    const errDiv = document.getElementById('mpLobbyError');
    errDiv.textContent = '❌ Is range mein ayat nahi mile.';
    errDiv.classList.remove('hidden');
    return;
  }
  const count = Math.min(MP_TOTAL_QUESTIONS, pool.length);
  const ayatIndexes = pool.sort(() => Math.random() - 0.5).slice(0, count);

  await update(mpRoomRef, {
    status: 'active',
    ayatIndexes,
    usedAyatIndexes: ayatIndexes,
    totalQuestions: count,
    activeStartedAt: serverTimestamp(),
    sd: null,
    winner: null,
    winReason: null,
    sdRoundFinal: null,
    host: { ...room.host, score: 0, progress: 0, finished: false, finishedAt: null },
    guest: { ...room.guest, score: 0, progress: 0, finished: false, finishedAt: null }
  });
};

/* ============ STAGE HELPERS ============
   "Stage" is either the main round (room.ayatIndexes) or a sudden-death
   round (room.sd.ayatIndexes). Both use the same shape for score/
   progress/finished/finishedAt so the render + submit logic is shared. */
function mpStageInfo(room) {
  if (room.sd) {
    return {
      isSd: true,
      key: `sd-${room.sd.round}`,
      round: room.sd.round,
      pool: room.sd.ayatIndexes,
      total: room.sd.ayatIndexes.length,
      startedAt: room.sd.startedAt,
      host: room.sd.host,
      guest: room.sd.guest
    };
  }
  return {
    isSd: false,
    key: 'main',
    round: 0,
    pool: room.ayatIndexes,
    total: room.totalQuestions,
    startedAt: room.activeStartedAt,
    host: room.host,
    guest: room.guest
  };
}

/* ============ QUIZ ============ */
function mpRenderQuiz(room) {
  showSection('mpQuizScreen');
  document.getElementById('mpQuizCodeMini').textContent = `Room: ${mpRoomCode}`;

  const stage = mpStageInfo(room);
  const oppRole = mpRole === 'host' ? 'guest' : 'host';
  const me = stage[mpRole];
  const opp = stage[oppRole];

  document.getElementById('mpRoundBadge').textContent = stage.isSd
    ? `⚡ Sudden Death #${stage.round}`
    : `🎯 Round 1`;

  document.querySelector('#mpQuizHost .mp-player-name').textContent = room.host.name + (mpRole === 'host' ? ' (Aap)' : '');
  document.querySelector('#mpQuizGuest .mp-player-name').textContent = room.guest.name + (mpRole === 'guest' ? ' (Aap)' : '');
  document.querySelector('#mpQuizHost .mp-player-progress').textContent = `${stage.host.progress || 0}/${stage.total}`;
  document.querySelector('#mpQuizGuest .mp-player-progress').textContent = `${stage.guest.progress || 0}/${stage.total}`;
  document.querySelector('#mpQuizHost .mp-player-score').textContent = `Score: ${stage.host.score || 0}`;
  document.querySelector('#mpQuizGuest .mp-player-score').textContent = `Score: ${stage.guest.score || 0}`;
  document.getElementById('mpQuizHostStatus').textContent = stage.host.finished ? '✅' : '⏳';
  document.getElementById('mpQuizGuestStatus').textContent = stage.guest.finished ? '✅' : '⏳';

  // New stage (fresh main round or a new sudden-death round) -> clear form state
  if (stage.key !== mpLastStageKey) {
    mpLastStageKey = stage.key;
    mpHasAnsweredThisQ = false;
    document.getElementById('mpAnswerForm').reset();
    document.getElementById('mpQuizError').classList.add('hidden');
    document.getElementById('mpQuizResult').classList.add('hidden');
  }

  const myProgress = me.progress || 0;

  document.getElementById('mpQuizProgress').textContent = `Sawal ${Math.min(myProgress + 1, stage.total)} / ${stage.total}`;
  document.getElementById('mpProgressFill').style.width = `${Math.round((myProgress / stage.total) * 100)}%`;

  if (me.finished) {
    document.getElementById('mpAnswerForm').classList.add('hidden');
    document.getElementById('mpQuizError').classList.add('hidden');
    document.getElementById('mpQuizResult').classList.add('hidden');
    document.getElementById('mpRoundWaitBox').classList.remove('hidden');
    const oppProgress = opp.progress || 0;
    document.getElementById('mpWaitOpponentText').textContent = opp.finished
      ? '✅ Opponent bhi khatam! Result aa raha hai...'
      : `Opponent ${oppProgress}/${stage.total} pe hai...`;
    document.getElementById('mpWaitOpponentFill').style.width = `${Math.round((oppProgress / stage.total) * 100)}%`;
  } else {
    document.getElementById('mpRoundWaitBox').classList.add('hidden');
    document.getElementById('mpAnswerForm').classList.remove('hidden');

    // Load my current question whenever *my* progress or the stage changes.
    if (myProgress !== mpLastMyProgress || stage.key !== mpLastLoadedStageKey) {
      mpLastMyProgress = myProgress;
      mpLastLoadedStageKey = stage.key;
      mpHasAnsweredThisQ = false;
      mpCurrentAyat = window.quranData[stage.pool[myProgress]];
      mpTypeAyatText(mpCurrentAyat.text);
      document.getElementById('mpAnswerForm').reset();
      document.getElementById('mpQuizError').classList.add('hidden');
      document.getElementById('mpQuizResult').classList.add('hidden');
    }
  }

  mpWatchDisconnect(room, oppRole);

  // Host has sole authority to decide the winner once both are done with
  // the current stage — avoids two clients racing to write the result.
  if (mpRole === 'host' && me.finished && opp.finished) {
    mpHostDecide(room);
  }
}

/* ============ ANSWER CHECK (same rules as single-player) ============ */
window.mpCheckAnswer = function () {
  if (mpHasAnsweredThisQ) return false;
  const user_page = document.getElementById('mp_user_page').value.trim();
  const user_para = document.getElementById('mp_user_para').value.trim();
  const user_page_in_para = document.getElementById('mp_user_page_in_para').value.trim();
  const user_surah = document.getElementById('mp_user_surah').value.trim().toLowerCase();

  const errorDiv = document.getElementById('mpQuizError');
  const resultDiv = document.getElementById('mpQuizResult');
  errorDiv.classList.add('hidden');
  resultDiv.classList.add('hidden');

  if (!user_page && !user_para) {
    errorDiv.textContent = '❌ Kam az kam Page Number ya Para Number likhiye.';
    errorDiv.classList.remove('hidden');
    return false;
  }

  const page_num_in_data = parseInt(mpCurrentAyat.page);
  const actual_para_num = parseInt(mpCurrentAyat.para);
  const actual_page_in_para = parseInt(mpCurrentAyat.pip);

  // Each field is checked independently — whatever the player fills in
  // must be correct, but leaving a field blank no longer fails the whole
  // answer (previously Para + Page-In-Para were wrongly tied together,
  // so filling only one of them always marked the answer wrong).
  let page_check = true, para_check = true, page_in_para_check = true, surah_check = true;
  let resultParts = [];

  if (user_page) {
    page_check = parseInt(user_page) === page_num_in_data;
    if (!page_check) resultParts.push(`❌ Page Galat! Sahi: ${page_num_in_data}`);
  }
  if (user_para) {
    para_check = parseInt(user_para) === actual_para_num;
    if (!para_check) resultParts.push(`❌ Para Galat! Sahi: ${actual_para_num}`);
  }
  if (user_page_in_para) {
    page_in_para_check = parseInt(user_page_in_para) === actual_page_in_para;
    if (!page_in_para_check) resultParts.push(`❌ Page In Para Galat! Sahi: ${actual_page_in_para}`);
  }
  if (user_surah) {
    surah_check = mpCurrentAyat.surah_name.toLowerCase().includes(user_surah);
    if (!surah_check) resultParts.push(`❌ Surah Galat! Sahi: ${mpCurrentAyat.surah_name}`);
  }

  const isCorrect = page_check && para_check && page_in_para_check && surah_check;

  if (window.flashFeedback) window.flashFeedback(isCorrect);
  mpHasAnsweredThisQ = true;
  resultDiv.textContent = isCorrect ? '✅ Sahi! +1 Point' : (resultParts.join(' · ') || '❌ Galat Jawab');
  resultDiv.classList.remove('hidden', 'error');
  resultDiv.classList.add(isCorrect ? 'result' : 'error');

  mpSubmitAnswer(isCorrect);
  return false;
};

async function mpSubmitAnswer(isCorrect) {
  const room = (await get(mpRoomRef)).val();
  if (!room) return;
  const stage = mpStageInfo(room);
  const current = stage[mpRole];
  const newProgress = (current.progress || 0) + 1;
  const newScore = (current.score || 0) + (isCorrect ? 1 : 0);
  const prefix = stage.isSd ? `sd/${mpRole}` : mpRole;

  const updates = {
    [`${prefix}/progress`]: newProgress,
    [`${prefix}/score`]: newScore
  };
  if (newProgress >= stage.total) {
    updates[`${prefix}/finished`] = true;
    updates[`${prefix}/finishedAt`] = serverTimestamp();
  }
  await update(mpRoomRef, updates);
}

/* ============ WINNER DECISION (host authority only) ============ */
async function mpHostDecide(room) {
  if (mpDeciding) return;
  mpDeciding = true;
  try {
    const stage = mpStageInfo(room);
    const h = stage.host, g = stage.guest;

    if (h.score !== g.score) {
      const winner = h.score > g.score ? 'host' : 'guest';
      await update(mpRoomRef, {
        status: 'finished', winner,
        winReason: stage.isSd ? 'sd_score' : 'score',
        sdRoundFinal: stage.isSd ? stage.round : null
      });
      return;
    }

    const hTime = (h.finishedAt || 0) - stage.startedAt;
    const gTime = (g.finishedAt || 0) - stage.startedAt;
    if (hTime !== gTime) {
      const winner = hTime < gTime ? 'host' : 'guest';
      await update(mpRoomRef, {
        status: 'finished', winner,
        winReason: stage.isSd ? 'sd_time' : 'time',
        sdRoundFinal: stage.isSd ? stage.round : null
      });
      return;
    }

    // True tie (score AND time) -> escalate to / continue sudden death.
    await mpStartSuddenDeath(room, stage);
  } finally {
    mpDeciding = false;
  }
}

function mpPickAyatIndexes(room, count, excludeSet) {
  const fresh = [];
  const all = [];
  window.quranData.forEach((a, idx) => {
    if (a.para >= room.fromPara && a.para <= room.toPara) {
      all.push(idx);
      if (!excludeSet.has(idx)) fresh.push(idx);
    }
  });
  const source = fresh.length >= count ? fresh : all; // fallback: allow repeats if range is small
  return source.sort(() => Math.random() - 0.5).slice(0, count);
}

async function mpStartSuddenDeath(room, stage) {
  const prevRound = stage.isSd ? stage.round : 0;
  const usedSoFar = new Set(room.usedAyatIndexes || room.ayatIndexes || []);
  const newIndexes = mpPickAyatIndexes(room, MP_SD_QUESTIONS, usedSoFar);
  const updatedUsed = [...usedSoFar, ...newIndexes];

  await update(mpRoomRef, {
    sd: {
      round: prevRound + 1,
      ayatIndexes: newIndexes,
      startedAt: serverTimestamp(),
      host: { score: 0, progress: 0, finished: false, finishedAt: null },
      guest: { score: 0, progress: 0, finished: false, finishedAt: null }
    },
    usedAyatIndexes: updatedUsed
  });
}

/* ============ DISCONNECT / FORFEIT HANDLING ============ */
function mpWatchDisconnect(room, oppRole) {
  const notice = document.getElementById('mpDisconnectNotice');
  const opp = room[oppRole];

  if (!opp || opp.online !== false) {
    if (mpDisconnectTimer) { clearInterval(mpDisconnectTimer); mpDisconnectTimer = null; }
    notice.classList.add('hidden');
    return;
  }

  notice.classList.remove('hidden');
  if (mpDisconnectTimer) return; // already counting down

  mpDisconnectSeconds = MP_DISCONNECT_GRACE;
  document.getElementById('mpDisconnectCountdown').textContent = mpDisconnectSeconds;
  mpDisconnectTimer = setInterval(async () => {
    mpDisconnectSeconds--;
    document.getElementById('mpDisconnectCountdown').textContent = Math.max(mpDisconnectSeconds, 0);
    if (mpDisconnectSeconds <= 0) {
      clearInterval(mpDisconnectTimer);
      mpDisconnectTimer = null;
      try {
        const snap = await get(mpRoomRef);
        const r = snap.val();
        if (r && r.status === 'active') {
          await update(mpRoomRef, { status: 'finished', winner: mpRole, winReason: 'forfeit' });
        }
      } catch (e) { /* room may be gone already */ }
    }
  }, 1000);
}

/* ============ RESULT ============ */
function mpRenderResult(room) {
  if (mpDisconnectTimer) { clearInterval(mpDisconnectTimer); mpDisconnectTimer = null; }
  document.getElementById('mpDisconnectNotice').classList.add('hidden');
  showSection('mpResultScreen');

  document.querySelector('#mpFinalHost .mp-player-name').textContent = room.host.name + (mpRole === 'host' ? ' (Aap)' : '');
  document.querySelector('#mpFinalHost .mp-player-score-final').textContent = room.host.score;
  document.querySelector('#mpFinalGuest .mp-player-name').textContent = room.guest.name + (mpRole === 'guest' ? ' (Aap)' : '');
  document.querySelector('#mpFinalGuest .mp-player-score-final').textContent = room.guest.score;

  const headline = document.getElementById('mpResultHeadline');
  const statsDiv = document.getElementById('mpFinalStats');
  const iWon = room.winner === mpRole;
  const isDraw = !room.winner;

  headline.textContent = isDraw ? '🤝 Draw!' : (iWon ? '🎉 Aap Jeet Gaye!' : '😔 Opponent Jeet Gaya');

  let statsHtml = '';

  // Correct vs wrong breakdown (main round is always fully played by both,
  // even when the match is ultimately decided in sudden death).
  const hostCorrect = room.host.score || 0;
  const hostWrong = room.totalQuestions - hostCorrect;
  const guestCorrect = room.guest.score || 0;
  const guestWrong = room.totalQuestions - guestCorrect;
  const hostLabel = room.host.name + (mpRole === 'host' ? ' (Aap)' : '');
  const guestLabel = room.guest.name + (mpRole === 'guest' ? ' (Aap)' : '');

  statsHtml += `<p>✅❌ <b>${hostLabel}</b>: ${hostCorrect} Sahi · ${hostWrong} Galat</p>`;
  statsHtml += `<p>✅❌ <b>${guestLabel}</b>: ${guestCorrect} Sahi · ${guestWrong} Galat</p>`;

  if (room.winReason === 'forfeit') {
    statsHtml += `<p>⚠️ ${iWon ? 'Opponent disconnect ho gaya tha' : 'Aap disconnect ho gaye the'}, isliye ${iWon ? 'aapko' : 'opponent ko'} forfeit win mila.</p>`;
  } else {
    const mainHostTime = ((room.host.finishedAt || 0) - room.activeStartedAt) / 1000;
    const mainGuestTime = ((room.guest.finishedAt || 0) - room.activeStartedAt) / 1000;
    const myMainTime = mpRole === 'host' ? mainHostTime : mainGuestTime;
    const oppMainTime = mpRole === 'host' ? mainGuestTime : mainHostTime;

    statsHtml += `<p>⏱️ Aapka Time: <b>${myMainTime.toFixed(1)}s</b> · Opponent: <b>${oppMainTime.toFixed(1)}s</b></p>`;

    const reasonMap = {
      score: 'Zyada sahi jawabon ki wajah se faisla hua.',
      time: 'Score barabar tha — kam time lagane ki wajah se faisla hua.',
      sd_score: `Sudden Death (Round ${room.sdRoundFinal}) mein zyada sahi jawabon ki wajah se faisla hua.`,
      sd_time: `Sudden Death (Round ${room.sdRoundFinal}) mein kam time lagane ki wajah se faisla hua.`
    };
    if (reasonMap[room.winReason]) {
      statsHtml += `<p>🏁 ${reasonMap[room.winReason]}</p>`;
    }
  }
  statsDiv.innerHTML = statsHtml;
}

/* ============ LEAVE / CLEANUP ============ */
window.mpLeaveRoom = async function () {
  if (mpDisconnectTimer) { clearInterval(mpDisconnectTimer); mpDisconnectTimer = null; }
  if (mpTypeTimer) { clearInterval(mpTypeTimer); mpTypeTimer = null; }
  if (mpRoomRef) off(mpRoomRef);
  try {
    if (mpRole === 'host' && mpRoomRef) {
      await remove(mpRoomRef); // host leaving ends the room for both players
    } else if (mpRole === 'guest' && mpRoomRef) {
      await update(mpRoomRef, { guest: null });
    }
  } catch (e) { /* room may already be gone — safe to ignore */ }
  mpRoomCode = null; mpRole = null; mpRoomRef = null;
  mpCurrentAyat = null; mpHasAnsweredThisQ = false;
  mpLastStageKey = null; mpLastLoadedStageKey = null; mpLastMyProgress = -1;
  mpDeciding = false;
  showSection('welcomeScreen');
};

window.addEventListener('DOMContentLoaded', () => {
  const codeInput = document.getElementById('mpJoinCode');
  if (codeInput) codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') window.mpJoinRoom(); });
});
