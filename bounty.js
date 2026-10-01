import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref, push, set, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

/* Same Firebase project as multiplayer; separate named app so nothing clashes. */
const fbApp = initializeApp({
  apiKey: "AIzaSyB99IukU3A9SHpmYiO2QJ7anYuoohwlwnc",
  authDomain: "quran-quiz-85.firebaseapp.com",
  databaseURL: "https://quran-quiz-85-default-rtdb.firebaseio.com/",
  projectId: "quran-quiz-85",
  appId: "1:1074137604510:web:cc7caceb53b9045fc9f68f"
}, 'bounty');
const db = getDatabase(fbApp);
const auth = getAuth(fbApp);
/* Anonymous sign-in gives every browser a real, server-verified uid. Firebase Rules bind
   every write to that uid, so the hunterId can't be faked from localStorage. */
const ready = signInAnonymously(auth).then(() => auth.currentUser.uid).catch(() => null);

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
  '10. APPROVAL: apply karne ke baad admin aapki application WhatsApp par approve karega. Approve hone ke baad hi report bhej sakenge. Ek WhatsApp number = ek hunter.',
  '11. LIMIT: ek din mein max ' + MAX_PER_DAY + ' reports. 3 reports reject hone par hunter block ho sakta hai. Ek mahine mein inaam ki total limit ho sakti hai.',
  '12. REPORT mein sahi surah:ayat aur apne (reference mushaf ke) hisaab se sahi para/pip likhna zaruri hai. Jhoothi ya spam report par inaam nahi.',
  '13. PAYMENT: valid report ke baad UPI se, admin ke verify karne par. Admin ka faisla aakhri hoga.'
];
/* Not bugs / already known. Move an item here when it is a known limitation; add "FIXED:" when fixed. */
const KNOWN = [
  'Uthmani se alag spelling ki search: الرحمان, ابراهيم, اسماعيل, صلاة, الكتاب (data Rasm-e-Uthmani mein hai).',
  'Page number ka claim (sirf para/pip count hote hain).',
  'Jo features hain hi nahi: pip ya surah number se search, Urdu mein surah ka naam (بقرہ), translation mein search.',
  'Surah ki rare English spelling (sirf report kar sakte hain, bada inaam nahi).'
];
const RULES_TEXT = RULES.join('\n') + '\n\nYE BUG NAHI HAIN / PEHLE SE MALOOM:\n' + KNOWN.map((k, i) => (i + 1) + ') ' + k).join('\n');

/* ============ EXAM ============ */
const POOL = [
  ['Search mein Quran ke asli letters likhe, par wo ayat result mein nahi aayi. Ye?', ['Valid bug', 'Bug nahi', 'Sirf duplicate hota hai', 'Inaam sirf page ke liye'], 0, 'Asli letters likhne par ayat na aaye to ye search ka valid bug hai (rule 6b).'],
  ['Quiz mein page number galat dikha, para aur pip sahi hain. Inaam?', ['Milega', 'Nahi milega, sirf para/pip count hote hain', 'Aadha milega', 'Double milega'], 1, 'Sirf para aur page-in-para (pip) count hote hain. Page ka claim inaam ke liye nahi chalta (rule 3).'],
  ['Search mein "الرحمان" (Uthmani se alag spelling) likha aur kuch nahi mila. Ye?', ['Valid bug', 'Bug nahi, search Rasm-e-Uthmani se hota hai', 'Data ki galti', 'Quiz ka bug'], 1, 'Search Rasm-e-Uthmani ke hisaab se hota hai. Doosri spelling bug nahi hai (rule 5).'],
  ['Ek hi wajah se 30 alag ayat search mein nahi mile. Inaam?', ['30 bugs ka 30 inaam', 'Ek bug, ek inaam', 'Koi inaam nahi', 'Sirf pehli ayat ka'], 1, 'Ek wajah = ek bug, chahe kitni bhi ayat fail hon (rule 8).'],
  ['Aapse pehle kisi ne wahi bug report kar diya. Inaam kise?', ['Dono ko', 'Aakhri reporter ko', 'Pehle reporter ko', 'Kisi ko nahi'], 2, 'Server time ke hisaab se pehli report ko inaam milta hai, baaki duplicate hain (rule 7).'],
  ['Ek din mein zyada se zyada kitni reports?', ['1', '5', '20', 'Unlimited'], 1, 'Ek din mein max ' + MAX_PER_DAY + ' reports (rule 11).'],
  ['Ek valid unique bug par max inaam kitna?', ['Rs 10', 'Rs 50', 'Rs 100', 'Rs 1000'], 2, 'Max inaam Rs 100 hai. Amount admin tay karta hai (rule 2).'],
  ['Report ke liye kya zaruri hai?', ['Sirf screenshot', 'Sahi surah:ayat aur reference mushaf ke hisaab se para/pip', 'Sirf apna naam', 'Kuch nahi'], 1, 'Sahi surah:ayat aur reference mushaf ke hisaab se para/pip likhna zaruri hai (rule 12).']
];
let exam = [], examI = 0, examAns = [], examLock = false, tmpScore = 0;

