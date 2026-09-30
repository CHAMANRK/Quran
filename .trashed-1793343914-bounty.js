import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref, push, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

/* Same Firebase project as multiplayer; separate named app so nothing clashes. */
const db = getDatabase(initializeApp({
  apiKey: "AIzaSyB99IukU3A9SHpmYiO2QJ7anYuoohwlwnc",
  authDomain: "quran-quiz-85.firebaseapp.com",
  databaseURL: "https://quran-quiz-85-default-rtdb.firebaseio.com/",
  projectId: "quran-quiz-85",
  appId: "1:1074137604510:web:cc7caceb53b9045fc9f68f"
}, 'bounty'));

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const RULES_VER = 'v1 (30 Sep 2026)';
const MAX_PER_DAY = 5, PASS_MARK = 3, EXAM_Q = 5;

/* ============ RULES (screen + downloadable .txt use the same text) ============ */
const RULES = [
  'NAJIFUL QURAN QUIZ - BUG BOUNTY RULES  [' + RULES_VER + ']',
  '',
  '1. INAAM KIN FEATURES PAR: sirf Ayat Quiz aur Search (poore Quran mein).',
  '2. INAAM: har valid aur UNIQUE bug par pakka inaam, max Rs 100. Baaki (chhote) bugs par bhi chhota inaam milega. Amount admin tay karega.',
  '3. SIRF PARA aur PAGE-IN-PARA (pip) COUNT hote hain. Page number ya baaki cheezon ka claim inaam ke liye nahi chalega.',
  '4. REFERENCE MUSHAF: 609 safahat wala Indo-Pak mushaf, har para 20 safah (aakhri para 25). [MUSHAF KA NAAM YAHAN LIKHEIN]',
  '5. SEARCH Rasm-e-Uthmani ke hisaab se hota hai. Ayat ke wahi letters likhein jo Quran mein hain (harkat ke bina chalega). Doosri spelling (jaise الرحمان) bug nahi hai.',
  '6. VALID BUG: (a) Quiz mein sahi para/pip likha par app ne galat bataya ya app ka para/pip mushaf se alag hai; (b) Search mein ayat ke asli letters likhe par wo ayat result mein nahi aayi; (c) Search result mein para/pip galat dikha.',
  '7. DUPLICATE: same bug ki pehli report (server time se) ko inaam. Baaki duplicate hain.',
  '8. EK WAJAH = EK BUG: agar ek hi wajah se bahut si ayat fail hon to wo ek hi bug hai aur ek hi inaam.',
  '9. PEHLE SE MALOOM / FIXED bugs par inaam nahi.',
  '10. LIMIT: ek din mein max ' + MAX_PER_DAY + ' reports. Ek WhatsApp number = ek hunter. 3 reports reject hone par hunter block ho sakta hai. Ek mahine mein inaam ki total limit ho sakti hai.',
  '11. REPORT mein sahi surah:ayat aur apne (reference mushaf ke) hisaab se sahi para/pip likhna zaruri hai. Jhoothi ya spam report par inaam nahi.',
  '12. PAYMENT: valid report ke baad UPI se, admin ke verify karne par. Admin ka faisla aakhri hoga.'
];
const RULES_TEXT = RULES.join('\n');

