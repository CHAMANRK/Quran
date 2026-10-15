/* ============ SARF SEARCH (root -> mazi / muzare / amr / fa'el / maf'ool / masdar / baab) ============
   Data: morph.json (Quranic Arabic Corpus morphology, via mustafa0x/quran-morphology, GPL).
   Sirf tab load hota hai jab user "Sarf" chip kholta hai.
   Depends on script.js globals: quranData, normalizeArabic, openReader. */
(function () {
  const CATS = [
    { key: 'PERF',      idx: 0,  label: 'ماضی' },
    { key: 'IMPF',      idx: 1,  label: 'مضارع' },
    { key: 'IMPV',      idx: 2,  label: 'امر' },
    { key: 'ACT_PCPL',  idx: 3,  label: 'اسم فاعل' },
    { key: 'PASS_PCPL', idx: 4,  label: 'اسم مفعول' },
    { key: 'VN',        idx: 5,  label: 'مصدر' },
    { key: 'PASS',      idx: -1, label: 'مجہول' }   // flag, not a type
  ];
  const BAAB = {
    1: 'فَعَلَ', 2: 'فَعَّلَ', 3: 'فَاعَلَ', 4: 'أَفْعَلَ', 5: 'تَفَعَّلَ',
    6: 'تَفَاعَلَ', 7: 'اِنْفَعَلَ', 8: 'اِفْتَعَلَ', 9: 'اِفْعَلَّ', 10: 'اِسْتَفْعَلَ'
  };
  const SURAH_UR = ["الفاتحہ", "البقرہ", "آل عمران", "النساء", "المائدہ", "الانعام", "الاعراف", "الانفال", "التوبہ", "یونس", "ہود", "یوسف", "الرعد", "ابراہیم", "الحجر", "النحل", "بنی اسرائیل", "الکہف", "مریم", "طٰہٰ", "الانبیاء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنکبوت", "الروم", "لقمان", "السجدہ", "الاحزاب", "سبا", "فاطر", "یٰسین", "الصافات", "ص", "الزمر", "غافر", "حٰم السجدہ", "الشوریٰ", "الزخرف", "الدخان", "الجاثیہ", "الاحقاف", "محمد", "الفتح", "الحجرات", "ق", "الذاریات", "الطور", "النجم", "القمر", "الرحمٰن", "الواقعہ", "الحدید", "المجادلہ", "الحشر", "الممتحنہ", "الصف", "الجمعہ", "المنافقون", "التغابن", "الطلاق", "التحریم", "الملک", "القلم", "الحاقہ", "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القیامہ", "الدہر", "المرسلات", "النبا", "النازعات", "عبس", "التکویر", "الانفطار", "المطففین", "الانشقاق", "البروج", "الطارق", "الاعلیٰ", "الغاشیہ", "الفجر", "البلد", "الشمس", "اللیل", "الضحیٰ", "الم نشرح", "التین", "العلق", "القدر", "البینہ", "الزلزال", "العادیات", "القارعہ", "التکاثر", "العصر", "الہمزہ", "الفیل", "قریش", "الماعون", "الکوثر", "الکافرون", "النصر", "اللہب", "الاخلاص", "الفلق", "الناس"];
  const ud = n => String(n).replace(/\d/g, d => '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9'[d]);   // Urdu ہندسے
  const baabName = f => 'باب ' + (BAAB[f] || f);
  const PAGE = 30;

  let rows = null;          // [{s,a,w,word,root,rootN,t,vf,pass}]
  let byRoot = null;        // Map rootN -> {root, items[]}
  let loading = null;
  let ayatIndex = null;     // "s:a" -> index in quranData
  const st = { q: null, root: null, cat: null, baab: null, shown: PAGE };

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rootKey = s => normalizeArabic(String(s)).replace(/[\sـ]/g, '');

  async function ensureData() {
    if (rows) return true;
    if (!loading) {
      loading = fetch('morph.json').then(r => r.json()).then(d => {
        rows = d.rows.map(r => ({ s: r[0], a: r[1], w: r[2], word: r[3], root: r[4], rootN: rootKey(r[4]), t: r[5], vf: r[6], pass: !!r[7] }));
        byRoot = new Map();
        rows.forEach(x => {
          if (!x.rootN) return;
          if (!byRoot.has(x.rootN)) byRoot.set(x.rootN, { root: x.root, items: [] });
          byRoot.get(x.rootN).items.push(x);
        });
        ayatIndex = new Map();
        window.quranData.forEach((q, i) => ayatIndex.set(q.surah_number + ':' + q.ayat_no, i));
      });
    }
    try { await loading; return true; } catch (e) { loading = null; return false; }
  }

  function box() {
    let el = $('sarfResults');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sarfResults';
      el.dir = 'rtl';   // اردو کے لیے دائیں سے بائیں
      $('searchResults').parentNode.insertBefore(el, $('searchResults'));
    }
    return el;
  }

  const matchCat = (x, cat) => cat === 'PASS' ? x.pass : x.t === CATS.find(c => c.key === cat).idx;

  function chip(label, count, active, attrs) {
    return `<button class="chip sarf-ur${active ? ' active' : ''}" ${attrs}>${label} <b>${ud(count)}</b></button>`;
  }

  // q = root ka shuru ka hissa (1, 2 ya 3 harf). Maadda (root) ke pehle harf se match hota hai,
  // isliye "ك" par إِكْرَاهَ / تَكْلِيمًا / ٱلتَّكَاثُرُ jaise lafz bhi aate hain jo alif/ta se shuru hote hain.
  function renderGroup(q) {
    const el = box();
    if (st.q !== q) { st.q = q; st.cat = null; st.baab = null; st.root = null; st.shown = PAGE; }
    const groups = [...byRoot.entries()].filter(([k]) => k.startsWith(q)).sort((a, b) => b[1].items.length - a[1].items.length);
    if (!groups.length) {
      el.innerHTML = '<p class="sarf-empty sarf-ur">اس مادّے کا کوئی فعل یا مشتق نہیں ملا۔ مادّے کا پہلا حرف یا پورا مادّہ لکھیے (جیسے ك، كتب، علم)۔</p>';
      return;
    }
    const allItems = groups.flatMap(([, g]) => g.items);
    const base = st.root ? byRoot.get(st.root).items : allItems;   // chips ke counts is par based hain

    const catChips = CATS.map(c => {
      const n = base.filter(x => matchCat(x, c.key)).length;
      return n ? chip(c.label, n, st.cat === c.key, `data-sarf-cat="${c.key}"`) : '';
    }).join('');
    const forms = [...new Set(base.map(x => x.vf).filter(Boolean))].sort((a, b) => a - b);
    const baabChips = forms.map(f =>
      chip(baabName(f), base.filter(x => x.vf === f).length, st.baab === f, `data-sarf-baab="${f}"`)).join('');
    const rootChips = groups.length > 1 || st.root
      ? groups.slice(0, 40).map(([k, g]) => chip(esc(g.root), g.items.length, st.root === k, `data-sarf-root="${k}"`)).join('') : '';

    const list = base.filter(x => (!st.cat || matchCat(x, st.cat)) && (!st.baab || x.vf === st.baab));
    const shown = list.slice(0, st.shown);
    const title = st.root ? byRoot.get(st.root).root : esc(q);

    el.innerHTML = `
      <div class="sarf-head"><span class="sarf-root">${title}</span>
        <span class="sarf-sub">${st.root ? 'مادّہ' : ud(groups.length) + ' مادّے'} · ${ud(base.length)} الفاظ</span>
        <button class="chip" data-sarf-back="1">✕ صاف کریں</button></div>
      <div class="sarf-label">صیغہ</div><div class="filter-chips sarf-chips">${catChips}</div>
      ${baabChips ? `<div class="sarf-label">باب</div><div class="filter-chips sarf-chips">${baabChips}</div>` : ''}
      ${rootChips ? `<div class="sarf-label">مادّہ${groups.length > 40 && !st.root ? ' (سب سے زیادہ ۴۰)' : ''}</div><div class="filter-chips sarf-chips">${rootChips}</div>` : ''}
      <div class="search-meta sarf-ur">نتائج: ${ud(list.length)}${(st.cat || st.baab || st.root) ? ' (فلٹر لگا ہے — ہٹانے کے لیے دوبارہ ٹیپ کریں)' : ''}</div>
      ${shown.map(x => {
        const cat = CATS[x.t].label + (x.pass && x.t <= 1 ? ' · مجہول' : '');
        const qa = window.quranData[ayatIndex.get(x.s + ':' + x.a)];
        return `<div class="search-result" data-sarf-open="${x.s}:${x.a}">
          <div class="ayat-snippet"><mark>${esc(x.word)}</mark></div>
          <div class="result-meta">
            <span class="badge sarf-ur">${cat}</span>
            ${x.vf ? `<span class="badge sarf-ur">${baabName(x.vf)}</span>` : ''}
            <span class="badge sarf-ur">مادّہ ${esc(x.root)}</span>
            <span class="badge sarf-ur">${SURAH_UR[x.s - 1] || x.s} : ${ud(x.a)}</span>
            ${qa ? `<span class="badge sarf-ur">پارہ ${ud(qa.para)}</span>` : ''}
          </div></div>`;
      }).join('')}
      ${list.length > shown.length ? `<button class="btn btn-secondary btn-block" data-sarf-more="1">مزید دکھائیں</button>` : ''}`;
    el.classList.remove('hidden');
  }

  async function sarfSearch(inputRaw) {
    $('searchResults').innerHTML = '';
    $('loadMoreBtn').classList.add('hidden');
    $('searchMeta').classList.add('hidden');
    const el = box();
    const q = rootKey(inputRaw || '');
    if (!q) { el.innerHTML = '<p class="sarf-empty sarf-ur">مادّے کا پہلا حرف یا پورا مادّہ لکھیے — جیسے <b>ك</b>، <b>كت</b> یا <b>كتب</b>۔ اس مادّے سے بنے ماضی، مضارع، امر، اسم فاعل، اسم مفعول، مصدر اور ابواب نظر آئیں گے، چاہے لفظ کسی بھی حرف سے شروع ہو۔</p>'; st.q = null; return; }
    el.innerHTML = '<p class="sarf-empty sarf-ur">لوڈ ہو رہا ہے…</p>';
    if (!(await ensureData())) { el.innerHTML = '<p class="sarf-empty sarf-ur">❌ ڈیٹا لوڈ نہیں ہو سکا۔</p>'; return; }
    renderGroup(q);
  }

  function sarfHide() { const el = $('sarfResults'); if (el) { el.innerHTML = ''; } st.q = null; }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-sarf-cat],[data-sarf-baab],[data-sarf-root],[data-sarf-open],[data-sarf-more],[data-sarf-back]');
    if (!t || !$('sarfResults') || !$('sarfResults').contains(t)) return;
    if (t.dataset.sarfRoot) { st.root = st.root === t.dataset.sarfRoot ? null : t.dataset.sarfRoot; st.cat = null; st.baab = null; st.shown = PAGE; return renderGroup(st.q); }
    if (t.dataset.sarfBack) { $('searchInput').value = ''; $('searchInput').focus(); return sarfSearch(''); }
    if (t.dataset.sarfCat) { st.cat = st.cat === t.dataset.sarfCat ? null : t.dataset.sarfCat; st.shown = PAGE; return renderGroup(st.q); }
    if (t.dataset.sarfBaab) { const f = +t.dataset.sarfBaab; st.baab = st.baab === f ? null : f; st.shown = PAGE; return renderGroup(st.q); }
    if (t.dataset.sarfMore) { st.shown += PAGE; return renderGroup(st.q); }
    if (t.dataset.sarfOpen) { const i = ayatIndex.get(t.dataset.sarfOpen); if (i !== undefined) openReader(i); }
  });

  window.sarfSearch = sarfSearch;
  window.sarfHide = sarfHide;
})();