function startExam() {
  const picks = [...POOL].sort(() => Math.random() - .5).slice(0, EXAM_Q);
  exam = picks.map(([q, opts, a, why]) => {
    const order = opts.map((_, i) => i).sort(() => Math.random() - .5);
    return { q, why, opts: order.map(i => opts[i]), a: order.indexOf(a) };
  });
  examI = 0; examAns = []; examLock = false;
  $('qbProg').style.width = '0%';
  showSection('qbExam'); renderQ();
}

function renderQ() {
  const e = exam[examI];
  $('qbProg').style.width = (examI / exam.length * 100) + '%';
  $('qbExamBody').innerHTML = `<div class="qb-mut">Sawal ${examI + 1} / ${exam.length}</div>
    <div class="qb-qcard"><b>${esc(e.q)}</b></div>` +
    e.opts.map((o, j) => `<button type="button" class="qb-choice" data-ans="${j}">${esc(o)}</button>`).join('');
}

function pickAnswer(ev) {
  const b = ev.target.closest('[data-ans]'); if (!b || examLock) return;
  examLock = true; b.classList.add('picked'); examAns.push(+b.dataset.ans);
  setTimeout(() => { examLock = false; examI++; examI < exam.length ? renderQ() : finishExam(); }, 380);
}

function finishExam() {
  const score = exam.filter((e, i) => examAns[i] === e.a).length, pass = score >= PASS_MARK;
  const wrong = exam.map((e, i) => ({ e, i })).filter(({ e, i }) => examAns[i] !== e.a);
  $('qbProg').style.width = '100%';
  if (pass) tmpScore = score;
  $('qbExamBody').innerHTML = `<div class="qb-res ${pass ? 'pass' : 'fail'}"><div class="qb-score">${score}/${exam.length}</div>
      <b>${pass ? 'Exam pass! 🎉' : 'Is baar pass nahi hue'}</b><div class="qb-mut">Pass ke liye ${PASS_MARK} sahi chahiye.</div></div>` +
    (wrong.length ? '<h3>Ye sawal galat hue</h3>' + wrong.map(({ e, i }) =>
      `<div class="qb-box qb-wrong"><b>${esc(e.q)}</b><div class="qb-mut">Aapka jawab: ${esc(e.opts[examAns[i]])}</div>
       <div class="qb-right">✓ ${esc(e.opts[e.a])}</div><div class="qb-why">${esc(e.why)}</div></div>`).join('') : '') +
    (pass ? '<button class="btn btn-primary btn-lg btn-block" data-qb="examNext">Details bharein →</button>'
          : '<button class="btn btn-primary btn-lg btn-block" data-qb="examRetry">Naye sawalon ke saath retry</button><button class="btn btn-ghost btn-block" data-qb="rules">📜 Rules dobara padhein</button>');
}