/* ============ EXAM ============ */
const POOL = [
  ['Search mein Quran ke asli letters likhe, par wo ayat result mein nahi aayi. Ye?', ['Valid bug', 'Bug nahi', 'Sirf duplicate hota hai', 'Inaam sirf page ke liye'], 0],
  ['Quiz mein page number galat dikha, para aur pip sahi hain. Inaam?', ['Milega', 'Nahi milega, sirf para/pip count hote hain', 'Aadha milega', 'Double milega'], 1],
  ['Search mein "الرحمان" (Uthmani se alag spelling) likha aur kuch nahi mila. Ye?', ['Valid bug', 'Bug nahi, search Rasm-e-Uthmani se hota hai', 'Data ki galti', 'Quiz ka bug'], 1],
  ['Ek hi wajah se 30 alag ayat search mein nahi mile. Inaam?', ['30 bugs ka 30 inaam', 'Ek bug, ek inaam', 'Koi inaam nahi', 'Sirf pehli ayat ka'], 1],
  ['Aapse pehle kisi ne wahi bug report kar diya. Inaam kise?', ['Dono ko', 'Aakhri reporter ko', 'Pehle reporter ko', 'Kisi ko nahi'], 2],
  ['Ek din mein zyada se zyada kitni reports?', ['1', '5', '20', 'Unlimited'], 1],
  ['Ek valid unique bug par max inaam kitna?', ['Rs 10', 'Rs 50', 'Rs 100', 'Rs 1000'], 2],
  ['Report ke liye kya zaruri hai?', ['Sirf screenshot', 'Sahi surah:ayat aur reference mushaf ke hisaab se para/pip', 'Sirf apna naam', 'Kuch nahi'], 1]
];
let exam = [];

function startExam() {
  const picks = [...POOL].sort(() => Math.random() - .5).slice(0, EXAM_Q);
  exam = picks.map(([q, opts, a]) => {
    const order = opts.map((_, i) => i).sort(() => Math.random() - .5);
    return { q, opts: order.map(i => opts[i]), a: order.indexOf(a) };
  });
  $('qbExamBody').innerHTML = exam.map((e, i) =>
    `<div class="qb-q"><b>${i + 1}. ${esc(e.q)}</b>` +
    e.opts.map((o, j) => `<label class="qb-opt"><input type="radio" name="qbq${i}" value="${j}"> ${esc(o)}</label>`).join('') + '</div>').join('');
  $('qbExamMsg').textContent = '';
  showSection('qbExam');
}

function submitExam() {
  let score = 0, answered = 0;
  exam.forEach((e, i) => {
    const c = document.querySelector(`input[name="qbq${i}"]:checked`);
    if (c) { answered++; if (+c.value === e.a) score++; }
  });
  if (answered < exam.length) { $('qbExamMsg').textContent = 'Saare sawalon ka jawab dein.'; return; }
  if (score >= PASS_MARK) { tmpScore = score; $('qbFormMsg').textContent = ''; showSection('qbForm'); }
  else $('qbExamMsg').innerHTML = `Score ${score}/${exam.length}. Pass ke liye ${PASS_MARK} sahi chahiye. Rules dobara padhein aur naye sawalon ke saath try karein.`;
}
let tmpScore = 0;

/* ============ HUNTER ============ */
const hunter = () => LS.get('qb_hunter');
const hunterOn = () => !!hunter() && LS.get('qb_on') !== false;

function refreshHome() {
  const h = hunter();
  $('qbStatus').innerHTML = h
    ? `Bug Hunter: <b>${esc(h.name)}</b> ✅<br>Hunter mode: <b>${hunterOn() ? 'ON' : 'OFF'}</b>`
    : 'Abhi aap bug hunter nahi hain. Apply karke rules padhein aur chhota exam dein.';
  $('qbApplyBtn').classList.toggle('hidden', !!h);
  $('qbToggleBtn').classList.toggle('hidden', !h);
  document.body.classList.toggle('qb-on', hunterOn());
}

async function registerHunter() {
  const name = $('qbName').value.trim();
  const wa = $('qbWa').value.replace(/[\s-]/g, '');
  const upi = $('qbUpi').value.trim();
  const msg = $('qbFormMsg');
  if (name.length < 2) return msg.textContent = 'Naam likhein.';
  if (!/^\+?\d{10,15}$/.test(wa)) return msg.textContent = 'WhatsApp number sahi likhein (10-15 digit).';
  if (!(/^[\w.\-]{2,}@[\w]{2,}$/.test(upi) || /^\d{10}$/.test(upi))) return msg.textContent = 'UPI ID (naam@bank) ya 10 digit UPI number likhein.';
  const id = 'h' + Math.random().toString(36).slice(2, 12);
  $('qbFormBtn').disabled = true; msg.textContent = 'Bhej rahe hain...';
  try {
    await set(ref(db, 'bounty/hunters/' + id), { name, whatsapp: wa, upi, examScore: tmpScore, rulesVersion: RULES_VER, createdAt: serverTimestamp() });
    LS.set('qb_hunter', { id, name }); LS.set('qb_on', true);
    refreshHome(); showSection('qbHome');
  } catch (e) { msg.textContent = 'Submit nahi hua, internet check karke dobara try karein.'; }
  $('qbFormBtn').disabled = false;
}

