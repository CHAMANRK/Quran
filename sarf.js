/* ============ صرف ٹیب ============
   Data: morph.json (Quranic Arabic Corpus morphology, GPL) — sirf pehli baar sarf tab khulne par load hota hai.
   Depends on script.js globals: quranData, normalizeArabic, openReader. */
(function () {
  // ---- kya talash karna hai (chips) ----
  const KINDS = [
    { key: 'verb',      label: 'فعل (مطلق)',   test: x => x.t <= 2 },
    { key: 'PERF',      label: 'ماضی',         test: x => x.t === 0 },
    { key: 'IMPF',      label: 'مضارع',        test: x => x.t === 1 },
    { key: 'IMPV',      label: 'امر',          test: x => x.t === 2 },
    { key: 'ACT_PCPL',  label: 'اسم فاعل',     test: x => x.t === 3 },
    { key: 'PASS_PCPL', label: 'اسم مفعول',    test: x => x.t === 4 },
    { key: 'VN',        label: 'مصدر',         test: x => x.t === 5, note: 'نوٹ: ڈیٹا میں مصدر صرف ابواب ۲ تا ۱۰ کے نشان زد ہیں۔' },
    { key: 'PASS',      label: 'مجہول',        test: x => x.pass },
    { key: 'BAAB',      label: 'باب',          test: x => x.vf > 0 }
  ];
  const TYPE_LABEL = ['ماضی', 'مضارع', 'امر', 'اسم فاعل', 'اسم مفعول', 'مصدر'];
  const BAAB = {
    1: 'فَعَلَ', 2: 'فَعَّلَ', 3: 'فَاعَلَ', 4: 'أَفْعَلَ', 5: 'تَفَعَّلَ',
    6: 'تَفَاعَلَ', 7: 'اِنْفَعَلَ', 8: 'اِفْتَعَلَ', 9: 'اِفْعَلَّ', 10: 'اِسْتَفْعَلَ'
  };
  const SURAH_UR = ["الفاتحہ", "البقرہ", "آل عمران", "النساء", "المائدہ", "الانعام", "الاعراف", "الانفال", "التوبہ", "یونس", "ہود", "یوسف", "الرعد", "ابراہیم", "الحجر", "النحل", "بنی اسرائیل", "الکہف", "مریم", "طٰہٰ", "الانبیاء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنکبوت", "الروم", "لقمان", "السجدہ", "الاحزاب", "سبا", "فاطر", "یٰسین", "الصافات", "ص", "الزمر", "غافر", "حٰم السجدہ", "الشوریٰ", "الزخرف", "الدخان", "الجاثیہ", "الاحقاف", "محمد", "الفتح", "الحجرات", "ق", "الذاریات", "الطور", "النجم", "القمر", "الرحمٰن", "الواقعہ", "الحدید", "المجادلہ", "الحشر", "الممتحنہ", "الصف", "الجمعہ", "المنافقون", "التغابن", "الطلاق", "التحریم", "الملک", "القلم", "الحاقہ", "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القیامہ", "الدہر", "المرسلات", "النبا", "النازعات", "عبس", "التکویر", "الانفطار", "المطففین", "الانشقاق", "البروج", "الطارق", "الاعلیٰ", "الغاشیہ", "الفجر", "البلد", "الشمس", "اللیل", "الضحیٰ", "الم نشرح", "التین", "العلق", "القدر", "البینہ", "الزلزال", "العادیات", "القارعہ", "التکاثر", "العصر", "الہمزہ", "الفیل", "قریش", "الماعون", "الکوثر", "الکافرون", "النصر", "اللہب", "الاخلاص", "الفلق", "الناس"];
  const ud = n => String(n).replace(/\d/g, d => '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9'[d]);   // Urdu ہندسے
  const baabName = f => 'باب ' + (BAAB[f] || ud(f));
  const PAGE = 30;

  const st = { kind: 'verb', baab: null, shown: PAGE };
  let rows = null, loading = null, ayatIndex = null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rootKey = s => normalizeArabic(String(s)).replace(/[\s\u0640]/g, '');

  async function ensureData() {
    if (rows) return true;
    if (!loading) {
      loading = fetch('morph.json').then(r => r.json()).then(d => {
        rows = d.rows.map(r => ({ s: r[0], a: r[1], word: r[3], root: r[4], rootN: rootKey(r[4]), t: r[5], vf: r[6], pass: !!r[7] }));
        ayatIndex = new Map();
        window.quranData.forEach((q, i) => ayatIndex.set(q.surah_number + ':' + q.ayat_no, i));
      });
    }
    try { await loading; return true; } catch (e) { loading = null; return false; }
  }

  // ---- chips ----
  function drawChips() {
    $('sarfKinds').innerHTML = KINDS.map(k =>
      `<button class="chip sarf-ur${st.kind === k.key ? ' active' : ''}" data-kind="${k.key}">${k.label}</button>`).join('');
    const baabRow = $('sarfBaabs');
    baabRow.classList.toggle('hidden', st.kind !== 'BAAB');
    baabRow.innerHTML = Object.keys(BAAB).map(f =>
      `<button class="chip sarf-ur${st.baab === +f ? ' active' : ''}" data-baab="${f}">${baabName(+f)}</button>`).join('');
  }

  // ---- natije ----
  async function render() {
    const meta = $('sarfMeta'), list = $('sarfList'), more = $('sarfMore');
    more.classList.add('hidden');
    if (st.kind === 'BAAB' && !st.baab) { meta.textContent = 'اوپر سے کوئی باب منتخب کیجیے۔'; list.innerHTML = ''; return; }
    meta.textContent = 'لوڈ ہو رہا ہے…';
    if (!(await ensureData())) { meta.textContent = '❌ ڈیٹا لوڈ نہیں ہو سکا۔'; return; }

    const kind = KINDS.find(k => k.key === st.kind);
    const q = rootKey($('sarfInput').value || '');
    const res = rows.filter(x => kind.test(x) && (st.kind !== 'BAAB' || x.vf === st.baab) && (!q || x.rootN.startsWith(q)));
    const shown = res.slice(0, st.shown);

    meta.textContent = `نتائج: ${ud(res.length)}` + (q ? ` — مادّہ «${$('sarfInput').value.trim()}» سے شروع` : '') + (kind.note ? '  ·  ' + kind.note : '');
    if (!res.length) { list.innerHTML = '<p class="sarf-empty sarf-ur">کوئی لفظ نہیں ملا۔ مادّے کا پہلا حرف یا پورا مادّہ لکھ کر دیکھیے۔</p>'; return; }

    list.innerHTML = shown.map(x => {
      const qa = window.quranData[ayatIndex.get(x.s + ':' + x.a)];
      return `<div class="search-result" data-open="${x.s}:${x.a}">
        <div class="ayat-snippet"><mark>${esc(x.word)}</mark></div>
        <div class="result-meta">
          <span class="badge sarf-ur">${TYPE_LABEL[x.t]}${x.pass && x.t <= 1 ? ' · مجہول' : ''}</span>
          ${x.vf ? `<span class="badge sarf-ur">${baabName(x.vf)}</span>` : ''}
          <span class="badge sarf-ur">مادّہ ${esc(x.root)}</span>
          <span class="badge sarf-ur">${SURAH_UR[x.s - 1] || x.s} : ${ud(x.a)}</span>
          ${qa ? `<span class="badge sarf-ur">پارہ ${ud(qa.para)}</span>` : ''}
        </div></div>`;
    }).join('');
    more.classList.toggle('hidden', res.length <= shown.length);
  }

  // ---- ٹیب بدلنا ----
  function showTab(which) {
    document.querySelectorAll('#searchTabs .chip').forEach(c => c.classList.toggle('active', c.dataset.tab === which));
    $('searchMain').classList.toggle('hidden', which !== 'search');
    $('sarfPanel').classList.toggle('hidden', which !== 'sarf');
    if (which === 'sarf') { drawChips(); render(); }
  }

  $('searchTabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); });
  $('sarfKinds').addEventListener('click', e => {
    const t = e.target.closest('[data-kind]'); if (!t) return;
    st.kind = t.dataset.kind; st.shown = PAGE; drawChips(); render();
  });
  $('sarfBaabs').addEventListener('click', e => {
    const t = e.target.closest('[data-baab]'); if (!t) return;
    const f = +t.dataset.baab; st.baab = st.baab === f ? null : f; st.shown = PAGE; drawChips(); render();
  });
  let deb;
  $('sarfInput').addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { st.shown = PAGE; render(); }, 200); });
  $('sarfMore').addEventListener('click', () => { st.shown += PAGE; render(); });
  $('sarfList').addEventListener('click', e => {
    const t = e.target.closest('[data-open]'); if (!t) return;
    const i = ayatIndex.get(t.dataset.open); if (i !== undefined) openReader(i);
  });
})();