/* ---- rules screen: grouped, collapsible ---- */
const RSEC = [['💰', 'Inaam kitna milega', [1, 2, 13]], ['📖', 'Mushaf aur search', [3, 4, 5]], ['🐞', 'Valid bug kya hai', [6, 8, 9]], ['🔁', 'Duplicate report', [7]], ['✅', 'Approval, limit, report', [10, 11, 12]]];
const ruleHtml = n => { const t = RULES[n + 1].replace(/^\d+\.\s*/, ''), m = t.match(/^([A-Z][A-Z \-\/()]+?):\s*([\s\S]*)$/); return m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(t); };
const knownCard = () => `<div class="qb-known"><div class="qb-kh">❌ Ye bug nahi hain</div><p class="qb-mut">In par inaam nahi milega.</p><ul>${KNOWN.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>`;
function renderRules() {
  $('qbRulesList').innerHTML = RSEC.map(([ic, t, ns], i) =>
    `<details class="qb-sec"${i === 0 ? ' open' : ''}><summary><span>${ic}</span>${t}</summary><ul>${ns.map(n => `<li>${ruleHtml(n)}</li>`).join('')}</ul></details>`).join('') + knownCard();
  $('qbKnownBody').innerHTML = knownCard();
}

/* ============ HUNTER ============ */
const CK = 'qb_cache';
const cache = LS.get(CK) || {};
let status = cache.status || 'none';   // none | pending | approved | blocked  (cached => no "Apply" flash on open)
let mine = cache.mine || [];           // my reports (+ admin verdicts)
let loading = true, offline = false;
const hunter = () => LS.get('qb_hunter');
const hunterOn = () => status === 'approved' && LS.get('qb_on') !== false;
const repId = k => 'QB-' + String(k).slice(-6).toUpperCase();
const saveCache = () => LS.set(CK, { status, mine: mine.slice(0, 50), name: (hunter() || {}).name || cache.name });