/* ============ REPORT ============ */
let snap = null; // { type, ...auto-attached read-only data }
let lastQuiz = null;

function todayCount() { const d = LS.get('qb_day'); const t = new Date().toDateString(); return d && d.t === t ? d.n : 0; }

function openReport(type) {
  if (!hunterOn()) return;
  if (todayCount() >= MAX_PER_DAY) { alert('Aaj ki limit (' + MAX_PER_DAY + ' reports) poori ho gayi. Kal try karein.'); return; }
  let ro = '';
  if (type === 'search') {
    const inp = $('searchInput').value.trim();
    const res = (typeof currentSearchResults !== 'undefined' ? currentSearchResults : []);
    snap = { type, query: inp, filter: typeof searchFilter !== 'undefined' ? searchFilter : 'all', count: res.length,
      top: res.slice(0, 5).map(a => `${a.surah_number}:${a.ayat_no} (para ${a.para}, pip ${a.pip})`),
      inResults: res.map(a => a.surah_number + ':' + a.ayat_no).slice(0, 300) };
    ro = `Search: ${snap.query}\nFilter: ${snap.filter}\nResult: ${snap.count ? snap.count + ' mile. Top: ' + snap.top.join(', ') : 'Koi result nahi mila'}`;
  } else {
    snap = lastQuiz; if (!snap) return;
    ro = `Ayat: ${snap.ayat.surah_name} (${snap.ayat.surah_number}:${snap.ayat.ayat_no})\nAapne likha: page ${snap.in.page || '-'}, para ${snap.in.para || '-'}, pip ${snap.in.pip || '-'}, surah ${snap.in.surah || '-'}\nApp ka jawab: ${snap.result}`;
  }
  $('qbRO').textContent = ro;
  $('qbSearchClaim').classList.toggle('hidden', type !== 'search');
  $('qbClaimHelp').textContent = type === 'search'
    ? 'Jo ayat result mein aani chahiye thi, uska surah:ayat aur uska sahi para/pip (reference mushaf ke hisaab se):'
    : 'Is ayat ka sahi para aur pip (reference mushaf ke hisaab se):';
  ['qbSurah', 'qbAyat', 'qbPara', 'qbPip', 'qbOpinion'].forEach(i => $(i).value = '');
  $('qbRepMsg').textContent = '';
  showSection('qbReport');
}

