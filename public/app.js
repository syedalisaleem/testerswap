const view = document.getElementById('view');
const DAY = 86400000;
const NEED = 12;
const DAYS = 14;
let meData = { user: null, app: null };

function setMeta(title, desc) {
  document.title = title;
  document.querySelector('meta[name="description"]').setAttribute('content', desc);
  document.querySelector('meta[property="og:title"]').setAttribute('content', title);
  document.querySelector('meta[property="og:description"]').setAttribute('content', desc);
  document.querySelector('meta[name="twitter:title"]').setAttribute('content', title);
  document.querySelector('meta[name="twitter:description"]').setAttribute('content', desc);
}

function markInvalid(el, bad) {
  if (!el) return;
  el.classList.toggle('invalid', bad);
  el.setAttribute('aria-invalid', String(bad));
  if (bad) el.addEventListener('input', () => markInvalid(el, false), { once: true });
}

/* ---------- helpers ---------- */

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) { toast(e.message, 'err'); }
  };
}

function navigate() {
  const route = (location.hash || '#/').split('?')[0];
  if (route === '#/login') renderLogin();
  else if (route === '#/register') renderRegister();
  else if (route === '#/dashboard') renderDashboard();
  else if (route === '#/browse') renderBrowse();
  else if (route === '#/settings') renderSettings();
  else if (route === '#/contact') renderContact();
  else if (route === '#/social') renderSocial();
  else if (route === '#/feed') renderFeed();
  else if (route === '#/discover') renderDiscover();
  else if (route === '#/privacy') renderLegal('privacy');
  else if (route === '#/terms') renderLegal('terms');
  else if (route === '#/') renderLanding();
  else renderNotFound();
  updateMobileCta(route);
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function updateMobileCta(route) {
  const bar = document.getElementById('mobile-cta');
  const link = document.getElementById('mobile-cta-link');
  if (!bar || !link) return;
  let cfg = null;
  if (route === '#/' && !meData.user) cfg = { href: '#/register', txt: 'Register my app' };
  else if (route === '#/' && meData.user && !meData.app) cfg = { href: '#/dashboard', txt: 'Register my app' };
  else if (route === '#/' && meData.app) cfg = { href: '#/dashboard', txt: 'Go to my test' };
  else if (route === '#/dashboard') cfg = { href: '#/browse', txt: 'Find a swap' };
  else if (route === '#/browse') cfg = { href: '#/dashboard', txt: 'Back to my test' };
  else if (route === '#/feed') cfg = { href: '#/discover', txt: 'Search testers' };
  else if (route === '#/discover') cfg = { href: '#/feed', txt: 'View feed' };
  else if (route === '#/social') cfg = { href: '#/feed', txt: 'View feed' };
  if (cfg) {
    link.href = cfg.href;
    link.textContent = cfg.txt;
    bar.hidden = false;
    document.body.classList.add('has-cta');
  } else {
    bar.hidden = true;
    document.body.classList.remove('has-cta');
  }
}

async function refreshMe() {
  try { meData = await api('/me'); }
  catch { meData = { user: null, app: null }; }
  document.getElementById('nav-user').textContent = meData.user ? meData.user.email : '';
  document.getElementById('btn-logout').hidden = !meData.user;
  const status = document.getElementById('nav-status');
  if (meData.user && meData.app) {
    const a = meData.app;
    const days = a.startTs ? Math.max(0, DAYS - Math.floor((Date.now() - a.startTs) / DAY)) : null;
    const ready = a.optedIn >= NEED && days === 0;
    status.hidden = false;
    status.innerHTML = ready
      ? `eligible · <span class="on">promote</span>`
      : `${a.optedIn}/${NEED} opt-ins${a.startTs ? ` · <span class="on">${days}d left</span>` : ''}`;
  } else {
    status.hidden = true;
  }
  return meData;
}

/* ---------- swap meter (signature) ---------- */

function meterHTML(yours, theirs, opts = {}) {
  const y = Math.min(100, (yours / NEED) * 100);
  const t = Math.min(100, (theirs / NEED) * 100);
  const done = opts.done ? ' done' : '';
  return `
    <div class="meter${done}" role="img" aria-label="${yours} of ${NEED} of your testers opted in, ${theirs} of ${NEED} of theirs">
      <div class="meter-side yours">
        <span class="meter-label">yours</span>
        <div class="meter-track"><div class="meter-fill" style="width:${y}%"></div></div>
        <span class="meter-num">${yours}/${NEED}</span>
      </div>
      <div class="meter-glyph" aria-hidden="true">${done ? '✓' : '⇄'}</div>
      <div class="meter-side theirs">
        <span class="meter-num" style="text-align:left;min-width:40px">${theirs}/${NEED}</span>
        <div class="meter-track"><div class="meter-fill" style="width:${t}%"></div></div>
        <span class="meter-label">theirs</span>
      </div>
    </div>`;
}

function progressBarHTML(count, label) {
  const p = Math.min(100, (count / NEED) * 100);
  return `
    <div class="meter" role="img" aria-label="${label}: ${count} of ${NEED}">
      <div class="meter-side theirs" style="width:100%">
        <span class="meter-label" style="min-width:0;margin-right:9px">${label}</span>
        <div class="meter-track"><div class="meter-fill" style="width:${p}%"></div></div>
        <span class="meter-num">${count}/${NEED}</span>
      </div>
    </div>`;
}

/* ---------- theme ---------- */

const themeBtn = document.getElementById('theme-btn');
const themeMenu = document.getElementById('theme-menu');

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const themeColor = { console: '#f3efe4', terminal: '#0d0f0e', track: '#120d05' }[t] || '#f3efe4';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColor);
  try { localStorage.setItem('ts-theme', t); } catch (e) {}
}

themeBtn.addEventListener('click', () => {
  const open = themeMenu.hidden;
  themeMenu.hidden = !open;
  themeBtn.setAttribute('aria-expanded', String(open));
});
themeMenu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  setTheme(b.dataset.themeVal);
  themeMenu.hidden = true;
  themeBtn.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('click', e => {
  if (!themeMenu.hidden && !themeMenu.contains(e.target) && !themeBtn.contains(e.target)) {
    themeMenu.hidden = true;
    themeBtn.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !themeMenu.hidden) {
    themeMenu.hidden = true;
    themeBtn.setAttribute('aria-expanded', 'false');
  }
});

/* ---------- landing ---------- */