function toast(msg) {
  let t = $('qbToast'); if (!t) { t = document.createElement('div'); t.id = 'qbToast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

async function loadMine(uid) {
  const g = async p => (await get(ref(db, 'bounty/' + p + '/' + uid))).val() || {};
  const [m, pub] = await Promise.all([g('mine'), g('pub')]);
  mine = Object.entries(m).map(([id, r]) => ({ id, ...r, v: pub[id] || null })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function syncStatus() {
  loading = true; offline = false; refreshHome();
  const uid = await ready;
  if (!uid) { offline = true; loading = false; refreshHome(); return; }
  try {
    let h = hunter();
    if (h && h.id !== uid) { LS.set('qb_hunter', null); h = null; }
    const key = (await get(ref(db, 'bounty/byUid/' + uid))).val();   // is this browser really registered on the server?
    if (h && !key) { LS.set('qb_hunter', null); h = null; }           // admin reset it (or old record) -> can apply again
    if (!h && key) { h = { id: uid, name: cache.name || 'Hunter', wa: key }; LS.set('qb_hunter', h); } // phone data cleared, login survived
    if (h) {
      const v = (await get(ref(db, 'bounty/status/' + uid))).val();
      status = v === 'approved' || v === 'blocked' ? v : 'pending';
      await loadMine(uid);
    } else { status = 'none'; mine = []; }
  } catch (e) { offline = true; }
  loading = false; refreshHome(); renderHistory();
}
window.qbRefresh = syncStatus;

function chip(r) {
  const v = r.v;
  if (!v) return ['⏳ Review mein', 'w'];
  if (v.status === 'valid') return v.paid ? ['💸 Paid ₹' + v.amount, 'ok'] : ['✅ Valid ₹' + v.amount, 'ok'];
  return v.status === 'duplicate' ? ['🔁 Duplicate', 'd'] : ['❌ Reject', 'd'];
}
const fdate = t => t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

function refreshHome() {
  saveCache();
  document.body.classList.toggle('qb-on', hunterOn());
  const el = $('qbDash'); if (!el) return;
  const h = hunter();
  if (loading && !cache.status && status === 'none') { el.innerHTML = '<div class="qb-skel"></div><div class="qb-skel s"></div>'; return; }
  const valid = mine.filter(r => r.v && r.v.status === 'valid');
  const earned = valid.reduce((n, r) => n + (r.v.amount || 0), 0), paid = valid.filter(r => r.v.paid).reduce((n, r) => n + (r.v.amount || 0), 0);
  const badge = { none: ['Naye', ''], pending: ['⏳ Approval baaki', 'w'], approved: ['✅ Active', 'ok'], blocked: ['⛔ Band', 'd'] }[status];
  const steps = [['Apply + Exam', status !== 'none' ? 'done' : 'now'], ['Admin approval', status === 'approved' ? 'done' : status === 'blocked' ? 'bad' : status === 'pending' ? 'now' : ''], ['Pehli report', mine.length ? 'done' : status === 'approved' ? 'now' : '']];
  let html = `<div class="qb-hero"><div class="qb-av">${status === 'none' ? '🐞' : esc((h && h.name || 'H')[0].toUpperCase())}</div>
    <div><div class="qb-nm">${status === 'none' ? 'Bug Bounty' : esc(h ? h.name : 'Hunter')}</div><span class="qb-chip ${badge[1]}">${badge[0]}</span></div></div>`;
  if (offline) html += `<div class="qb-box qb-warn">Connection nahi ban paya. Internet check karein. <button class="btn btn-ghost" data-qb="retry">🔄 Retry</button></div>`;
  if (status === 'none') {
    html += `<div class="qb-box"><b>Galti dhoondo, inaam pao 💰</b><p class="qb-mut">Search ya Quiz mein sahi bug milne par <b>max ₹100</b>. Rules padho, chhota exam do, aur apply karo.</p></div>
      <button class="btn btn-primary btn-lg btn-block" data-qb="apply">Apply for Bug Bounty</button>`;
  } else {
    html += `<div class="qb-steps">${steps.map(([t, st], i) => `<div class="qb-step ${st}"><span>${st === 'done' ? '✓' : st === 'bad' ? '✕' : i + 1}</span>${t}</div>`).join('')}</div>
      <div class="qb-stats"><div><b>${mine.length}</b>Reports</div><div><b>${valid.length}</b>Valid</div><div><b>₹${paid}</b>Mila</div><div><b>₹${earned - paid}</b>Baaki</div></div>`;
    if (status === 'pending') html += `<div class="qb-box">Aapki application admin ke paas hai. Approve hote hi 🐞 buttons chalu ho jayenge. Tab tak rules padhte rahein.</div>`;
    if (status === 'blocked') html += `<div class="qb-box qb-warn">Aapka hunter access band hai. Admin se WhatsApp par baat karein.</div>`;
    if (status === 'approved') html += `<div class="qb-box qb-row"><div><b>Hunter mode</b><div class="qb-mut">Aaj: ${todayCount()}/${MAX_PER_DAY} reports</div></div>
      <label class="qb-sw"><input type="checkbox" data-qb="toggle" ${hunterOn() ? 'checked' : ''}><i></i></label></div>`;
    html += `<button class="btn btn-secondary btn-block" data-qb="history">📋 Meri reports (${mine.length})</button>`;
  }
  html += `<button class="btn btn-ghost btn-block" data-qb="rules">📜 Rules padho</button>
    <button class="btn btn-ghost btn-block" data-qb="known">❌ Ye bug nahi hain</button>`;
  el.innerHTML = html;
}

function renderHistory() {
  const el = $('qbHist'); if (!el) return;
  el.innerHTML = mine.length ? mine.map(r => { const [t, c] = chip(r);
    return `<div class="qb-box qb-item"><div class="qb-row"><b>${esc(r.label || r.type)}</b><span class="qb-chip ${c}">${t}</span></div>
      <div class="qb-mut">${fdate(r.createdAt)} · <button class="qb-copy" data-cp="${esc(repId(r.id))}">${esc(repId(r.id))} 📋</button></div></div>`; }).join('')
    : '<div class="qb-box qb-empty">🐞<br>Abhi koi report nahi.<br><span class="qb-mut">Search ya Quiz mein galti mile to 🐞 button dabayein.</span></div>';
}

async function registerHunter() {
  const name = $('qbName').value.trim();
  const wa = $('qbWa').value.replace(/[\s-]/g, '');
  const upi = $('qbUpi').value.trim();
  const msg = $('qbFormMsg');
  if (name.length < 2) return msg.textContent = 'Naam likhein.';
  if (!/^\+?\d{10,15}$/.test(wa)) return msg.textContent = 'WhatsApp number sahi likhein (10-15 digit).';
  if (!(/^[\w.\-]{2,}@[\w]{2,}$/.test(upi) || /^\d{10}$/.test(upi))) return msg.textContent = 'UPI ID (naam@bank) ya 10 digit UPI number likhein.';
  const digits = wa.replace(/\D/g, ''), key = digits.length === 10 ? '91' + digits : digits; // +91 / 91 / 10-digit = same number
  $('qbFormBtn').disabled = true; msg.textContent = 'Bhej rahe hain...';
  const uid = await ready;
  if (!uid) { msg.textContent = 'Connection nahi ban paya, thodi der baad try karein.'; $('qbFormBtn').disabled = false; return; }
  try {
    await update(ref(db, 'bounty'), {
      ['hunters/' + key]: { uid, name, whatsapp: key, upi, examScore: tmpScore, rulesVersion: RULES_VER, createdAt: serverTimestamp() },
      ['byUid/' + uid]: key
    });
    LS.set('qb_hunter', { id: uid, name }); LS.set('qb_on', true);
    status = 'pending'; refreshHome(); showSection('qbHome');
  } catch (e) { msg.textContent = 'Submit nahi hua. Ye WhatsApp number pehle se registered ho sakta hai, ya internet check karein.'; }
  $('qbFormBtn').disabled = false;
}

/* ============ REPORT ============ */
let reportFrom = 'menuScreen';
let snap = null; // { type, ...auto-attached read-only data }
let lastQuiz = null;

function todayCount() { const d = LS.get('qb_day'); const t = new Date().toDateString(); return d && d.t === t ? d.n : 0; }

function openReport(type) {
  if (!hunterOn()) return;
  reportFrom = type === 'search' ? 'searchScreen' : 'quizScreen';
  if (todayCount() >= MAX_PER_DAY) { toast('Aaj ki limit (' + MAX_PER_DAY + ' reports) poori ho gayi. Kal try karein.'); return; }
  let ro = '';
  if (type === 'search') {
    const inp = $('searchInput').value.trim();
    const res = (typeof currentSearchResults !== 'undefined' ? currentSearchResults : []);
    snap = { type, query: inp, filter: typeof searchFilter !== 'undefined' ? searchFilter : 'all', count: res.length,
      top: res.slice(0, 5).map(a => `${a.surah_number}:${a.ayat_no} (para ${a.para}, pip ${a.pip})`),
      inResults: res.map(a => a.surah_number + ':' + a.ayat_no) };
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
    const uid = await ready;
    if (!uid || uid !== hunter().id) throw new Error('auth');
    const key = push(ref(db, 'bounty/reports')).key;
    const label = snap.type === 'search' ? `Search "${snap.query.slice(0, 40)}" → ${claim.surah}:${claim.ayat}` : `Quiz ${row.surah_number}:${row.ayat_no}, para ${claim.para}/pip ${claim.pip}`;
    await update(ref(db, 'bounty'), {
      ['reports/' + key]: { hunterId: uid, type: snap.type, snapshot: s, claim, opinion: $('qbOpinion').value.trim().slice(0, 500), fingerprint, rulesVersion: RULES_VER, createdAt: serverTimestamp() },
      ['mine/' + uid + '/' + key]: { type: snap.type, label, createdAt: serverTimestamp() }
    });
    LS.set('qb_day', { t: new Date().toDateString(), n: todayCount() + 1 });
    mine.unshift({ id: key, type: snap.type, label, createdAt: Date.now(), v: null });
    toast('Report bhej di gayi ✅ ' + repId(key));
    refreshHome(); renderHistory(); showSection('qbHistory');
  } catch (e) { msg.textContent = 'Submit nahi hua. Approval baaki ho sakta hai, ya internet check karein.'; }
  $('qbRepBtn').disabled = false;
}

/* ============ BUILD UI ============ */
function screen(id, html) { const s = document.createElement('section'); s.id = id; s.className = 'screen'; s.innerHTML = '<div class="panel qb-panel">' + html + '</div>'; document.querySelector('main').appendChild(s); }
const back = to => `<button class="back-btn" onclick="showSection('${to}')">← Wapas</button>`;

function build() {
  screen('qbHome', `${back('menuScreen')}<div id="qbDash"></div>`);
  screen('qbHistory', `${back('qbHome')}<h2>📋 Meri reports</h2><div id="qbHist"></div>
    <button class="btn btn-ghost btn-block" data-qb="reload">🔄 Refresh</button>`);
  screen('qbRules', `${back('qbHome')}<h2>📜 Rules</h2><div id="qbRulesList"></div>
    <button id="qbDl" class="btn btn-secondary btn-block">📥 Rules download (.txt)</button>
    <label class="qb-opt"><input type="checkbox" id="qbAgree"> Maine rules padh liye</label>
    <button id="qbExamBtn" class="btn btn-primary btn-lg btn-block" disabled>Exam do →</button>`);
  screen('qbKnown', `${back('qbHome')}<h2>❌ Ye bug nahi hain</h2><div id="qbKnownBody"></div>`);
  screen('qbExam', `${back('qbRules')}<h2>📝 Chhota Exam</h2>
    <div class="qb-prog"><i id="qbProg"></i></div><div id="qbExamBody"></div>`);
  screen('qbForm', `${back('qbHome')}<h2>✅ Exam pass!</h2><p>Payment ke liye apni details bharein.</p>
    <input id="qbName" class="qb-in" placeholder="Poora naam" autocomplete="name">
    <input id="qbWa" class="qb-in" placeholder="WhatsApp number" inputmode="tel" autocomplete="tel">
    <input id="qbUpi" class="qb-in" placeholder="UPI ID (naam@bank) ya UPI number">
    <div id="qbFormMsg" class="qb-msg"></div>
    <button id="qbFormBtn" class="btn btn-primary btn-lg btn-block">Submit</button>`);
  screen('qbReport', `<button class="back-btn" id="qbRepBack">← Wapas</button><h2>🐞 Galti report karo</h2>
    <p>Ye auto-attach hai (badal nahi sakte):</p><div id="qbRO" class="qb-box qb-pre qb-ro"></div>
    <p id="qbClaimHelp"></p>
    <div id="qbSearchClaim"><input id="qbSurah" class="qb-in" type="number" placeholder="Surah number (1-114)" inputmode="numeric">
    <input id="qbAyat" class="qb-in" type="number" placeholder="Ayat number" inputmode="numeric"></div>
    <input id="qbPara" class="qb-in" type="number" placeholder="Sahi Para (1-30)" inputmode="numeric">
    <input id="qbPip" class="qb-in" type="number" placeholder="Sahi Page-in-Para" inputmode="numeric">
    <textarea id="qbOpinion" class="qb-in" rows="3" placeholder="Aapki raay (optional)"></textarea>
    <div id="qbRepMsg" class="qb-msg"></div>
    <button id="qbRepBtn" class="btn btn-primary btn-lg btn-block">Report bhejein</button>`);
  renderRules();

  $('qbAgree').onchange = e => $('qbExamBtn').disabled = !e.target.checked || !!hunter();
  $('qbDl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([RULES_TEXT], { type: 'text/plain;charset=utf-8' }));
    a.download = 'bug-bounty-rules.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const openRules = () => { $('qbAgree').checked = false; $('qbExamBtn').disabled = true; showSection('qbRules'); };
  document.addEventListener('click', e => {
    const cp = e.target.closest('[data-cp]'); if (cp) { try { navigator.clipboard.writeText(cp.dataset.cp); toast('Copy ho gaya'); } catch {} return; }
    const b = e.target.closest('[data-qb]'); if (!b || b.tagName === 'INPUT') return;
    ({ apply: openRules, rules: openRules, known: () => showSection('qbKnown'), examRetry: startExam, examNext: () => { $('qbFormMsg').textContent = ''; showSection('qbForm'); }, retry: syncStatus, reload: async () => { await syncStatus(); toast('Refresh ho gaya'); },
       history: () => { renderHistory(); showSection('qbHistory'); syncStatus(); } })[b.dataset.qb]?.();
  });
  document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.qb === 'toggle') { LS.set('qb_on', e.target.checked); refreshHome(); toast(e.target.checked ? 'Hunter mode ON 🐞' : 'Hunter mode OFF'); } });
  $('qbExamBtn').onclick = startExam;
  $('qbExamBody').onclick = pickAnswer;
  $('qbFormBtn').onclick = registerHunter;
  $('qbRepBtn').onclick = submitReport;
  $('qbRepBack').onclick = () => showSection(reportFrom);

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

  refreshHome(); renderHistory(); syncStatus();
}
build();