async function submitReport() {
  const msg = $('qbRepMsg');
  if (!snap) return msg.textContent = 'Pehle galat result par 🐞 button dabayein.';
  const n = id => parseInt($(id).value, 10);
  const claim = { para: n('qbPara'), pip: n('qbPip') };
  if (!(claim.para >= 1 && claim.para <= 30)) return msg.textContent = 'Para 1 se 30 ke beech likhein.';
  if (!(claim.pip >= 1 && claim.pip <= 25)) return msg.textContent = 'Page-in-para 1 se 25 ke beech likhein.';
  let row;
  if (snap.type === 'search') {
    claim.surah = n('qbSurah'); claim.ayat = n('qbAyat');
    row = quranData.find(a => a.surah_number === claim.surah && a.ayat_no === claim.ayat);
    if (!row) return msg.textContent = 'Ye surah:ayat Quran mein nahi mili, dobara check karein.';
    if (snap.inResults.includes(claim.surah + ':' + claim.ayat) && row.para === claim.para && row.pip === claim.pip)
      return msg.textContent = 'Ye ayat result mein aayi thi aur para/pip sahi hain, isliye ye bug nahi lagta.';
  } else {
    row = snap.ayat;
    if (row.para === claim.para && row.pip === claim.pip)
      return msg.textContent = 'App ke data mein yahi para/pip hai, isliye ye bug nahi lagta.';
  }
  const s = snap.type === 'search'
    ? { type: 'search', query: snap.query, filter: snap.filter, count: snap.count, top: snap.top }
    : { type: 'quiz', ayat: { s: snap.ayat.surah_number, a: snap.ayat.ayat_no, para: snap.ayat.para, pip: snap.ayat.pip }, typed: snap.in, appResult: snap.result };
  const fingerprint = snap.type === 'search'
    ? `s|${snap.query}|${snap.filter}|${claim.surah}:${claim.ayat}`
    : `q|${row.surah_number}:${row.ayat_no}|${claim.para}|${claim.pip}`;
  $('qbRepBtn').disabled = true; msg.textContent = 'Bhej rahe hain...';
  try {
    const r = push(ref(db, 'bounty/reports'));
    await set(r, { hunterId: hunter().id, type: snap.type, snapshot: s, claim, opinion: $('qbOpinion').value.trim().slice(0, 500), fingerprint, rulesVersion: RULES_VER, createdAt: serverTimestamp() });
    LS.set('qb_day', { t: new Date().toDateString(), n: todayCount() + 1 });
    alert('Report bhej di gayi. ID: QB-' + r.key.slice(-6).toUpperCase() + '\nShukriya!');
    showSection(snap.type === 'search' ? 'searchScreen' : 'quizScreen');
  } catch (e) { msg.textContent = 'Submit nahi hua, internet check karke dobara try karein.'; }
  $('qbRepBtn').disabled = false;
}

/* ============ BUILD UI ============ */
function screen(id, html) { const s = document.createElement('section'); s.id = id; s.className = 'screen'; s.innerHTML = html; document.querySelector('main').appendChild(s); }
const back = to => `<button class="back-btn" onclick="showSection('${to}')">← Wapas</button>`;