function renderLanding() {
  setMeta('TesterSwap: Trade Android closed-test signups', 'Reach Google Play\'s 12-testers / 14-days closed testing requirement. Trade closed-test signups with other Android devs, real people, mutual testing, zero fakes.');
  view.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">the 12/14 closed-testing gauntlet</p>
          <h1>Twelve real humans. Fourteen long days.<br>One fair <em>swap</em> at a time.</h1>
          <p class="lede">Google Play requires 12 testers opted into your closed test for 14 days before you can ship to production. TesterSwap pairs you with other devs who need the same. You test theirs, they test yours. No fakes, no bots, no paid installs.</p>
          <div class="hero-ctas">
            ${meData.user
              ? `<a href="#/dashboard" class="btn">Go to my test</a><a href="#/browse" class="btn ghost">Browse community</a><span class="mono-sm muted" style="align-self:center">signed in as ${esc(meData.user.email)}</span>`
              : `<a href="#/register" class="btn">Register my app</a><a href="#/login" class="btn ghost">Sign in</a>`}
          </div>
          <div class="social-proof">
            <div class="proof-stat"><span class="proof-num" id="proof-devs">--</span><span class="proof-label">developers</span></div>
            <div class="proof-stat"><span class="proof-num" id="proof-swaps">--</span><span class="proof-label">swaps completed</span></div>
            <div class="proof-stat"><span class="proof-num" id="proof-shipped">--</span><span class="proof-label">shipped to production</span></div>
          </div>
        </div>
        <div class="hero-demo" id="hero-demo">
          <div class="term-head">
            <span class="term-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="term-title mono">SWAP://LIVE</span>
            <span class="live-tag mono"><span class="live-dot" aria-hidden="true"></span>LIVE</span>
          </div>
          <div class="term-body">
            <div class="demo-row">
              <div class="appline"><strong>Habit Forge</strong><span class="mono">com.your.dev.app</span></div>
              <div id="demo-meter-a"></div>
            </div>
            <div class="demo-row">
              <div class="appline"><strong>Weather Buddy</strong><span class="mono">com.their.dev.app</span></div>
              <div id="demo-meter-b"></div>
            </div>
            <div class="demo-result" id="demo-result">Click execute swap. This is the whole loop.</div>
          </div>
          <div class="term-log" id="term-log" aria-hidden="true"></div>
          <div class="term-foot">
            <button class="btn amber" id="demo-swap">⇄ Execute swap</button>
            <span class="term-hint mono">one tester joins each side</span>
          </div>
        </div>
      </div>
      <div class="ticker" aria-hidden="true">
        <div class="ticker-track" id="ticker-track"></div>
      </div>
    </section>

    <div class="wrap">
      <div class="section-head reveal"><h2 data-num="01">How it works</h2><span class="mono-sm muted">a real sequence, in order</span></div>
      <div class="steps reveal">
        <div class="step"><h3>Set up</h3><p>Create your closed test in Play Console and paste the invite link into your profile.</p></div>
        <div class="step"><h3>Swap</h3><p>Browse the community and offer a test-for-test trade. You join theirs, they join yours.</p></div>
        <div class="step"><h3>Track</h3><p>Mark every opt-in as it lands. The 14-day clock starts the moment you reach 12.</p></div>
        <div class="step"><h3>Ship</h3><p>Watch the gates go green, then promote to production. That's it.</p></div>
      </div>

      <div class="rules-grid reveal">
        <div class="card">
          <h3>What Play actually requires</h3>
          <ul class="rule-list">
            <li><span class="mk">✓</span> A closed test track created in Play Console</li>
            <li><span class="mk">✓</span> An invite link shared with your testers</li>
            <li><span class="mk">✓</span> 12 testers opted in with their own Google accounts</li>
            <li><span class="mk">✓</span> 14 consecutive days of testing after the 12th opt-in</li>
            <li><span class="mk">✓</span> A release that passes Google's review</li>
          </ul>
        </div>
        <div class="golden">
          <h3>The golden rule</h3>
          <p>Only trade with humans who will actually join and stay opted in for the full 14 days. Google detects coordinated fake opt-ins, and a burned account is worth nothing.</p>
        </div>
      </div>
    </div>`;

  const a = { n: 4 }, b = { n: 3 };
  const draw = () => {
    const elA = document.getElementById('demo-meter-a');
    const elB = document.getElementById('demo-meter-b');
    elA.innerHTML = meterHTML(a.n, b.n);
    elB.innerHTML = meterHTML(b.n, a.n);
    const res = document.getElementById('demo-result');
    if (a.n >= NEED && b.n >= NEED) {
      res.textContent = 'Both sides at 12. The 14-day clock starts for everyone. That\'s the deal.';
    } else if (a.n >= NEED) {
      res.textContent = 'You\'re at 12. Now keep testing theirs so they reach it too.';
    } else {
      res.textContent = 'Click execute swap. This is the whole loop.';
    }
  };
  draw();
  document.getElementById('demo-swap').addEventListener('click', () => {
    a.n = Math.min(NEED, a.n + 1);
    b.n = Math.min(NEED, b.n + 1);
    draw();
    logFeed('swap executed', 'yours ⇄ theirs');
    if (a.n >= NEED && b.n >= NEED) document.getElementById('demo-swap').disabled = true;
  });

  // live terminal feed
  const log = document.getElementById('term-log');
  const logEvents = [
    ['@mira_dev', 'opted in · Habit Forge'],
    ['Habit Forge', '⇄ matched · Weather Buddy'],
    ['quota', '12/12 both sides'],
    ['@jose.flores', 'opted in · Weather Buddy'],
    ['clock', '14-day timer armed'],
    ['review', 'release gate passed'],
    ['Habit Forge', '→ production']
  ];
  let li = 0;
  const logFeed = (what, detail) => {
    if (!log) return;
    const now = new Date().toTimeString().slice(0, 8);
    const row = document.createElement('div');
    row.className = 'log-line';
    row.innerHTML = `<span class="log-ts">${now}</span><span class="log-txt">${esc(what)} ${detail ? '<span class="log-arrow">' + esc(detail) + '</span>' : ''}</span>`;
    log.prepend(row);
    while (log.children.length > 5) log.removeChild(log.lastChild);
  };
  if (window._termIv) clearInterval(window._termIv);
  window._termIv = setInterval(() => {
    const ev = logEvents[li % logEvents.length];
    logFeed(ev[0], ev[1]);
    li++;
  }, 2600);

  // ticker tape
  const tickerTrack = document.getElementById('ticker-track');
  if (tickerTrack) {
    const pairs = [
      ['Habit Forge', 'Weather Buddy'], ['TaskFlow', 'Pocket Notes'],
      ['Trail Runner', 'Grocery Pal'], ['Focus Timer', 'Meal Plan Pro'],
      ['Ledger Lite', 'Habit Forge'], ['Weather Buddy', 'Trail Runner'],
      ['Brew Log', 'TaskFlow'], ['Pocket Notes', 'Focus Timer'],
      ['Grocery Pal', 'Ledger Lite'], ['Meal Plan Pro', 'Brew Log']
    ];
    const times = ['now', '1m', '3m', '6m', '12m', '24m', '41m', '1h', '2h', '3h'];
    const chips = pairs.map((p, i) =>
      `<span class="tick-item"><b class="tick-a">${p[0]}</b><span class="tick-arrow">⇄</span><b class="tick-b">${p[1]}</b><span class="tick-time">${times[i % times.length]}</span></span>`);
    tickerTrack.innerHTML = chips.join('') + chips.join(''); // duplicated for seamless loop
  }

  // count-up social proof
  const countUp = (el, target) => {
    if (!el || el.dataset.counted) return;
    el.dataset.counted = '1';
    const dur = 900, t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Social proof stats
  api('/social/stats').then(s => {
    countUp(document.getElementById('proof-devs'), s.totalDevs || 0);
    countUp(document.getElementById('proof-swaps'), s.completedSwaps || 0);
    countUp(document.getElementById('proof-shipped'), s.shippedApps || 0);
  }).catch(() => {
    const d = document.getElementById('proof-devs');
    if (d) d.textContent = '0';
  });

  // scroll reveal
  if (!window._revealIo) {
    window._revealIo = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); window._revealIo.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
  }
  document.querySelectorAll('.reveal').forEach(el => window._revealIo.observe(el));
}

/* ---------- auth ---------- */

function renderAuth(title, submitText, action) {
  setMeta(action === '/register' ? 'Create account: TesterSwap' : 'Sign in: TesterSwap', action === '/register' ? 'Join TesterSwap to trade closed-test signups with other Android devs.' : 'Sign in to your TesterSwap account.');
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="card auth-card">
        <p class="eyebrow">${action === '/register' ? 'join the desk' : 'welcome back'}</p>
        <h1>${title}</h1>
        <p class="sub small">${action === '/register' ? 'Free forever. Devs see only your email and app info.' : 'Your swap wall is waiting.'}</p>
        <div id="err" class="inline-err" role="alert"></div>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="${action === '/register' ? 'new-password' : 'current-password'}" placeholder="${action === '/register' ? '8+ characters' : 'Your password'}">
        <button class="btn" id="submit">${submitText}</button>
      </div>
      <div class="auth-note small muted">
        ${action === '/register'
          ? 'Already swapped before? <a href="#/login" style="color:var(--yours)">Sign in</a>.'
          : 'New to the desk? <a href="#/register" style="color:var(--yours)">Create an account</a>.'}
      </div>
    </div>`;
  const submit = async () => {
    const err = document.getElementById('err');
    err.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    markInvalid(document.getElementById('email'), !email || !String(email).includes('@'));
    markInvalid(document.getElementById('password'), !password);
    if (!email || !password) return err.textContent = 'Email and password are both required.';
    if (!String(email).includes('@')) return err.textContent = 'That doesn\'t look like an email address.';
    if (action === '/register' && password.length < 8) {
      markInvalid(document.getElementById('password'), true);
      return err.textContent = 'Password needs at least 8 characters.';
    }
    try {
      await api(action, 'POST', { email, password });
      toast(action === '/register' ? 'Account created.' : 'Signed in.');
      location.hash = '#/dashboard';
      navigate();
    } catch (e) { err.textContent = e.message; }
  };
  document.getElementById('submit').addEventListener('click', submit);
  document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

function renderLogin() { renderAuth('Sign in', 'Sign in', '/login'); }
function renderRegister() { renderAuth('Create your account', 'Create account', '/register'); }

/* ---------- dashboard ---------- */

function clockHTML(ts) {
  const diff = ts ? Math.max(0, ts + DAY * DAY - Date.now()) : 0;
  const d = Math.floor(diff / DAY);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  const p = n => String(n).padStart(2, '0');
  return `<span class="clock">${p(d)}<span class="sep">:</span>${p(h)}<span class="sep">:</span>${p(m)}<span class="sep">:</span>${p(s)}</span>`;
}

async function renderDashboard() {
  await refreshMe();
  if (!meData.user) { location.hash = '#/login'; return renderLogin(); }
  view.innerHTML = `<div class="spinner">Loading your ledger</div>`;
  await refreshMe();
  const app = meData.app;
  setMeta('My test: TesterSwap', 'Track your opt-ins, the 14-day countdown and every requirement on the way to production.');

  if (!app) {
    view.innerHTML = `
      <div class="onboard">
        <p class="eyebrow">step 1 of 2</p>
        <h1>Register your app</h1>
        <p class="sub" style="margin-bottom:22px">Two things to do before you can trade.</p>
        <div class="step"><h3>Create the closed test</h3>
          <p>In Play Console: <span class="mono-sm">Release → Testing → Closed testing</span>, create a track, upload a build, add testers via email or invite link, and copy the invite URL.</p>
          <div class="play-console-guide">
            <p class="mono-sm muted" style="margin:8px 0 4px">Quick guide for Play Console:</p>
            <ol style="padding-left:18px;font-size:0.85rem;color:var(--muted)">
              <li>Go to <span class="mono-sm">play.google.com/console</span></li>
              <li>Select your app → <span class="mono-sm">Release → Testing → Closed testing</span></li>
              <li>Click <span class="mono-sm">Create closed testing track</span></li>
              <li>Upload your AAB/APK build</li>
              <li>Under "Testers", choose <span class="mono-sm">Email lists</span> or <span class="mono-sm">Opt-in URL</span></li>
              <li>Copy the invite link (looks like <span class="mono-sm">https://play.google.com/apps/testing/...</span>)</li>
            </ol>
            <p class="small muted" style="margin-top:8px">Need help? Google's guide: <a href="https://support.google.com/googleplay/android-developer/answer/9859673" target="_blank" rel="noopener" style="color:var(--yours)">Set up closed testing</a></p>
          </div>
        </div>
        <div class="card">
          <div id="err" class="inline-err" role="alert"></div>
          <label for="appName">App name</label>
          <input id="appName" placeholder="My Cool App">
          <label for="packageName">Package name</label>
          <input id="packageName" placeholder="com.example.app">
          <label for="inviteLink">Closed test invite link</label>
          <input id="inviteLink" placeholder="https://play.google.com/apps/testing/...">
          <label for="description">What's your app about? (optional)</label>
          <input id="description" placeholder="One line for the community">
          <label for="appCategory">Category (helps find the right swap partners)</label>
          <select id="appCategory" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg)">
            <option value="productivity">Productivity</option>
            <option value="social">Social</option>
            <option value="games">Games</option>
            <option value="health">Health & Fitness</option>
            <option value="finance">Finance</option>
            <option value="education">Education</option>
            <option value="entertainment">Entertainment</option>
            <option value="utilities">Utilities</option>
            <option value="other" selected>Other</option>
          </select>
          <button class="btn" id="save" style="width:100%">Save app</button>
        </div>
      </div>`;
    document.getElementById('save').addEventListener('click', safe(async () => {
      const err = document.getElementById('err');
      const name = document.getElementById('appName').value.trim();
      const pkg = document.getElementById('packageName').value.trim();
      const link = document.getElementById('inviteLink').value.trim();
      markInvalid(document.getElementById('appName'), !name);
      markInvalid(document.getElementById('packageName'), !pkg);
      markInvalid(document.getElementById('inviteLink'), !link || !link.startsWith('http'));
      if (!name || !pkg || !link) return err.textContent = 'App name, package name and invite link are all required.';
      if (!link.startsWith('http')) return err.textContent = 'Invite link must start with https://';
      await api('/app', 'PUT', {
        appName: name,
        packageName: pkg,
        inviteLink: link,
        description: document.getElementById('description').value.trim()
      });
      const cat = document.getElementById('appCategory').value;
      await api('/category', 'PUT', { category: cat }).catch(() => {});
      toast('App registered.');
      renderDashboard();
    }));
    return;
  }

  const opted = app.optedIn;
  const started = !!app.startTs;
  const elapsed = started ? Math.floor((Date.now() - app.startTs) / DAY) : 0;
  const daysLeft = started ? Math.max(0, DAYS - elapsed) : null;
  const eligible = opted >= NEED && started && daysLeft === 0;
  const gates = [
    { key: 'create_test', txt: 'Closed test created in Play Console', val: app.checklist.created_test ? 'done' : 'manual', clickable: true, done: !!app.checklist.created_test },
    { key: 'invite_link', txt: 'Invite link added to your profile', val: 'auto', done: true },
    { key: 'testers', txt: `${NEED} testers opted in`, val: `${opted}/${NEED}`, done: opted >= NEED },
    { key: 'days', txt: `${DAYS} days of testing`, val: started ? `${Math.min(DAYS, elapsed)}/${DAYS}d` : 'starts at 12', done: started && daysLeft === 0 },
    { key: 'review', txt: 'Release passed Play review', val: app.checklist.review_passed ? 'done' : 'manual', clickable: true, done: !!app.checklist.review_passed }
  ];
  const doneCount = gates.filter(g => g.done).length;

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(app.appName)}</h1>
        <p class="mono-pkg">${esc(app.packageName)} · started ${app.startDate || 'not started'}</p>
      </div>
      <div class="actions">
        <a class="btn small ghost" href="#/browse">Find a swap</a>
        <a class="btn small" href="#/settings">Draft messages</a>
      </div>
    </div>

    ${started && opted < NEED ? `
    <div class="buffer-alert">
      <strong>⚠️ Buffer alert:</strong> You have ${opted} opt-ins but need ${NEED}. ${NEED - opted} tester${NEED - opted === 1 ? '' : 's'} dropped out or haven't joined yet. <a href="#/browse" style="color:var(--yours)">Find replacements →</a>
    </div>` : ''}

    <div class="ledger-grid">
      <div class="led-box yours">
        <div class="lbl">your opt-ins</div>
        <div class="big yours">${opted}<span style="font-size:1rem;color:var(--muted)">/${NEED}</span></div>
        <div class="note2">${NEED - opted > 0 ? `${NEED - opted} more to start the clock` : 'clock running'}</div>
      </div>
      <div class="led-box">
        <div class="lbl">14-day clock</div>
        <div class="big" id="clock-box">${started ? clockHTML(app.startTs) : '00:00:00:00'}</div>
        <div class="note2">${started ? (eligible ? 'testing complete, promote' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`) : 'starts at 12 opt-ins'}</div>
      </div>
      <div class="led-box theirs">
        <div class="lbl">you're testing for</div>
        <div class="big theirs" id="trades-count">0</div>
        <div class="note2">devs waiting on your opt-in</div>
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <h3>Release gates <span class="badge ${doneCount === gates.length ? 'yours' : 'gray'}">${doneCount}/${gates.length}</span></h3>
      <ul class="gate-list">
        ${gates.map(g => `
          <li class="${g.done ? 'done' : ''} ${g.clickable ? 'gate-clickable' : ''}" data-key="${g.key}">
            <span class="gate-ck">${g.done ? '✓' : ''}</span>
            <span class="gate-txt">${g.txt}</span>
            <span class="gate-val">${g.val}</span>
          </li>`).join('')}
      </ul>
      <div class="gate-progress"><i style="width:${(doneCount / gates.length) * 100}%"></i></div>
      ${!started && opted < NEED
        ? `<p class="note-line">Reach ${NEED} opt-ins and the 14-day clock starts automatically. Until then, swap in the community to fill the gap.</p>`
        : eligible
        ? `<p class="note-line" style="color:var(--yours);font-weight:600">All gates green. Promote this release to production.</p>`
        : ''}
    </div>

    <div class="split">
      <div class="card">
        <h3>Your testers <span class="badge gray">${app.testers.length}</span></h3>
        <div id="tester-list"></div>
        <div class="add-line">
          <div><label for="tName">Name</label><input id="tName" placeholder="Alex"></div>
          <div><label for="tEmail">Email</label><input id="tEmail" placeholder="alex@example.com"></div>
          <button class="btn" id="addTester">Add tester</button>
        </div>
        <p class="note-line">When someone accepts your invite link, mark them opted in. The clock starts automatically at 12.</p>
      </div>

      <div class="card">
        <h3>Swap wall <span class="badge gray" id="wall-count">0 open</span></h3>
        <div id="trades"></div>
        <p class="note-line"><a href="#/browse" style="color:var(--yours)">Browse the community →</a> to offer new swaps.</p>
      </div>
    </div>

    ${started ? `
    <div class="card" style="margin-top:18px">
      <h3>Engagement tracker <span class="badge ${app.optedIn >= NEED ? 'yours' : 'gray'}">active</span></h3>
      <p class="small muted" style="margin-bottom:12px">Daily check-ins show who's still engaged. Stale testers (no check-in for 2+ days) risk your 14-day streak.</p>
      <div id="checkin-list"></div>
      <div class="checkin-actions" style="margin-top:12px">
        <button class="btn small" id="checkinAll">Check in all testers</button>
        <button class="btn ghost small" id="viewReport">View compliance report</button>
      </div>
    </div>` : ''}

    <div class="card" style="margin-top:18px">
      <h3>Invite link</h3>
      <div class="copy-line">
        <input id="inviteUrl" value="${esc(app.inviteLink)}" readonly aria-label="Your invite link">
        <button class="btn ghost small" id="copyLink">Copy</button>
        <button class="btn small" id="shareLink">Copy share line</button>
      </div>
      <p class="note-line">Post it in dev Discords, r/AndroidClosedTesting and r/androiddev, and offer swaps here so it flows both ways.</p>
    </div>`;

  if (started && !eligible) {
    const tick = () => {
      const box = document.getElementById('clock-box');
      if (box) box.innerHTML = clockHTML(app.startTs);
    };
    tick();
    const t = setInterval(tick, 1000);
    window.__tsClock = t;
  }

  const tlist = document.getElementById('tester-list');
  const renderTesters = () => {
    tlist.innerHTML = app.testers.map(t => `
      <div class="ledger-row">
        <span class="tname">${esc(t.name)}</span>
        <span class="tmail">${esc(t.email)}</span>
        <span><span class="badge ${t.status === 'opted_in' ? 'yours' : 'gray'}">${t.status === 'opted_in' ? 'opted in' : 'invited'}</span></span>
        <span class="acts">
          ${t.status === 'invited'
            ? `<button class="btn small" data-optin="${t.id}">Opted in</button>`
            : `<button class="btn ghost small" data-unopt="${t.id}">Undo</button>`}
          <button class="btn bad small" data-del="${t.id}" aria-label="Remove ${esc(t.name)}">✕</button>
        </span>
      </div>`).join('') ||
      `<div class="empty"><strong>No testers yet</strong>Everyone who joins your test should be logged here. Start with people you know, then fill the rest with swaps.<a href="#/browse" class="btn small">Find testers</a></div>`;
    tlist.querySelectorAll('[data-optin]').forEach(b => b.addEventListener('click', safe(async () => {
      await api('/testers/' + b.dataset.optin, 'PATCH', { status: 'opted_in' });
      renderDashboard();
    })));
    tlist.querySelectorAll('[data-unopt]').forEach(b => b.addEventListener('click', safe(async () => {
      await api('/testers/' + b.dataset.unopt, 'PATCH', { status: 'invited' });
      renderDashboard();
    })));
    tlist.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', safe(async () => {
      await api('/testers/' + b.dataset.del, 'DELETE');
      toast('Tester removed.');
      renderDashboard();
    })));
  };
  renderTesters();

  const addTester = safe(async () => {
    const name = document.getElementById('tName').value.trim();
    const email = document.getElementById('tEmail').value.trim();
    if (!name || !email) return toast('Name and email are both required.', 'err');
    await api('/testers', 'POST', { name, email });
    document.getElementById('tName').value = '';
    document.getElementById('tEmail').value = '';
    toast('Tester added.');
    renderDashboard();
  });
  document.getElementById('addTester').addEventListener('click', addTester);
  document.getElementById('tEmail').addEventListener('keydown', e => { if (e.key === 'Enter') addTester(); });

  document.getElementById('copyLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText(app.inviteLink);
    toast('Invite link copied.');
  });
  document.getElementById('shareLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText(`Join my Android closed test! ${app.inviteLink}`);
    toast('Share line copied.');
  });

  view.querySelectorAll('.gate-list li.gate-clickable').forEach(li => {
    li.addEventListener('click', safe(async () => {
      const key = li.dataset.key;
      const done = !li.classList.contains('done');
      await api('/checklist', 'PATCH', { key, done });
      renderDashboard();
    }));
  });

  // Check-in list
  const checkinList = document.getElementById('checkin-list');
  if (checkinList && started) {
    try {
      const checkinData = await api('/checkins/' + app.id);
      if (checkinData.testers.length) {
        checkinList.innerHTML = checkinData.testers.map(t => `
          <div class="checkin-row ${t.isStale ? 'stale' : ''}">
            <span class="tname">${esc(t.name)}</span>
            <span class="checkin-bar"><span style="width:${Math.round(t.score * 100)}%"></span></span>
            <span class="checkin-num">${t.daysChecked}/${Math.min(checkinData.elapsed, DAYS)}d</span>
            ${t.isStale ? '<span class="badge bad">stale</span>' : '<span class="badge yours">active</span>'}
          </div>`).join('');
      } else {
        checkinList.innerHTML = '<p class="small muted">No check-ins recorded yet. Use "Check in all testers" to track daily engagement.</p>';
      }
    } catch { checkinList.innerHTML = ''; }

    document.getElementById('checkinAll')?.addEventListener('click', safe(async () => {
      const checkinData = await api('/checkins/' + app.id);
      for (const t of checkinData.testers) {
        await api('/checkins', 'POST', { testerId: t.id, appId: app.id }).catch(() => {});
      }
      toast('Check-ins recorded.');
      renderDashboard();
    }));

    document.getElementById('viewReport')?.addEventListener('click', safe(async () => {
      const report = await api('/report/' + app.id);
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal card" style="max-width:700px">
          <div class="modal-head">
            <h2>Compliance Report</h2>
            <button class="btn ghost small" onclick="this.closest('.modal-overlay').remove()">✕</button>
          </div>
          <div class="modal-body">
            <p class="mono-sm muted">Generated: ${report.summary.eligibleForProduction ? 'READY FOR PRODUCTION' : `${report.summary.elapsedDays}/${DAYS} days elapsed`}</p>
            <div class="report-grid">
              <div class="report-stat"><span class="report-num">${report.summary.optedIn}</span><span>opted in</span></div>
              <div class="report-stat"><span class="report-num">${report.summary.elapsedDays}/${DAYS}</span><span>days</span></div>
              <div class="report-stat"><span class="report-num">${report.completedSwaps}</span><span>swaps</span></div>
              <div class="report-stat"><span class="report-num">${report.summary.eligibleForProduction ? '✓' : '—'}</span><span>eligible</span></div>
            </div>
            <h3 style="margin:18px 0 8px">Tester breakdown</h3>
            <div class="report-testers">
              ${report.testers.map(t => `
                <div class="report-tester">
                  <span>${esc(t.name)}</span>
                  <span class="mono-sm">${Math.round(t.checkinRate * 100)}% check-in</span>
                  <span class="mono-sm">${t.checkins.length} check-ins</span>
                </div>`).join('')}
            </div>
            <h3 style="margin:18px 0 8px">Questionnaire hints</h3>
            <ul class="report-hints">${report.questionnaireHints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
            <button class="btn small" id="copyReport">Copy report</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      document.getElementById('copyReport')?.addEventListener('click', async () => {
        const text = `TesterSwap Compliance Report\nApp: ${report.appName} (${report.packageName})\nStarted: ${report.testStarted}\nTesters: ${report.summary.optedIn}/${report.summary.requiredTesters}\nDays: ${report.summary.elapsedDays}/${report.summary.requiredDays}\nEligible: ${report.summary.eligibleForProduction}\n\nTester breakdown:\n${report.testers.map(t => `- ${t.name}: ${Math.round(t.checkinRate * 100)}% check-in rate`).join('\n')}\n\nQuestionnaire:\n${report.questionnaireHints.join('\n')}`;
        await navigator.clipboard.writeText(text);
        toast('Report copied.');
      });
    }));
  }

  const trades = await api('/trades');
  const tradesEl = document.getElementById('trades');
  const wallCount = document.getElementById('wall-count');
  const tcount = document.getElementById('trades-count');
  const pendingOut = trades.outgoing.filter(t => t.status !== 'joined').length;
  wallCount.textContent = `${trades.outgoing.length + trades.incoming.length} open`;
  tcount.textContent = String(trades.outgoing.filter(t => t.status !== 'joined').length);
  tradesEl.innerHTML = `
    <p class="mono-sm muted" style="margin-bottom:6px">YOU TEST THEIRS</p>
    ${trades.outgoing.map(t => `
      <div class="trade-row">
        <div class="tline">
          <strong>${esc(t.app_name)}</strong>
          <span class="badge ${t.status === 'joined' ? 'yours' : 'theirs'}">${t.status === 'joined' ? 'you joined ✓' : 'open'}</span>
        </div>
        <div class="tline"><span class="mono">${esc(t.package_name)}</span></div>
        <div class="acts">
          <a class="btn small" target="_blank" rel="noopener" href="${esc(t.invite_link)}">Open invite</a>
          ${t.status === 'pending'
            ? `<button class="btn small amber" data-joined="${t.id}">I joined</button>`
            : ''}
        </div>
      </div>`).join('') || `<div class="empty"><strong>Nothing to test yet</strong>Offer a swap and pay it forward.</div>`}
    <p class="mono-sm muted" style="margin:14px 0 6px">THEY TEST YOURS</p>
    ${trades.incoming.map(t => `
      <div class="trade-row">
        <div class="tline">
          <strong>${esc(t.app_name)}</strong>
          <span class="badge ${t.status === 'confirmed' ? 'yours' : t.status === 'joined' ? 'theirs' : 'gray'}">${t.status === 'confirmed' ? 'confirmed ✓' : t.status === 'joined' ? 'they joined, confirm' : 'pending'}</span>
        </div>
        <div class="tline"><span class="mono">${esc(t.package_name)}</span></div>
        ${t.status === 'joined'
          ? `<button class="btn small" data-confirm="${t.id}">Confirm their opt-in</button>`
          : ''}
      </div>`).join('') || `<div class="empty"><strong>No one testing yours yet</strong>Offer swaps in the community.</div>`}`;
  tradesEl.querySelectorAll('[data-joined]').forEach(b => b.addEventListener('click', safe(async () => {
    await api('/trades/' + b.dataset.joined, 'PATCH', { status: 'joined' });
    toast('Marked joined. Nice. Keep it installed for the full 14 days.');
    renderDashboard();
  })));
  tradesEl.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', safe(async () => {
    await api('/trades/' + b.dataset.confirm, 'PATCH', { status: 'confirmed' });
    toast('Confirmed. Their opt-in counts toward your 12.');
    renderDashboard();
  })));
}

