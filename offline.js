/* ============ آف لائن ڈیٹا: پہلی بار loader + hatane ka option ============
   sw.js ke saath kaam karta hai (message: PRECACHE / STATUS / CANCEL / CLEAR_DATA).
   - Pehli visit (ya data ka naya version aane par) loader khulta hai aur sab kuch download karke cache kar deta hai.
   - User "بعد میں" dabaye to download ruk jata hai aur dobara nahi poochha jata.
   - Menu ke "📦 آف لائن ڈیٹا" se baad me download ya hata bhi sakte hain. */
(function () {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return;
  const KEY = 'qqOffline';
  const ud = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const mb = b => ud((b / 1048576).toFixed(1)) + ' MB';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  let reg = null, st = null, downloading = false, first = true, prog = { done: 0, total: 0, bytes: 0, fail: 0 };
  let overlay = null, panel = null;

  // ---- style ----
  const css = document.createElement('style');
  css.textContent = `
  .qo-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;
    background:var(--primary,#0B3D2E);color:#fff;font-family:'Scheherazade New',serif;text-align:center;animation:qoIn .25s ease}
  .qo-box{width:100%;max-width:420px}
  .qo-box img{width:76px;height:76px;border-radius:20px;margin-bottom:14px}
  .qo-title{font-size:1.9rem;font-weight:700;line-height:1.4;margin:0 0 8px}
  .qo-sub{font-size:1.1rem;opacity:.9;line-height:1.8;margin:0 0 18px}
  .qo-bar{height:12px;border-radius:8px;background:rgba(255,255,255,.2);overflow:hidden}
  .qo-fill{height:100%;width:0;background:var(--mint,#1CC88A);border-radius:8px;transition:width .2s}
  .qo-meta{margin:10px 0 18px;font-size:1rem;opacity:.9;min-height:1.6em}
  .qo-btn{font:inherit;font-size:1.05rem;font-weight:700;border:0;border-radius:12px;padding:10px 18px;cursor:pointer;margin:4px}
  .qo-go{background:var(--mint,#1CC88A);color:#06281D}.qo-sec{background:rgba(255,255,255,.18);color:#fff}
  .qo-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.55);font-family:'Scheherazade New',serif}
  .qo-card{width:100%;max-width:420px;background:var(--surface,#fff);color:var(--text,#222);border-radius:18px;padding:20px;text-align:right}
  .qo-card h3{margin:0 0 10px;font-size:1.5rem}.qo-card p{margin:6px 0;font-size:1.1rem;line-height:1.8}
  .qo-card .qo-sec{background:rgba(128,128,128,.18);color:inherit}.qo-card .qo-go{color:#06281D}
  .qo-card .qo-danger{background:#c0392b;color:#fff}.qo-actions{margin-top:14px;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-start}
  @keyframes qoIn{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.qo-overlay{animation:none}}`;
  document.head.appendChild(css);

  const send = m => { const w = reg && reg.active; if (w) w.postMessage(m); };

  // ---- loader (پوری اسکرین) ----
  function showOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'qo-overlay'; overlay.dir = 'rtl'; overlay.setAttribute('role', 'dialog');
    overlay.innerHTML = `<div class="qo-box">
      <img src="icon-192.png" alt="">
      <h2 class="qo-title">ایپ تیار ہو رہی ہے</h2>
      <p class="qo-sub" id="qoSub">قرآن کا سارا ڈیٹا ایک بار ڈاؤن لوڈ ہو کر محفوظ ہو جائے گا، تاکہ ایپ تیز چلے اور انٹرنیٹ کے بغیر بھی کام کرے۔</p>
      <div class="qo-bar"><div class="qo-fill" id="qoFill"></div></div>
      <div class="qo-meta" id="qoMeta">جانچ ہو رہی ہے…</div>
      <div id="qoBtns"><button class="qo-btn qo-sec" id="qoSkip">بعد میں</button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#qoSkip').onclick = skip;
  }
  function hideOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  function paint() {
    if (!overlay) return;
    const pct = prog.total ? Math.round(prog.done / prog.total * 100) : 0;
    overlay.querySelector('#qoFill').style.width = pct + '%';
    overlay.querySelector('#qoMeta').textContent = prog.total ? `${ud(prog.done)} / ${ud(prog.total)} فائلیں · ${mb(prog.bytes)}` : 'جانچ ہو رہی ہے…';
  }
  function skip() {
    send({ type: 'CANCEL' });
    downloading = false;
    write({ dataVer: st ? st.dataVer : null, mode: 'skipped' });
    hideOverlay();
  }
  function start() {
    downloading = true; prog = { done: 0, total: 0, bytes: 0, fail: 0 };
    showOverlay();
    const sub = overlay.querySelector('#qoSub');
    sub.textContent = 'قرآن کا سارا ڈیٹا ایک بار ڈاؤن لوڈ ہو کر محفوظ ہو جائے گا، تاکہ ایپ تیز چلے اور انٹرنیٹ کے بغیر بھی کام کرے۔';
    overlay.querySelector('#qoBtns').innerHTML = '<button class="qo-btn qo-sec" id="qoSkip">بعد میں</button>';
    overlay.querySelector('#qoSkip').onclick = skip;
    paint();
    send({ type: 'PRECACHE' });
  }
  function finished(m) {
    downloading = false;
    if (m.fail === 0) {
      write({ dataVer: st ? st.dataVer : null, mode: 'done' });
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
      if (overlay) {
        overlay.querySelector('#qoSub').textContent = '✓ سب تیار ہے — اب ایپ تیز اور آف لائن بھی چلے گی۔';
        overlay.querySelector('#qoBtns').innerHTML = '';
        setTimeout(hideOverlay, 900);
      }
      if (panel) openPanel();
    } else if (overlay) {
      overlay.querySelector('#qoSub').textContent = `❌ ${ud(m.fail)} فائلیں ڈاؤن لوڈ نہیں ہو سکیں (انٹرنیٹ چیک کریں)۔`;
      overlay.querySelector('#qoBtns').innerHTML = '<button class="qo-btn qo-go" id="qoRetry">دوبارہ کوشش</button><button class="qo-btn qo-sec" id="qoSkip">بعد میں</button>';
      overlay.querySelector('#qoRetry').onclick = start;
      overlay.querySelector('#qoSkip').onclick = skip;
    }
  }

  // ---- ترتیبات (menu ka "📦 آف لائن ڈیٹا" button) ----
  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function openPanel() {
    closePanel();
    send({ type: 'STATUS' });
    panel = document.createElement('div');
    panel.className = 'qo-modal'; panel.dir = 'rtl';
    const have = st && st.complete, part = st && st.count > 0 && !st.complete;
    const state = downloading ? 'ڈاؤن لوڈ ہو رہا ہے…' : have ? '✓ ڈاؤن لوڈ شدہ' : part ? 'ادھورا ڈاؤن لوڈ' : 'ڈاؤن لوڈ نہیں ہوا';
    panel.innerHTML = `<div class="qo-card">
      <h3>📦 آف لائن ڈیٹا</h3>
      <p>حالت: <b>${state}</b>${st && st.count ? `<br>فائلیں: ${ud(st.count)} / ${ud(st.total)} · حجم: ${mb(st.bytes)}` : ''}</p>
      <p style="opacity:.75;font-size:1rem">اس میں لفظ کا تجزیہ، صرف اور مادّہ کا ڈیٹا شامل ہے۔ ہٹانے پر ایپ چلتی رہے گی، بس یہ حصے صرف انٹرنیٹ ہونے پر کھلیں گے اور خود دوبارہ ڈاؤن لوڈ نہیں ہوں گے۔</p>
      <div class="qo-actions">
        <button class="qo-btn qo-go" id="qoDl">${have ? 'اپڈیٹ کریں' : 'ڈاؤن لوڈ کریں'}</button>
        ${st && st.count ? '<button class="qo-btn qo-danger" id="qoRm">ڈیٹا ہٹائیں</button>' : ''}
        <button class="qo-btn qo-sec" id="qoClose">بند کریں</button>
      </div></div>`;
    document.body.appendChild(panel);
    panel.onclick = e => { if (e.target === panel) closePanel(); };
    panel.querySelector('#qoClose').onclick = closePanel;
    panel.querySelector('#qoDl').onclick = () => { closePanel(); start(); };
    const rm = panel.querySelector('#qoRm');
    if (rm) rm.onclick = () => { if (confirm('آف لائن ڈیٹا ہٹا دیں؟')) send({ type: 'CLEAR_DATA' }); };
  }
  window.qoOpen = openPanel;

  // ---- SW se jawab ----
  navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'STATUS') {
      st = m;
      if (first) {                                   // pehli jaanch: loader chahiye ya nahi
        first = false;
        const s = read();
        if (m.complete) { write({ dataVer: m.dataVer, mode: 'done' }); hideOverlay(); }
        else if (s && s.dataVer === m.dataVer && (s.mode === 'skipped' || s.mode === 'removed')) hideOverlay();
        else start();
      } else if (panel) openPanel();
    } else if (m.type === 'PROGRESS') { prog = m; paint(); }
    else if (m.type === 'DONE') finished(m);
    else if (m.type === 'CANCELLED') { downloading = false; }
    else if (m.type === 'CLEARED') {
      write({ dataVer: st ? st.dataVer : null, mode: 'removed' });
      st = Object.assign({}, st, { count: 0, bytes: 0, complete: false });
      if (panel) openPanel();
    }
  });

  // ---- shuru ----
  if (!read()) showOverlay();                        // bilkul naya user: foran loader (flash nahi)
  navigator.serviceWorker.ready.then(r => {
    reg = r;
    send({ type: 'STATUS' });
    setTimeout(() => { if (first) { first = false; hideOverlay(); } }, 5000);   // SW jawab na de to app na rukey
  }).catch(() => hideOverlay());
})();
