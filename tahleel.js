/* ============ لفظ کا تجزیہ (reader me kisi lafz par tap karein) ============
   Data: tahleel/p{para}.json (Quranic Arabic Corpus morphology, GPL) — sirf us para ki file load hoti hai jo khuli ho.
   Depends on script.js globals: quranData, normalizeArabic. script.js ka openReader window.tahleelWrap use karta hai. */
(function () {
  const MARK = /^[ؕ-ؚۖ-۞ۢۥۦ۩۪-ۭ࣓-ࣿٓ]+$/;   // waqf ki alamatein (lafz nahi)
  const ud = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- reader ke lafzon ko tap-able banana ----
  window.tahleelWrap = function (a, body) {
    let w = 0;
    return body.split(' ').map(tok => {
      if (!tok || MARK.test(tok)) return tok;
      w++;
      return `<span class="tw" data-s="${a.surah_number}" data-a="${a.ayat_no}" data-w="${w}">${tok}</span>`;
    }).join(' ');
  };

  // ---- اردو اصطلاحات ----
  const TYPE = { PERF: 'فعل ماضی', IMPF: 'فعل مضارع', IMPV: 'فعل امر', ACT_PCPL: 'اسم فاعل', PASS_PCPL: 'اسم مفعول', VN: 'مصدر' };
  const NOUN = { PN: 'اسم علم', PRON: 'ضمیر', REL: 'اسم موصول', DEM: 'اسم اشارہ', LOC: 'ظرفِ مکان', T: 'ظرفِ زمان', ADJ: 'صفت' };
  const PART = {
    CONJ: 'حرفِ عطف', NEG: 'حرفِ نفی', EMPH: 'حرفِ تاکید', COND: 'حرفِ شرط', INTG: 'حرفِ استفہام', FUT: 'حرفِ استقبال',
    VOC: 'حرفِ ندا', ADDR: 'حرفِ ندا', RES: 'حرفِ حصر', CERT: 'حرفِ تحقیق', RSLT: 'حرفِ جوابِ شرط', PRP: 'لامِ تعلیل',
    CIRC: 'حالیہ', REM: 'حرفِ استیناف', SUB: 'حرفِ مصدری', PRO: 'حرفِ نہی', CAUS: 'حرفِ سببیہ', RET: 'حرفِ اضراب',
    EXP: 'حرفِ استثناء', EXH: 'حرفِ ترغیب', ANS: 'حرفِ جواب', SUR: 'حرفِ مفاجات', ATT: 'حرفِ تنبیہ', AVR: 'حرفِ ردع',
    INC: 'حرفِ ابتدا', EXL: 'حرفِ تفصیل', DIST: 'اسمِ اشارہ بعید کا حرف', COM: 'واوِ معیت', EQ: 'حرفِ تسویہ', INT: 'حرفِ تفسیر',
    PREV: 'حرفِ کافّہ', SUP: 'حرفِ زائد', AMD: 'حرفِ امتناع', IMPV: 'لامِ امر', INL: 'حرفِ ابتدائیہ'
  };
  const CASE = { NOM: 'مرفوع', ACC: 'منصوب', GEN: 'مجرور' };
  const MOOD = { IND: 'مرفوع', SUBJ: 'منصوب', JUS: 'مجزوم' };
  const PERSON = { 1: 'متکلم', 2: 'حاضر', 3: 'غائب' }, GENDER = { M: 'مذکر', F: 'مؤنث' }, NUMBER = { S: 'واحد', D: 'تثنیہ', P: 'جمع' };
  const BAAB = { 1: 'فَعَلَ', 2: 'فَعَّلَ', 3: 'فَاعَلَ', 4: 'أَفْعَلَ', 5: 'تَفَعَّلَ', 6: 'تَفَاعَلَ', 7: 'اِنْفَعَلَ', 8: 'اِفْتَعَلَ', 9: 'اِفْعَلَّ', 10: 'اِسْتَفْعَلَ' };

  function pgn(tags) {
    for (const t of tags.slice(1)) {
      const m = /^([123])?([MF])?([SDP])$/.exec(t);
      if (m && (m[1] || m[2])) return [m[1] && PERSON[m[1]], m[2] && GENDER[m[2]], NUMBER[m[3]]].filter(Boolean).join(' · ');
      if (m && tags[0] === 'N') return NUMBER[m[3]];
    }
    const g = tags.slice(1).find(t => t === 'M' || t === 'F');
    return g ? GENDER[g] : '';
  }

  // ---- مادّے کی قسم (صحیح / مہموز / مضاعف / معتل ...) ----
  const WEAK = c => 'وي'.includes(c), HAMZA = c => 'أءؤئإ'.includes(c);
  const wy = c => (c === 'و' ? 'واوی' : 'یائی');
  function rootKind(root) {
    const r = [...root];
    if (r.length === 4) return { name: 'رباعی', note: '' };
    if (r.length !== 3) return { name: '', note: '' };
    const k = [], n = [];
    if (r.some(HAMZA)) { k.push('مہموز'); n.push('مادّے میں ہمزہ ہے؛ ہمزہ کی تخفیف یا تبدیلی ہو سکتی ہے۔'); }
    if (WEAK(r[0]) && WEAK(r[2])) { k.push('لفیف مفروق'); n.push('پہلا اور تیسرا حرف حرفِ علت ہیں؛ دونوں پر اعلال کے قاعدے لگتے ہیں۔'); }
    else if (WEAK(r[1]) && WEAK(r[2])) { k.push('لفیف مقرون'); n.push('دوسرا اور تیسرا حرف حرفِ علت ہیں؛ دونوں پر اعلال کے قاعدے لگتے ہیں۔'); }
    else {
      if (WEAK(r[0])) { k.push('معتل مثال ' + wy(r[0])); n.push('پہلا حرف حرفِ علت ہے؛ صیغہ بنتے وقت اس میں تبدیلی یا حذف ہو سکتا ہے۔'); }
      if (WEAK(r[1])) { k.push('معتل اجوف ' + wy(r[1])); n.push('درمیانی حرف حرفِ علت ہے؛ اس کا قلب یا حذف (اعلال) ہوتا ہے، جیسے قَوَلَ ← قَالَ۔'); }
      if (WEAK(r[2])) { k.push('معتل ناقص ' + wy(r[2])); n.push('آخری حرف حرفِ علت ہے؛ اس کا قلب یا حذف (اعلال) ہو سکتا ہے۔'); }
    }
    if (!k.length && r[1] === r[2]) { k.push('مضاعف'); n.push('دوسرا اور تیسرا حرف ایک جیسے ہیں؛ ان کا ادغام ہو سکتا ہے۔'); }
    if (!k.length) k.push('صحیح سالم');
    return { name: k.join(' + '), note: n.join(' ') };
  }
  // باب کے وزن میں مادّہ رکھ کر (اعلال سے پہلے کی صورت)
  function applyPattern(f, root) {
    const r = [...root], p = BAAB[f];
    if (!p || r.length !== 3) return '';
    const m = { 'ف': r[0], 'ع': r[1], 'ل': r[2] };
    return [...p].map(c => m[c] || c).join('');
  }

  // ---- ڈیٹا ----
  const cache = new Map();           // para -> Promise(data)
  let ayatPara = null;
  function paraOf(s, a) {
    if (!ayatPara) { ayatPara = new Map(); window.quranData.forEach(q => ayatPara.set(q.surah_number + ':' + q.ayat_no, q.para)); }
    return ayatPara.get(s + ':' + a);
  }
  function loadPara(n) {
    if (!cache.has(n)) cache.set(n, fetch(`tahleel/p${n}.json`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(e => { cache.delete(n); throw e; }));
    return cache.get(n);
  }

  function seg(raw, D) {
    const tags = D.T[raw[1]].split('|');
    const has = t => tags.includes(t);
    return { text: raw[0], tags, pos: tags[0], root: D.R[raw[2]] || '', lem: D.L[raw[3]] || '', vf: raw[4] || 0, pref: has('PREF'), suff: has('SUFF'), has };
  }
  function kindOf(g) {
    const t = Object.keys(TYPE).find(k => g.has(k));
    if (g.pos === 'V') return TYPE[t] || 'فعل';
    if (g.pos === 'N') {
      if (t) return TYPE[t];
      if (g.has('PRON')) return g.suff ? 'ضمیرِ متصل' : 'ضمیرِ منفصل';
      const n = Object.keys(NOUN).find(k => g.has(k));
      return n ? NOUN[n] : 'اسم';
    }
    if (g.has('DET')) return 'حرفِ تعریف (ال)';
    if (g.tags.some(x => x.startsWith('FAM:'))) return 'حرفِ مشبہ بالفعل / کان کی بہن';
    const p = Object.keys(PART).find(k => g.has(k));
    if (p) return PART[p];
    if (g.has('ACC')) return 'حرفِ نصب';
    if (g.lem === 'س') return 'حرفِ استقبال';
    return g.has('P') ? 'حرفِ جار' : 'حرف';
  }

  // ---- sheet ----
  function sheet() {
    let el = document.getElementById('tahleelSheet');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tahleelSheet'; el.dir = 'rtl'; el.className = 'th-sheet hidden';
      el.innerHTML = '<div class="th-handle"></div><button class="th-close" aria-label="بند کریں">✕</button><div id="tahleelBody"></div>';
      document.body.appendChild(el);
      el.querySelector('.th-close').addEventListener('click', closeSheet);
    }
    return el;
  }
  function closeSheet() {
    const el = document.getElementById('tahleelSheet'); if (el) el.classList.add('hidden');
    document.querySelectorAll('.tw-active').forEach(x => x.classList.remove('tw-active'));
  }
  const row = (k, v) => v ? `<div class="th-row"><span class="th-k">${k}</span><span class="th-v">${v}</span></div>` : '';

  function card(g) {
    const kind = kindOf(g);
    const rk = g.root ? rootKind(g.root) : null;
    const isVerbal = g.root && (g.pos === 'V' || Object.keys(TYPE).some(k => g.has(k)));
    const ps = g.has('PASS') ? ' (مجہول)' : '';
    const mood = g.tags.find(x => x.startsWith('MOOD:'));
    const kase = ['NOM', 'ACC', 'GEN'].find(k => g.has(k));
    const base = isVerbal && g.vf ? applyPattern(g.vf, g.root) : '';
    let nu = '';
    if (g.pos === 'N' && !g.root) nu = '';
    return `<div class="th-card">
      <div class="th-card-title"><span class="th-big">${esc(g.text)}</span><span class="th-kind">${kind}${ps}</span></div>
      ${row('مادّہ', g.root && `<b>${esc(g.root)}</b>${rk && rk.name ? ' — ' + rk.name : ''}`)}
      ${row('اصل (لغت کی صورت)', g.lem && esc(g.lem))}
      ${row('باب', g.vf && `باب ${BAAB[g.vf] || ud(g.vf)}`)}
      ${row('شخص · جنس · عدد', pgn(g.tags))}
      ${row('اعراب', mood ? MOOD[mood.slice(5)] : (g.pos === 'N' && kase ? CASE[kase] : ''))}
      ${row('معرفہ / نکرہ', g.pos === 'N' && g.has('INDEF') ? 'نکرہ (تنوین)' : '')}
      ${base ? row('وزن میں مادّہ رکھنے سے', `${esc(base)} <span class="th-dim">(اعلال سے پہلے کا ڈھانچہ)</span>`) : ''}
      ${rk && isVerbal && rk.note ? `<div class="th-note">📝 ${rk.note}</div>` : ''}
      ${isVerbal && g.has('IMPF') ? '<div class="th-note">📝 مضارع کے شروع میں حروفِ مضارعت (أ ن ي ت) میں سے ایک آتا ہے۔</div>' : ''}
      ${isVerbal && g.has('PASS') ? '<div class="th-note">📝 مجہول: ماضی میں پہلے حرف پر پیش اور ما قبلِ آخر پر زیر؛ مضارع میں پہلے حرف پر پیش اور ما قبلِ آخر پر زبر۔</div>' : ''}
    </div>`;
  }

  function render(word, D, tokenText) {
    const segs = word.map(r => seg(r, D));
    const parts = segs.map(g => {
      const role = g.pref ? ' · سابقہ' : g.suff ? ' · لاحقہ' : '';
      const extra = g.suff || (g.pos === 'N' && g.has('PRON')) ? pgn(g.tags) : '';
      return `<span class="th-part"><b>${esc(g.text)}</b><small>${kindOf(g)}${role}${extra ? ' · ' + extra : ''}</small></span>`;
    }).join('<span class="th-plus">+</span>');
    const mains = segs.filter(g => !g.pref && !g.suff);
    const pre = segs.filter(g => g.pref), suf = segs.filter(g => g.suff);
    const summary = [
      pre.length ? `شروع میں لگا: ${pre.map(g => `<b>${esc(g.text)}</b> (${kindOf(g)})`).join('، ')}` : '',
      suf.length ? `آخر میں لگا: ${suf.map(g => `<b>${esc(g.text)}</b> (${kindOf(g)}${pgn(g.tags) ? ' · ' + pgn(g.tags) : ''})`).join('، ')}` : '',
      !pre.length && !suf.length ? 'کوئی سابقہ یا لاحقہ نہیں لگا — لفظ اپنی بنیادی شکل میں ہے۔' : ''
    ].filter(Boolean);
    return `<div class="th-word">${esc(tokenText)}</div>
      <div class="th-label">لفظ کے حصے</div><div class="th-parts">${parts}</div>
      ${mains.map(card).join('')}
      <div class="th-label">تبدیلی کا خلاصہ</div>
      <ul class="th-list">${summary.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest('.tw');
    if (!t) return;
    document.querySelectorAll('.tw-active').forEach(x => x.classList.remove('tw-active'));
    t.classList.add('tw-active');
    const el = sheet(), body = el.querySelector('#tahleelBody');
    el.classList.remove('hidden');
    body.innerHTML = '<p class="th-msg">لوڈ ہو رہا ہے…</p>';
    const s = +t.dataset.s, a = +t.dataset.a, w = +t.dataset.w;
    try {
      const D = await loadPara(paraOf(s, a));
      const words = D.A[s + ':' + a];
      const inDom = document.querySelectorAll(`.tw[data-s="${s}"][data-a="${a}"]`).length;
      if (!words || words.length !== inDom || !words[w - 1]) { body.innerHTML = '<p class="th-msg">اس لفظ کا تجزیہ دستیاب نہیں۔</p>'; return; }
      body.innerHTML = render(words[w - 1], D, t.textContent);
    } catch (err) { body.innerHTML = '<p class="th-msg">❌ ڈیٹا لوڈ نہیں ہو سکا۔</p>'; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  // reader chhodte hi sheet band
  new MutationObserver(() => { const r = document.getElementById('readerScreen'); if (r && !r.classList.contains('active')) closeSheet(); })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