function build() {
  screen('qbHome', `${back('menuScreen')}<h2>🐞 Bug Bounty</h2>
    <p>Search ya Quiz mein galti dhoondo, valid bug par <b>max ₹100</b> ka inaam.</p>
    <div id="qbStatus" class="qb-box"></div>
    <button id="qbApplyBtn" class="btn btn-primary btn-lg btn-block">Apply for Bug Bounty</button>
    <button id="qbToggleBtn" class="btn btn-secondary btn-block">Hunter mode ON/OFF</button>
    <button id="qbRulesBtn" class="btn btn-ghost btn-block">📜 Rules padho</button>`);
  screen('qbRules', `${back('qbHome')}<h2>📜 Rules</h2>
    <div id="qbRulesText" class="qb-box qb-pre"></div>
    <button id="qbDl" class="btn btn-secondary btn-block">📥 Rules download (.txt)</button>
    <label class="qb-opt"><input type="checkbox" id="qbAgree"> Maine rules padh liye</label>
    <button id="qbExamBtn" class="btn btn-primary btn-lg btn-block" disabled>Exam do →</button>`);
  screen('qbExam', `${back('qbRules')}<h2>📝 Chhota Exam</h2><p>${EXAM_Q} sawal, pass ke liye ${PASS_MARK} sahi.</p>
    <div id="qbExamBody"></div><div id="qbExamMsg" class="qb-msg"></div>
    <button id="qbExamSubmit" class="btn btn-primary btn-lg btn-block">Jawab bhejein</button>`);
  screen('qbForm', `<h2>✅ Exam pass!</h2><p>Payment ke liye apni details bharein.</p>
    <input id="qbName" class="qb-in" placeholder="Poora naam" autocomplete="name">
    <input id="qbWa" class="qb-in" placeholder="WhatsApp number" inputmode="tel" autocomplete="tel">
    <input id="qbUpi" class="qb-in" placeholder="UPI ID (naam@bank) ya UPI number">
    <div id="qbFormMsg" class="qb-msg"></div>
    <button id="qbFormBtn" class="btn btn-primary btn-lg btn-block">Submit</button>`);
  screen('qbReport', `${back('menuScreen')}<h2>🐞 Galti report karo</h2>
    <p>Ye auto-attach hai (badal nahi sakte):</p><div id="qbRO" class="qb-box qb-pre qb-ro"></div>
    <p id="qbClaimHelp"></p>
    <div id="qbSearchClaim"><input id="qbSurah" class="qb-in" type="number" placeholder="Surah number (1-114)" inputmode="numeric">
    <input id="qbAyat" class="qb-in" type="number" placeholder="Ayat number" inputmode="numeric"></div>
    <input id="qbPara" class="qb-in" type="number" placeholder="Sahi Para (1-30)" inputmode="numeric">
    <input id="qbPip" class="qb-in" type="number" placeholder="Sahi Page-in-Para" inputmode="numeric">
    <textarea id="qbOpinion" class="qb-in" rows="3" placeholder="Aapki raay (optional)"></textarea>
    <div id="qbRepMsg" class="qb-msg"></div>
    <button id="qbRepBtn" class="btn btn-primary btn-lg btn-block">Report bhejein</button>`);
  $('qbRulesText').textContent = RULES_TEXT;

  $('qbApplyBtn').onclick = () => { $('qbAgree').checked = false; $('qbExamBtn').disabled = true; showSection('qbRules'); };
  $('qbRulesBtn').onclick = () => { $('qbAgree').checked = false; $('qbExamBtn').disabled = true; showSection('qbRules'); };
  $('qbAgree').onchange = e => $('qbExamBtn').disabled = !e.target.checked || !!hunter();
  $('qbToggleBtn').onclick = () => { LS.set('qb_on', !hunterOn()); refreshHome(); };
  $('qbDl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([RULES_TEXT], { type: 'text/plain;charset=utf-8' }));
    a.download = 'bug-bounty-rules.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('qbExamBtn').onclick = startExam;
  $('qbExamSubmit').onclick = submitExam;
  $('qbFormBtn').onclick = registerHunter;
  $('qbRepBtn').onclick = submitReport;

  /* 🐞 buttons (only visible in Hunter mode, see bounty.css) */
  const sb = document.createElement('button');
  sb.className = 'btn btn-ghost btn-block qb-hunter-only hidden'; sb.textContent = '🐞 Search galat laga? Report karo';
  sb.onclick = () => openReport('search');
  $('searchResults').after(sb);
  const upd = () => sb.classList.toggle('hidden', !$('searchInput').value.trim());
  new MutationObserver(upd).observe($('searchResults'), { childList: true });

  const qb = document.createElement('button');
  qb.className = 'btn btn-ghost btn-block qb-hunter-only hidden'; qb.textContent = '🐞 Ye galat laga? Report karo';
  qb.onclick = () => openReport('quiz');
  $('quizResult').after(qb);
  const nb = document.querySelector('.next-button');
  new MutationObserver(() => {
    const shown = !nb.classList.contains('hidden');
    if (shown && typeof currentAyat !== 'undefined' && currentAyat) {
      lastQuiz = { type: 'quiz', ayat: { ...currentAyat },
        in: { page: $('user_page').value.trim(), para: $('user_para').value.trim(), pip: $('user_page_in_para').value.trim(), surah: $('user_surah').value.trim() },
        result: ($('quizResult').innerText ?? $('quizResult').textContent).replace(/\s+/g, ' ').trim().slice(0, 200) };
    }
    qb.classList.toggle('hidden', !shown);
  }).observe(nb, { attributes: true, attributeFilter: ['class'] });

  refreshHome();
}
build();