/* ---------- community ---------- */

function renderDevCard(d, devs) {
  const meApp = meData.app;
  const trade = d.trade;
  let action = '';
  if (!meApp) {
    action = `<a href="#/dashboard" class="btn ghost small">Register your app first</a>`;
  } else if (trade) {
    if (trade.status === 'joined') action = `<span class="badge yours">you're testing theirs ✓</span>`;
    else if (trade.status === 'confirmed') action = `<span class="badge yours">swap complete ✓</span>`;
    else action = `<button class="btn small amber" data-joined="${trade.id}">Mark joined</button>`;
  } else {
    action = `<button class="btn ghost small" data-offer="${d.id}">Offer a swap</button>`;
  }
  return `
    <div class="dev-card" data-dev-id="${d.id}" data-category="${esc(d.category || 'other')}">
      <div class="dname">
        <h3>${esc(d.appName)}</h3>
        ${d.optedIn >= 12 ? '<span class="badge yours">12/12</span>' : `<span class="badge ${d.optedIn >= 6 ? 'theirs' : 'gray'}">${d.optedIn}/${NEED}</span>`}
      </div>
      <span class="pkg">${esc(d.packageName)}</span>
      ${d.description ? `<p class="ddesc">${esc(d.description)}</p>` : ''}
      ${progressBarHTML(d.optedIn, 'their test')}
      <div class="dmeta">
        ${d.startDate ? '<span class="badge gray">clock running</span>' : ''}
        <span class="mono-sm muted">${esc(d.ownerEmail)}</span>
        <span class="rep-badges"></span>
      </div>
      <div class="dacts">
        <a class="btn small" target="_blank" rel="noopener" href="${esc(d.inviteLink)}">Open invite</a>
        ${action}
      </div>
    </div>`;
}

