/* PWA: service worker register + "App install karein" popup */
(() => {
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;                                   // app ke andar se kholne par kuch nahi dikhana
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const KEY = 'qqInstallDismissed', DAYS = 7;
  const dismissed = () => { try { return Date.now() - (+localStorage.getItem(KEY) || 0) < DAYS * 864e5; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, Date.now()); } catch {} };
  let dp = null, bar = null;

  const st = document.createElement('style');
  st.textContent = `.pwa-bar{position:fixed;left:14px;right:14px;bottom:18px;max-width:520px;margin:0 auto;z-index:9000;display:flex;align-items:center;gap:12px;
    background:var(--primary,#0B3D2E);color:#fff;border-radius:20px;padding:12px 12px 12px 14px;box-shadow:0 12px 32px rgba(11,61,46,.35);animation:pwaUp .35s ease}
    .pwa-bar img{width:44px;height:44px;border-radius:12px;flex:none}.pwa-bar div{flex:1;line-height:1.35;font-size:.86rem}
    .pwa-bar b{display:block;font-size:.98rem}.pwa-bar span{opacity:.85}
    .pwa-bar button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:10px 14px;cursor:pointer}
    .pwa-go{background:var(--mint,#1CC88A);color:#06281D}.pwa-x{background:transparent;color:#fff;padding:8px 10px!important;opacity:.8}
    @keyframes pwaUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){.pwa-bar{animation:none}}`;
  document.head.appendChild(st);

  const hide = () => { if (bar) { bar.remove(); bar = null; } };
  function show() {
    if (bar || (!dp && !ios)) return;
    bar = document.createElement('div'); bar.className = 'pwa-bar'; bar.setAttribute('role', 'dialog');
    bar.innerHTML = `<img src="icon-192.png" alt=""><div><b>App install karein</b><span>${dp ? 'Home screen se seedha kholein, offline bhi chalega.' : 'Safari mein Share ⬆️ dabayein, phir "Add to Home Screen" chunein.'}</span></div>
      ${dp ? '<button class="pwa-go">Install</button>' : ''}<button class="pwa-x" aria-label="Band karein">✕</button>`;
    bar.querySelector('.pwa-x').onclick = () => { remember(); hide(); };
    const go = bar.querySelector('.pwa-go'); if (go) go.onclick = install;
    document.body.appendChild(bar);
  }
  async function install() {
    if (!dp) return show();
    hide(); dp.prompt();
    try { await dp.userChoice; } catch {}
    dp = null; btn.style.display = 'none';
  }

  // header mein chhota 📲 button (jab install possible ho)
  const btn = document.createElement('button');
  btn.className = 'icon-btn'; btn.textContent = '📲'; btn.setAttribute('aria-label', 'App install karein'); btn.style.display = 'none';
  btn.onclick = () => { dp ? install() : show(); };
  const right = document.querySelector('.header-right'); if (right) right.insertBefore(btn, right.firstChild);

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); dp = e; btn.style.display = '';
    if (!dismissed()) setTimeout(show, 6000);
  });
  addEventListener('appinstalled', () => { dp = null; hide(); btn.style.display = 'none'; remember(); });
  if (ios) { btn.style.display = ''; if (!dismissed()) setTimeout(show, 8000); }
})();