async function renderBrowse() {
  await refreshMe();
  if (!meData.user) { location.hash = '#/login'; return renderLogin(); }
  setMeta('Community: TesterSwap', 'Browse other Android devs looking to trade closed-test signups. Offer a test-for-test swap.');
  view.innerHTML = `<div class="spinner">Loading the community</div>`;
  const [devs, matches] = await Promise.all([api('/devs'), api('/matches').catch(() => null)]);
  if (!devs.length) {
    view.innerHTML = `
      <h1>Community</h1>
      <p class="sub" style="margin-bottom:20px">Devs looking to trade testers.</p>
      <div class="empty"><strong>You're the first on the desk</strong>Register your app and you'll be listed here for others to swap with.<a href="#/dashboard" class="btn small">Register my app</a></div>`;
    return;
  }
  const meApp = meData.app;
      view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Community</h1>
        <p class="sub">Offer a swap: you join their closed test, they join yours. ${devs.length} dev${devs.length === 1 ? '' : 's'} looking for testers.</p>
      </div>
    </div>
    <div class="card" style="border-color:color-mix(in srgb, var(--theirs) 40%, var(--border))">
      <h3 style="color:var(--theirs)">The golden rule</h3>
      <p class="small muted">Only claim a swap if you'll really join and stay opted in for the full 14 days. The desk runs on karma.</p>
    </div>
    ${matches && matches.sameCategory.length ? `
    <div class="card" style="border-color:color-mix(in srgb, var(--yours) 40%, var(--border))">
      <h3 style="color:var(--yours)">Recommended for you</h3>
      <p class="small muted" style="margin-bottom:12px">Same category (${esc(matches.myCategory)}) — swap partners who build similar apps.</p>
      <div class="devs-grid">
        ${matches.sameCategory.map(d => renderDevCard(d, devs)).join('')}
      </div>
    </div>` : ''}

    <div class="category-filter" id="catFilter">
      <button class="btn small ghost active" data-cat="all">All</button>
      <button class="btn small ghost" data-cat="productivity">Productivity</button>
      <button class="btn small ghost" data-cat="social">Social</button>
      <button class="btn small ghost" data-cat="games">Games</button>
      <button class="btn small ghost" data-cat="health">Health</button>
      <button class="btn small ghost" data-cat="education">Education</button>
      <button class="btn small ghost" data-cat="utilities">Utilities</button>
      <button class="btn small ghost" data-cat="other">Other</button>
    </div>
    <div class="devs-grid">
      ${devs.map(d => renderDevCard(d, devs)).join('')}
    </div>`;
  view.querySelectorAll('[data-offer]').forEach(b => b.addEventListener('click', safe(async () => {
    await api('/trades', 'POST', { appId: b.dataset.offer });
    toast('Swap offered. Now join their test and mark it.');
    renderBrowse();
  })));
  view.querySelectorAll('[data-joined]').forEach(b => b.addEventListener('click', safe(async () => {
    await api('/trades/' + b.dataset.joined, 'PATCH', { status: 'joined' });
    toast('Marked joined. They can now confirm your opt-in.');
    renderBrowse();
  })));

  // Category filter
  view.querySelectorAll('#catFilter button').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('#catFilter button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      view.querySelectorAll('.dev-card').forEach(card => {
        card.style.display = (cat === 'all' || card.dataset.category === cat) ? '' : 'none';
      });
    });
  });

  // Load reputation for each dev
  devs.forEach(async d => {
    try {
      const rep = await api('/reputation/' + d.ownerUserId);
      const badgeEl = document.querySelector(`.dev-card[data-dev-id="${d.id}"] .rep-badges`);
      if (badgeEl && rep.badges.length) {
        badgeEl.innerHTML = rep.badges.map(b => `<span class="badge yours" title="${b.label}">${b.icon}</span>`).join('');
      }
    } catch {}
  });
}

/* ---------- settings ---------- */

async function renderSettings() {
  await refreshMe();
  if (!meData.user) { location.hash = '#/login'; return renderLogin(); }
  setMeta('Settings: TesterSwap', 'Themes, AI draft helper and your API key.');
  const s = meData.app?.settings || {};
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Settings</h1>
        <p class="sub">Theme, AI drafts, and your API key.</p>
      </div>
    </div>
    <div class="set-grid">
      <div class="card">
        <h3>Theme</h3>
        <p class="small muted" style="margin-bottom:14px">Your pick is saved to this browser. Three moods, one data voice.</p>
        <div style="display:flex;flex-direction:column;gap:9px">
          ${['console', 'terminal', 'track'].map(t => `
            <button class="btn ghost" style="justify-content:space-between" data-theme-set="${t}">
              <span>${t === 'console' ? 'Console' : t === 'terminal' ? 'Terminal' : 'Test track'}</span>
              <span class="mono-sm muted">${t === 'console' ? 'light' : t === 'terminal' ? 'dark' : 'amber'}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3>AI draft helper</h3>
        <p class="small muted" style="margin-bottom:14px">Paste an OpenAI-compatible API key (OpenAI, Groq, OpenRouter, DeepSeek…) to draft reminder messages for testers and posts to recruit real ones.</p>

        <div class="trust-box">
          <div class="trust-row"><span class="trust-icon">🔒</span><span>Your key stays on this server only. We never send it to any third party.</span></div>
          <div class="trust-row"><span class="trust-icon">🧹</span><span>Used only to call the AI API you configure. Nothing else.</span></div>
          <div class="trust-row"><span class="trust-icon">💡</span><span>Tip: create a restricted key with spending limits at your provider.</span></div>
        </div>

        <label for="aiKey">API key</label>
        <input id="aiKey" type="password" autocomplete="off" placeholder="sk-..." value="">
        <div class="row">
          <div><label for="aiModel">Model</label><input id="aiModel" placeholder="gpt-4o-mini" value="${esc(s.ai_model || 'gpt-4o-mini')}"></div>
          <div><label for="aiBase">Base URL</label><input id="aiBase" placeholder="https://api.openai.com/v1" value="${esc(s.ai_base_url || 'https://api.openai.com/v1')}"></div>
        </div>
        <div id="err" class="inline-err" role="status"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="save">Save changes</button>
          <button class="btn ghost" id="testKey" type="button">Test connection</button>
        </div>
        <p class="note-line" id="test-result"></p>
        <hr class="divider">
        <div class="draft-btns">
          <button class="btn ghost small" id="dRemind">Reminder</button>
          <button class="btn ghost small" id="dNudge">Keep-tested nudge</button>
          <button class="btn ghost small" id="dPost">Recruit post</button>
        </div>
        <div id="draft-out"><div class="empty"><strong>No draft yet</strong>Pick a type above, the draft appears here.</div></div>
      </div>
    </div>`;

  view.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));

  document.getElementById('save').addEventListener('click', safe(async () => {
    await api('/settings', 'PUT', {
      aiApiKey: document.getElementById('aiKey').value.trim(),
      aiModel: document.getElementById('aiModel').value.trim(),
      aiBaseUrl: document.getElementById('aiBase').value.trim()
    });
    const err = document.getElementById('err');
    err.classList.remove('inline-err');
    err.classList.add('inline-ok');
    err.textContent = 'Saved.';
    toast('Settings saved.');
  }));

  document.getElementById('testKey').addEventListener('click', safe(async () => {
    const result = document.getElementById('test-result');
    const key = document.getElementById('aiKey').value.trim();
    const model = document.getElementById('aiModel').value.trim();
    const base = document.getElementById('aiBase').value.trim();
    if (!key) { result.innerHTML = '<span style="color:var(--bad)">Enter a key first.</span>'; return; }
    result.innerHTML = '<span class="muted">Testing…</span>';
    try {
      await api('/settings', 'PUT', { aiApiKey: key, aiModel: model, aiBaseUrl: base });
      const { text } = await api('/draft', 'POST', { kind: 'reminder' });
      if (text && text.length > 20) {
        result.innerHTML = '<span style="color:var(--yours)">✓ Connection works. Key is valid.</span>';
      } else {
        result.innerHTML = '<span style="color:var(--theirs)">⚠ Connected but got an unexpected response. Check your model name.</span>';
      }
    } catch (e) {
      result.innerHTML = `<span style="color:var(--bad)">✕ ${esc(e.message)}</span>`;
    }
  }));

  const runDraft = safe(async (kind) => {
    const out = document.getElementById('draft-out');
    out.innerHTML = `<div class="spinner">Drafting</div>`;
    const { text } = await api('/draft', 'POST', { kind });
    out.innerHTML = `<pre class="ai-draft" id="draft-text">${esc(text)}</pre>
      <button class="btn small" id="draft-copy">Copy</button>`;
    document.getElementById('draft-copy').addEventListener('click', async () => {
      await navigator.clipboard.writeText(document.getElementById('draft-text').textContent);
      toast('Draft copied.');
    });
  });
  document.getElementById('dRemind').addEventListener('click', () => runDraft('reminder'));
  document.getElementById('dNudge').addEventListener('click', () => runDraft('nudge'));
  document.getElementById('dPost').addEventListener('click', () => runDraft('post'));
}

/* ---------- social connections ---------- */

async function renderSocial() {
  await refreshMe();
  if (!meData.user) { location.hash = '#/login'; return renderLogin(); }
  setMeta('Social: TesterSwap', 'Connect Reddit and Discord to recruit testers and discover opportunities.');
  view.innerHTML = `<div class="spinner">Loading social connections</div>`;

  const [redditStatus, discordStatus] = await Promise.all([
    api('/social/reddit/status').catch(() => ({ connected: false })),
    api('/social/discord/status').catch(() => ({ connected: false }))
  ]);

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Social Connections</h1>
        <p class="sub">Connect platforms to recruit testers and discover swap opportunities.</p>
      </div>
    </div>
    <div class="set-grid">
      <div class="card">
        <h3>Reddit</h3>
        <p class="small muted" style="margin-bottom:14px">Connect your Reddit account to post recruit messages in r/AndroidClosedTesting and r/androiddev.</p>
        <div id="reddit-status">
          ${redditStatus.connected
            ? `<div class="social-connected">
                <span class="badge yours">Connected as u/${esc(redditStatus.username)}</span>
                <button class="btn ghost small" id="reddit-disconnect">Disconnect</button>
              </div>`
            : `<button class="btn" id="reddit-connect">Connect Reddit Account</button>
               <p class="note-line" style="margin-top:8px">You'll be redirected to Reddit to authorize TesterSwap.</p>`
          }
        </div>
      </div>
      <div class="card">
        <h3>Discord Bot</h3>
        <p class="small muted" style="margin-bottom:14px">Configure a Discord bot to post in Android dev servers and search for testers.</p>
        <div class="trust-box">
          <div class="trust-row"><span class="trust-icon">🔒</span><span>Bot token stays on this server. Used only to send messages in channels you configure.</span></div>
          <div class="trust-row"><span class="trust-icon">💡</span><span>Create a bot at <a href="https://discord.com/developers/applications" target="_blank" rel="noopener" style="color:var(--yours)">discord.com/developers</a> with minimal permissions.</span></div>
        </div>
        <div id="discord-config">
          <label for="dBotToken">Bot Token</label>
          <input id="dBotToken" type="password" placeholder="Discord bot token" value="">
          <div class="row">
            <div><label for="dGuildId">Server ID</label><input id="dGuildId" placeholder="Server ID" value="${esc(discordStatus.guildName || '')}"></div>
            <div><label for="dChannelId">Channel ID</label><input id="dChannelId" placeholder="Channel ID"></div>
          </div>
          <div style="display:flex;gap:9px;margin-top:9px">
            <button class="btn" id="discord-save">Save & Test</button>
            <button class="btn ghost" id="discord-channels">Load Channels</button>
          </div>
          <div id="discord-status" class="note-line"></div>
        </div>
      </div>
      <div class="card">
        <h3>Auto-Post Settings</h3>
        <p class="small muted" style="margin-bottom:14px">Configure automatic recruitment posts to social platforms.</p>
        <label for="autoSubreddits">Subreddits (comma-separated)</label>
        <input id="autoSubreddits" placeholder="AndroidClosedTesting, androiddev" value="AndroidClosedTesting, androiddev">
        <label for="autoFrequency">Post frequency</label>
        <select id="autoFrequency" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg)">
          <option value="6">Every 6 hours</option>
          <option value="12">Every 12 hours</option>
          <option value="24">Daily</option>
        </select>
        <label for="autoTemplate">Message template</label>
        <textarea id="autoTemplate" rows="3" placeholder="Join my Android closed test! I'll test yours too.">Join my Android closed test! I need 12 testers for 14 days. I'll test yours in return. Link: ${esc(meData.app?.inviteLink || '')}</textarea>
        <button class="btn" id="auto-save" style="margin-top:9px">Save Auto-Post Settings</button>
      </div>
    </div>`;

  // Reddit connect
  document.getElementById('reddit-connect')?.addEventListener('click', safe(async () => {
    const { url } = await api('/social/reddit/auth');
    window.location.href = url;
  }));

  document.getElementById('reddit-disconnect')?.addEventListener('click', safe(async () => {
    await api('/social/reddit/disconnect', 'DELETE');
    toast('Reddit disconnected.');
    renderSocial();
  }));

  // Discord save
  document.getElementById('discord-save')?.addEventListener('click', safe(async () => {
    const token = document.getElementById('dBotToken').value.trim();
    const guildId = document.getElementById('dGuildId').value.trim();
    const channelId = document.getElementById('dChannelId').value.trim();
    const statusEl = document.getElementById('discord-status');
    if (!token) return statusEl.textContent = 'Bot token required';
    await api('/social/discord/config', 'PUT', { botToken: token, guildId, channelId, enabled: true });
    statusEl.textContent = 'Saved and connected!';
    toast('Discord configured.');
  }));

  document.getElementById('discord-channels')?.addEventListener('click', safe(async () => {
    const token = document.getElementById('dBotToken').value.trim();
    const guildId = document.getElementById('dGuildId').value.trim();
    if (!token || !guildId) return toast('Enter bot token and server ID first', 'err');
    await api('/social/discord/config', 'PUT', { botToken: token, guildId });
    const channels = await api('/social/discord/channels');
    const channelInput = document.getElementById('dChannelId');
    if (channels.length) {
      channelInput.value = channels[0].id;
      toast(`Found ${channels.length} channels`);
    } else {
      toast('No text channels found', 'err');
    }
  }));

  // Auto-post save
  document.getElementById('auto-save')?.addEventListener('click', safe(async () => {
    toast('Auto-post settings saved.');
  }));
}

/* ---------- community feed ---------- */

async function renderFeed() {
  await refreshMe();
  if (!meData.user) { location.hash = '#/login'; return renderLogin(); }
  setMeta('Community Feed: TesterSwap', 'Discover potential testers from Reddit and Discord.');
  view.innerHTML = `<div class="spinner">Loading feed</div>`;

  const feed = await api('/social/feed?pageSize=30');

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Community Feed</h1>
        <p class="sub">Posts from Reddit and Discord where devs are looking for testers.</p>
      </div>
      <div class="actions">
        <a class="btn small ghost" href="#/discover">Search manually</a>
      </div>
    </div>
    <div class="feed-filters">
      <button class="btn small ghost feed-filter active" data-filter="all">All</button>
      <button class="btn small ghost feed-filter" data-filter="reddit">Reddit</button>
      <button class="btn small ghost feed-filter" data-filter="discord">Discord</button>
    </div>
    <div id="feed-list" class="feed-list">
      ${feed.posts.length ? feed.posts.map(p => `
        <div class="feed-card" data-platform="${p.platform}">
          <div class="feed-meta">
            <span class="badge ${p.platform === 'reddit' ? 'theirs' : 'yours'}">${p.platform}</span>
            <span class="mono-sm muted">${esc(p.author)}</span>
            <span class="mono-sm muted">${timeAgo(p.created_at)}</span>
          </div>
          ${p.title ? `<h3 class="feed-title">${esc(p.title)}</h3>` : ''}
          <p class="feed-body">${esc(p.body).slice(0, 300)}${p.body.length > 300 ? '...' : ''}</p>
          <div class="feed-actions">
            <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener">Open</a>
            <button class="btn ghost small" data-reply="${p.id}">Reply</button>
            <button class="btn ghost small" data-save="${p.id}">Save</button>
          </div>
        </div>`).join('') : `<div class="empty"><strong>Feed is empty</strong>Search for testers or wait for the auto-refresh to populate this feed.<a href="#/discover" class="btn small">Search now</a></div>`}
    </div>
    ${feed.totalPages > 1 ? `<div class="feed-pagination"><button class="btn ghost small" id="feed-more" ${feed.page >= feed.totalPages ? 'disabled' : ''}>Load more</button></div>` : ''}`;

  // Filter buttons
  view.querySelectorAll('.feed-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('.feed-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      view.querySelectorAll('.feed-card').forEach(card => {
        card.style.display = (filter === 'all' || card.dataset.platform === filter) ? '' : 'none';
      });
    });
  });

  // Reply buttons
  view.querySelectorAll('[data-reply]').forEach(btn => {
    btn.addEventListener('click', () => renderComposer('reddit'));
  });
}

/* ---------- tester discovery ---------- */

async function renderDiscover() {
  await refreshMe();
  if (!meData.user) { location.hash = '#/login'; return renderLogin(); }
  setMeta('Discover Testers: TesterSwap', 'Search Reddit and Discord for Android devs looking for closed test participants.');
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Discover Testers</h1>
        <p class="sub">Search social platforms for devs who need closed test participants.</p>
      </div>
    </div>
    <div class="card">
      <div class="discover-search">
        <input id="discQuery" placeholder="Search for closed test, testing exchange, testers needed..." value="closed test signup">
        <button class="btn" id="discSearch">Search</button>
      </div>
      <div id="discResults" class="disc-results">
        <div class="empty"><strong>Enter a search term</strong>Find Reddit posts and Discord messages where devs are looking for testers.</div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>Post a recruit message</h3>
      <p class="small muted" style="margin-bottom:14px">Can't find the right swap? Post your own recruit message to Reddit or Discord.</p>
      <button class="btn" id="openComposer">Draft & Post</button>
    </div>`;

  document.getElementById('discSearch').addEventListener('click', safe(async () => {
    const query = document.getElementById('discQuery').value.trim();
    if (!query) return toast('Enter a search term', 'err');
    const resultsEl = document.getElementById('discResults');
    resultsEl.innerHTML = `<div class="spinner">Searching Reddit & Discord</div>`;
    try {
      const results = await api('/social/search', 'POST', { query });
      const total = results.reddit.length + results.discord.length;
      resultsEl.innerHTML = total === 0
        ? `<div class="empty"><strong>No results found</strong>Try different keywords like "looking for testers" or "test exchange".</div>`
        : `
          <p class="mono-sm muted" style="margin-bottom:12px">${total} result${total === 1 ? '' : 's'} found</p>
          ${results.reddit.length ? `
            <h4 class="disc-section">Reddit (${results.reddit.length})</h4>
            ${results.reddit.map(p => `
              <div class="disc-result">
                <div class="disc-rmeta"><span class="badge theirs">r/${esc(p.subreddit)}</span> <span class="mono-sm muted">u/${esc(p.author)} · ${p.score} upvotes</span></div>
                <h4>${esc(p.title)}</h4>
                <p class="small muted">${esc(p.body).slice(0, 200)}${p.body.length > 200 ? '...' : ''}</p>
                <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener">Open on Reddit</a>
              </div>`).join('')}` : ''}
          ${results.discord.length ? `
            <h4 class="disc-section">Discord (${results.discord.length})</h4>
            ${results.discord.map(m => `
              <div class="disc-result">
                <div class="disc-rmeta"><span class="badge yours">Discord</span> <span class="mono-sm muted">@${esc(m.author)}</span></div>
                <p class="small">${esc(m.content).slice(0, 200)}</p>
                <a class="btn small" href="${esc(m.url)}" target="_blank" rel="noopener">Open in Discord</a>
              </div>`).join('')}` : ''}`;
    } catch (e) {
      resultsEl.innerHTML = `<div class="empty"><strong>Search failed</strong>${esc(e.message)}</div>`;
    }
  }));

  document.getElementById('openComposer').addEventListener('click', () => renderComposer('reddit'));
}

/* ---------- post composer modal ---------- */

function renderComposer(defaultPlatform = 'reddit') {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'composer-modal';
  modal.innerHTML = `
    <div class="modal card">
      <div class="modal-head">
        <h2>Post to Community</h2>
        <button class="btn ghost small" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="composer-platforms">
          <button class="btn small ${defaultPlatform === 'reddit' ? '' : 'ghost'}" data-platform="reddit">Reddit</button>
          <button class="btn small ${defaultPlatform === 'discord' ? '' : 'ghost'}" data-platform="discord">Discord</button>
        </div>
        <div id="composer-reddit" style="${defaultPlatform === 'reddit' ? '' : 'display:none'}">
          <label for="compSub">Subreddit</label>
          <input id="compSub" placeholder="AndroidClosedTesting" value="AndroidClosedTesting">
          <label for="compTitle">Title</label>
          <input id="compTitle" placeholder="Looking for testers for my Android app...">
        </div>
        <div id="composer-discord" style="${defaultPlatform === 'discord' ? '' : 'display:none'}">
          <label for="compChannel">Channel ID</label>
          <input id="compChannel" placeholder="Discord channel ID">
        </div>
        <label for="compBody">Message</label>
        <textarea id="compBody" rows="5" placeholder="Join my Android closed test! I'll test yours in return.">Join my Android closed test! I need 12 testers for 14 days. I'll test yours in return. ${meData.app?.inviteLink || ''}</textarea>
        <div class="composer-actions">
          <button class="btn ghost" id="compDraft">Draft with AI</button>
          <button class="btn" id="compPost">Post Now</button>
        </div>
        <div id="compResult" class="note-line"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  let platform = defaultPlatform;
  modal.querySelectorAll('[data-platform]').forEach(btn => {
    btn.addEventListener('click', () => {
      platform = btn.dataset.platform;
      modal.querySelectorAll('[data-platform]').forEach(b => b.classList.toggle('ghost', b !== btn));
      document.getElementById('composer-reddit').style.display = platform === 'reddit' ? '' : 'none';
      document.getElementById('composer-discord').style.display = platform === 'discord' ? '' : 'none';
    });
  });

  modal.querySelector('#compDraft').addEventListener('click', safe(async () => {
    const { text } = await api('/draft', 'POST', { kind: 'post' });
    document.getElementById('compBody').value = text;
  }));

  modal.querySelector('#compPost').addEventListener('click', safe(async () => {
    const body = document.getElementById('compBody').value.trim();
    const resultEl = document.getElementById('compResult');
    if (body.length < 10) return resultEl.textContent = 'Message must be at least 10 characters';

    const payload = { platform, text: body, content: body };
    if (platform === 'reddit') {
      payload.subreddit = document.getElementById('compSub').value.trim() || 'AndroidClosedTesting';
      payload.title = document.getElementById('compTitle').value.trim() || 'Looking for Android closed test participants';
    } else {
      payload.channelId = document.getElementById('compChannel').value.trim();
      if (!payload.channelId) return resultEl.textContent = 'Enter a Discord channel ID';
    }

    const res = await api('/social/post', 'POST', payload);
    resultEl.textContent = 'Post queued! It will be published shortly.';
    resultEl.style.color = 'var(--yours)';
    toast('Post queued.');
  }));
}

/* ---------- helpers ---------- */

function timeAgo(ts) {
  const diff = Date.now() - Number(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ---------- contact / thank you ---------- */

function renderContact() {
  setMeta('Contact: TesterSwap', 'Report a bad actor, suggest a feature or ask a question. We read every message.');
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="card auth-card">
        <p class="eyebrow">the desk inbox</p>
        <h1>Contact us</h1>
        <p class="sub small">Report a bad actor, suggest a feature, or ask a question. Real humans reply.</p>
        <div id="err" class="inline-err" role="alert"></div>
        <div class="row">
          <div><label for="cName">Your name</label><input id="cName" placeholder="Alex" autocomplete="name"></div>
          <div><label for="cEmail">Email</label><input id="cEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>
        </div>
        <label style="margin-top:2px">Topic</label>
        <div class="contact-topic" id="cTopics">
          <button type="button" class="topic-chip" data-topic="Report a bad actor">Report a bad actor</button>
          <button type="button" class="topic-chip" data-topic="Feature request">Feature request</button>
          <button type="button" class="topic-chip" data-topic="Question">Question</button>
        </div>
        <label for="cMsg">Message</label>
        <textarea id="cMsg" rows="5" placeholder="What's up?"></textarea>
        <button class="btn" id="cSend" style="width:100%">Send message</button>
      </div>
    </div>`;
  let topic = '';
  document.querySelectorAll('.topic-chip').forEach(chip => chip.addEventListener('click', () => {
    topic = chip.dataset.topic;
    document.querySelectorAll('.topic-chip').forEach(c => c.classList.toggle('on', c === chip));
  }));
  document.getElementById('cSend').addEventListener('click', safe(async () => {
    const name = document.getElementById('cName').value.trim();
    const email = document.getElementById('cEmail').value.trim();
    const msg = document.getElementById('cMsg').value.trim();
    markInvalid(document.getElementById('cName'), !name);
    markInvalid(document.getElementById('cEmail'), !email || !String(email).includes('@'));
    markInvalid(document.getElementById('cMsg'), msg.length < 10);
    const err = document.getElementById('err');
    if (!name || !email || !msg) return err.textContent = 'Name, email and a message are all required.';
    if (!String(email).includes('@')) return err.textContent = 'That doesn\'t look like an email address.';
    if (msg.length < 10) return err.textContent = 'Tell us a bit more, at least 10 characters.';
    if (!topic) return err.textContent = 'Pick a topic above.';
    await api('/contact', 'POST', { name, email, topic, message: msg });
    view.innerHTML = `
      <div class="auth-wrap">
        <div class="card auth-card thanks">
          <div class="tick" aria-hidden="true">✓</div>
          <h1>Message sent.</h1>
          <p class="sub">Thanks, ${esc(name)}. We read every message and reply to reports within a day.</p>
          <a class="btn" href="#/">Back to home</a>
        </div>
      </div>`;
    setMeta('Message sent: TesterSwap', 'Thanks for writing to us.');
    window.scrollTo(0, 0);
  }));
}

/* ---------- legal ---------- */

const LEGAL = {
  privacy: {
    eyebrow: 'the fine print, plainly',
    title: 'Privacy policy',
    body: `
      <p>TesterSwap runs on trust. Ours in you, and yours in the people you swap with. This policy says plainly what we collect, why, and what we never do.</p>
      <h3>What we store</h3>
      <ul>
        <li>Your account: email and a password hash. We never store raw passwords.</li>
        <li>Your app profile: name, package name, Play invite link, description, visible to signed-in devs so swaps can happen.</li>
        <li>Your testers: the names and emails you add to your tester ledger. These are visible only to you.</li>
        <li>Contact messages, which we keep to answer you.</li>
      </ul>
      <h3>Cookies</h3>
      <p>One essential cookie keeps you signed in. We set no advertising, tracking or cross-site cookies, and we have no trackers of our own.</p>
      <h3>AI drafts</h3>
      <p>If you add an API key in Settings, we send the draft prompt to the provider you chose (OpenAI, Groq, OpenRouter, DeepSeek or similar) to generate message copy. Your key is stored on our server, never shown to other users, and drafts are generated only when you click a draft button.</p>
      <h3>What we never do</h3>
      <ul>
        <li>We never sell or rent your data to anyone.</li>
        <li>We never create fake testers or fake opt-ins, and we don't tolerate anyone who does.</li>
        <li>We never share your tester list. That ledger is yours.</li>
      </ul>
      <h3>Deleting your account</h3>
      <p>Email us at <code>hello@testerswap.app</code> and we'll delete your account, app profile, testers and trades within 14 days.</p>
      <h3>Contact</h3>
      <p>TesterSwap · hello@testerswap.app · questions, reports and deletion requests land in the same inbox.</p>
    `
  },
  terms: {
    eyebrow: 'the deal',
    title: 'Terms of use',
    body: `
      <p>By using TesterSwap you agree to these terms. They exist to keep the desk honest.</p>
      <h3>The point of this place</h3>
      <p>TesterSwap connects Android developers who need real humans opted into their closed tests. The only currency is genuine, mutual testing.</p>
      <h3>The golden rule</h3>
      <ul>
        <li>Real accounts only. No fake Google accounts, no bots, no purchased opt-ins.</li>
        <li>When you claim a swap, actually join the other dev's test and stay opted in for the full 14 days.</li>
        <li>Don't harass, spam or misrepresent other members.</li>
      </ul>
      <h3>Your obligations</h3>
      <p>You're responsible for your app, its invite link and your Play Console activity. TesterSwap is a coordination tool. It isn't affiliated with Google and can't guarantee Play approval.</p>
      <h3>Moderation</h3>
      <p>We may remove accounts that break the golden rule. Repeated abuse (fake opt-ins, dead swaps, harassment) gets you banned and your trades removed.</p>
      <h3>Service and liability</h3>
      <p>The service is provided as-is. We're not liable for lost testers, rejected releases, or a Play review that says no. Your Play account is yours to protect.</p>
      <h3>Changes</h3>
      <p>We may update these terms. Continued use after a change means you accept the new terms.</p>
      <h3>Contact</h3>
      <p>Questions about these terms: <code>hello@testerswap.app</code>.</p>
    `
  }
};

function renderLegal(which) {
  const l = LEGAL[which];
  setMeta(`${l.title}: TesterSwap`, which === 'privacy' ? 'What TesterSwap stores, why, and what we never do.' : 'The rules of the desk: real accounts, real testing, zero fakes.');
  view.innerHTML = `
    <div class="auth-wrap" style="max-width:680px">
      <div class="card">
        <p class="eyebrow">${l.eyebrow}</p>
        <h1>${l.title}</h1>
        <div class="prose" style="margin-top:18px">${l.body}</div>
      </div>
    </div>`;
}

/* ---------- 404 ---------- */

function renderNotFound() {
  setMeta('404: Not found | TesterSwap', 'This page doesn\'t exist.');
  view.innerHTML = `
    <div class="notfound">
      <code>404 · build failed</code>
      <h1>This route doesn't compile.</h1>
      <p>No opt-ins live here, just a dead link.</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <a class="btn" href="#/">Back to TesterSwap</a>
        <a class="btn ghost" href="#/browse">Browse community</a>
      </div>
    </div>`;
}

/* ---------- boot ---------- */

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/logout', 'POST');
  meData = { user: null, app: null };
  toast('Signed out.');
  location.hash = '#/';
  navigate();
});

// Notification bell
const notifBtn = document.getElementById('notif-btn');
const notifBadge = document.getElementById('notif-badge');
async function checkNotifications() {
  if (!meData.user) { notifBtn.hidden = true; return; }
  try {
    const { unread } = await api('/notifications');
    notifBtn.hidden = false;
    notifBadge.hidden = unread === 0;
    notifBtn.onclick = async () => {
      const { notifications } = await api('/notifications');
      if (!notifications.length) return toast('No notifications yet.');
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal card" style="max-width:500px">
          <div class="modal-head">
            <h2>Notifications</h2>
            <button class="btn ghost small" onclick="this.closest('.modal-overlay').remove()">✕</button>
          </div>
          <div class="modal-body">
            ${notifications.map(n => `
              <div class="checkin-row ${n.read ? '' : 'stale'}" style="border-bottom:1px solid var(--border);padding:10px 0">
                <div style="flex:1">
                  <strong>${esc(n.title)}</strong>
                  <p class="small muted" style="margin:2px 0 0">${esc(n.body)}</p>
                  <span class="mono-sm muted">${timeAgo(n.created_at)}</span>
                </div>
              </div>`).join('')}
            <button class="btn small" id="markAllRead" style="margin-top:14px">Mark all read</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      document.getElementById('markAllRead')?.addEventListener('click', async () => {
        await api('/notifications/read-all', 'POST');
        notifBadge.hidden = true;
        modal.remove();
        toast('All marked read.');
      });
    };
  } catch { notifBtn.hidden = true; }
}
checkNotifications();

window.addEventListener('hashchange', navigate);
navigate();
refreshMe().then(() => {
  navigate();
  updateMobileCta((location.hash || '#/').split('?')[0]);
});

/* cookie banner + opt-in analytics */
(function () {
  const banner = document.getElementById('cookie-banner');
  let consent = null;
  try { consent = localStorage.getItem('ts-consent'); } catch (e) {}
  const analyticsSrc = document.querySelector('meta[name="analytics-src"]')?.content;
  const loadAnalytics = () => {
    if (!analyticsSrc) return;
    const s = document.createElement('script');
    s.defer = true;
    s.src = analyticsSrc;
    document.head.appendChild(s);
  };
  if (consent) { loadAnalytics(); }
  else if (banner) {
    banner.hidden = false;
    document.getElementById('cookie-accept').addEventListener('click', () => {
      try { localStorage.setItem('ts-consent', '1'); } catch (e) {}
      banner.hidden = true;
      loadAnalytics();
    });
  }
})();