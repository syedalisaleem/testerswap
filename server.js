import express from 'express';
import compression from 'compression';
import cookieSession from 'cookie-session';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { db } from './db.js';
import { redditService } from './services/reddit.js';
import { discordService } from './services/discord.js';
import { socialAggregator } from './services/social-aggregator.js';
import { scheduler } from './services/scheduler.js';
import { rateLimiter } from './services/rate-limiter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || 'https://testerswap.app').replace(/\/$/, '');
const APP_NAME = 'TesterSwap';
const REQUIRED_TESTERS = 12;
const REQUIRED_DAYS = 14;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
    app_name TEXT NOT NULL,
    package_name TEXT NOT NULL,
    invite_link TEXT NOT NULL,
    description TEXT DEFAULT '',
    test_started_at BIGINT,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS testers (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'invited',
    joined_at BIGINT,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    from_app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    to_app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at BIGINT NOT NULL,
    UNIQUE (from_app_id, to_app_id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    ai_api_key TEXT DEFAULT '',
    ai_model TEXT DEFAULT 'gpt-4o-mini',
    ai_base_url TEXT DEFAULT 'https://api.openai.com/v1'
  )`,
  `CREATE TABLE IF NOT EXISTS checklist (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    created_test INTEGER DEFAULT 0,
    review_passed INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    topic TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reddit_accounts (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    reddit_username TEXT DEFAULT '',
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS discord_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bot_token TEXT DEFAULT '',
    guild_id TEXT DEFAULT '',
    channel_id TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS social_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    platform TEXT NOT NULL CHECK (platform IN ('reddit', 'discord')),
    target TEXT NOT NULL,
    title TEXT DEFAULT '',
    body TEXT NOT NULL,
    url TEXT DEFAULT '',
    external_id TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT DEFAULT '',
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS social_searches (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL CHECK (platform IN ('reddit', 'discord')),
    query TEXT NOT NULL,
    external_id TEXT NOT NULL,
    author TEXT DEFAULT '',
    title TEXT DEFAULT '',
    body TEXT DEFAULT '',
    url TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    UNIQUE (platform, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 1,
    window_start BIGINT NOT NULL
  )`
];

await db.exec(SCHEMA);

let indexHtml = readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
indexHtml = indexHtml.replaceAll('{{BASE_URL}}', BASE_URL);
if (process.env.ANALYTICS_SRC) {
  indexHtml = indexHtml.replace('</head>', `  <meta name="analytics-src" content="${process.env.ANALYTICS_SRC}">\n</head>`);
}

const app = express();
app.set('x-powered-by', false);
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'sha256-4an8UBeDOstS0gorjJWq7ITjdapj3T4C82mjCLrrfWM='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://www.redditstatic.com https://cdn.discordapp.com; connect-src 'self' https://www.reddit.com https://oauth.reddit.com https://discord.com https://cdn.discordapp.com; base-uri 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.png') || filePath.endsWith('.svg')) res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  const secretFile = path.join(__dirname, '.session-secret');
  try {
    sessionSecret = readFileSync(secretFile, 'utf8').trim();
  } catch {
    sessionSecret = randomBytes(32).toString('hex');
    try { writeFileSync(secretFile, sessionSecret, { mode: 0o600 }); } catch {}
  }
}

app.use(cookieSession({
  name: 'ts_session',
  keys: [sessionSecret],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict',
  secure: process.env.NODE_ENV === 'production'
}));

function requireSameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  const secFetchSite = (req.headers['sec-fetch-site'] || '').toLowerCase();
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return next();
  if (!origin) return next();
  try {
    const host = new URL(origin).host;
    const allowed = (process.env.ALLOWED_ORIGINS || BASE_URL).split(',').map(u => { try { return new URL(u).host; } catch { return u; } });
    if (allowed.includes(host)) return next();
  } catch {}
  return res.status(403).json({ error: 'Forbidden' });
}
app.use(requireSameOrigin);

const loginAttempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const bucket = loginAttempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - bucket.t > 600000) { bucket.n = 0; bucket.t = Date.now(); }
  bucket.n += 1;
  loginAttempts.set(ip, bucket);
  if (bucket.n > 20) return res.status(429).json({ error: 'Too many attempts — try again in a few minutes.' });
  next();
}
const contactAttempts = new Map();
function contactLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const bucket = contactAttempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - bucket.t > 600000) { bucket.n = 0; bucket.t = Date.now(); }
  bucket.n += 1;
  contactAttempts.set(ip, bucket);
  if (bucket.n > 10) return res.status(429).json({ error: 'Too many messages — try again in a few minutes.' });
  next();
}

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const now = () => Date.now();
const fmt = (ts) => {
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in' });
  next();
}

async function getApp(userId) {
  const appRow = await db.prepare('SELECT * FROM apps WHERE user_id = ?').get(userId);
  if (!appRow) return null;
  return { ...appRow, testers: await getTesters(appRow.id) };
}

async function getTesters(appId) {
  return db.prepare('SELECT * FROM testers WHERE app_id = ? ORDER BY created_at DESC').all(appId);
}

async function appSummary(row) {
  const testers = await db.prepare('SELECT * FROM testers WHERE app_id = ?').all(row.id);
  const optedIn = testers.filter(t => t.status === 'opted_in').length;
  return {
    id: row.id,
    appName: row.app_name,
    packageName: row.package_name,
    inviteLink: row.invite_link,
    description: row.description,
    testers,
    optedIn,
    startTs: row.test_started_at !== null ? Number(row.test_started_at) : null,
    startDate: row.test_started_at !== null ? fmt(row.test_started_at) : null
  };
}

app.post('/api/register', rateLimit, ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !String(email).includes('@') || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Valid email and password (8+ chars) required' });
  }
  const id = randomUUID();
  const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'That email is already registered — sign in instead.' });
  await db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, String(email).toLowerCase(), bcrypt.hashSync(String(password), 10), now());
  req.session.userId = id;
  await db.prepare('INSERT INTO checklist (user_id) VALUES (?) ON CONFLICT DO NOTHING').run(id);
  res.json({ ok: true });
}));

app.post('/api/login', rateLimit, ah(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  req.session.userId = user.id;
  res.json({ ok: true });
}));

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, ah(async (req, res) => {
  const user = await db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.session.userId);
  const appRow = await getApp(req.session.userId);
  const checklist = await db.prepare('SELECT * FROM checklist WHERE user_id = ?').get(req.session.userId);
  const settings = await db.prepare('SELECT ai_model, ai_base_url FROM settings WHERE user_id = ?').get(req.session.userId);
  res.json({
    user,
    app: appRow ? { ...await appSummary(appRow), checklist: checklist || {}, settings: settings || {} } : null
  });
}));

app.put('/api/app', requireAuth, ah(async (req, res) => {
  const { appName, packageName, inviteLink, description } = req.body || {};
  if (!appName || !packageName || !inviteLink || !String(inviteLink).startsWith('http')) {
    return res.status(400).json({ error: 'App name, package name and a valid invite URL are required' });
  }
  const existing = await db.prepare('SELECT id FROM apps WHERE user_id = ?').get(req.session.userId);
  if (existing) {
    await db.prepare('UPDATE apps SET app_name = ?, package_name = ?, invite_link = ?, description = ? WHERE id = ?')
      .run(String(appName), String(packageName), String(inviteLink), String(description || ''), existing.id);
  } else {
    await db.prepare('INSERT INTO apps (id, user_id, app_name, package_name, invite_link, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), req.session.userId, String(appName), String(packageName), String(inviteLink), String(description || ''), now());
  }
  res.json({ ok: true });
}));

app.post('/api/testers', requireAuth, ah(async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const appRow = await db.prepare('SELECT * FROM apps WHERE user_id = ?').get(req.session.userId);
  if (!appRow) return res.status(400).json({ error: 'Add your app first' });
  await db.prepare('INSERT INTO testers (id, app_id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), appRow.id, String(name), String(email), 'invited', now());
  res.json({ ok: true });
}));

app.patch('/api/testers/:id', requireAuth, ah(async (req, res) => {
  const { status } = req.body || {};
  const appRow = await db.prepare('SELECT * FROM apps WHERE user_id = ?').get(req.session.userId);
  if (!appRow) return res.status(400).json({ error: 'No app' });
  const t = await db.prepare('SELECT * FROM testers WHERE id = ? AND app_id = ?').get(req.params.id, appRow.id);
  if (!t) return res.status(404).json({ error: 'Tester not found' });
  const newStatus = status === 'opted_in' ? 'opted_in' : 'invited';
  await db.prepare('UPDATE testers SET status = ?, joined_at = ? WHERE id = ?').run(newStatus, newStatus === 'opted_in' ? now() : null, t.id);
  const optedIn = Number((await db.prepare('SELECT COUNT(*) AS c FROM testers WHERE app_id = ? AND status = ?').get(appRow.id, 'opted_in')).c);
  if (optedIn >= REQUIRED_TESTERS && !appRow.test_started_at) {
    await db.prepare('UPDATE apps SET test_started_at = ? WHERE id = ?').run(now(), appRow.id);
  }
  const started = optedIn >= REQUIRED_TESTERS ? Number((await db.prepare('SELECT test_started_at FROM apps WHERE id = ?').get(appRow.id)).test_started_at) : null;
  res.json({ ok: true, started });
}));

app.delete('/api/testers/:id', requireAuth, ah(async (req, res) => {
  const appRow = await db.prepare('SELECT * FROM apps WHERE user_id = ?').get(req.session.userId);
  await db.prepare('DELETE FROM testers WHERE id = ? AND app_id = ?').run(req.params.id, appRow?.id || '');
  res.json({ ok: true });
}));

app.patch('/api/checklist', requireAuth, ah(async (req, res) => {
  const { key, done } = req.body || {};
  if (!['created_test', 'review_passed'].includes(key)) return res.status(400).json({ error: 'Bad key' });
  await db.prepare(`UPDATE checklist SET ${key} = ? WHERE user_id = ?`).run(done ? 1 : 0, req.session.userId);
  res.json({ ok: true });
}));

app.get('/api/devs', requireAuth, ah(async (req, res) => {
  const mine = await db.prepare('SELECT id FROM apps WHERE user_id = ?').get(req.session.userId);
  const rows = await db.prepare(`
    SELECT a.*, u.email FROM apps a JOIN users u ON u.id = a.user_id WHERE a.user_id != ?
  `).all(req.session.userId);
  const out = [];
  for (const r of rows) {
    const summary = await appSummary(r);
    const trade = mine ? await db.prepare('SELECT * FROM trades WHERE from_app_id = ? AND to_app_id = ?').get(mine.id, r.id) : null;
    out.push({ ...summary, ownerEmail: r.email, trade });
  }
  res.json(out);
}));

app.post('/api/trades', requireAuth, ah(async (req, res) => {
  const { appId } = req.body || {};
  const mine = await db.prepare('SELECT id FROM apps WHERE user_id = ?').get(req.session.userId);
  if (!mine) return res.status(400).json({ error: 'Add your app first' });
  const target = await db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);
  if (!target) return res.status(404).json({ error: 'App not found' });
  await db.prepare('INSERT INTO trades (id, from_app_id, to_app_id, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .run(randomUUID(), mine.id, target.id, 'pending', now());
  res.json({ ok: true });
}));

app.patch('/api/trades/:id', requireAuth, ah(async (req, res) => {
  const { status } = req.body || {};
  const mine = await db.prepare('SELECT id FROM apps WHERE user_id = ?').get(req.session.userId);
  const trade = await db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (trade.to_app_id === mine.id && status === 'confirmed') {
    await db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('confirmed', trade.id);
    return res.json({ ok: true });
  }
  if (trade.from_app_id === mine.id && status === 'joined') {
    await db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('joined', trade.id);
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'Not allowed' });
}));

app.get('/api/trades', requireAuth, ah(async (req, res) => {
  const mine = await db.prepare('SELECT id FROM apps WHERE user_id = ?').get(req.session.userId);
  if (!mine) return res.json({ outgoing: [], incoming: [] });
  const outgoing = await db.prepare(`
    SELECT t.*, a.app_name AS app_name, a.package_name AS package_name, a.invite_link AS invite_link
    FROM trades t JOIN apps a ON a.id = t.to_app_id WHERE t.from_app_id = ?
  `).all(mine.id);
  const incoming = await db.prepare(`
    SELECT t.*, a.app_name AS app_name, a.package_name AS package_name, a.invite_link AS invite_link
    FROM trades t JOIN apps a ON a.id = t.from_app_id WHERE t.to_app_id = ?
  `).all(mine.id);
  res.json({ outgoing, incoming });
}));

app.put('/api/settings', requireAuth, ah(async (req, res) => {
  const { aiApiKey, aiModel, aiBaseUrl } = req.body || {};
  await db.prepare(`
    INSERT INTO settings (user_id, ai_api_key, ai_model, ai_base_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET ai_api_key = excluded.ai_api_key, ai_model = excluded.ai_model, ai_base_url = excluded.ai_base_url
  `).run(req.session.userId, String(aiApiKey || '').trim(), String(aiModel || 'gpt-4o-mini').trim(), String(aiBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/$/, ''));
  res.json({ ok: true });
}));

app.post('/api/draft', requireAuth, ah(async (req, res) => {
  const { kind, testerName, appName, inviteLink, daysLeft } = req.body || {};
  const s = await db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.session.userId);
  if (!s || !s.ai_api_key) return res.status(400).json({ error: 'Add your AI API key in Settings first' });
  const mine = await db.prepare('SELECT * FROM apps WHERE user_id = ?').get(req.session.userId);
  const prompt = kind === 'reminder'
    ? `Write a short, friendly reminder message (max 120 words) for an Android closed test participant named ${testerName || 'the tester'} who hasn't opted in yet. App: ${appName || mine?.app_name}. Invite link: ${inviteLink || mine?.invite_link}. Ask them to open the link and accept. Sign as the app developer.`
    : kind === 'nudge'
    ? `Write a short encouraging message (max 120 words) to tester ${testerName || 'the tester'} asking them to keep the app installed until testing ends, roughly ${daysLeft ?? 14} days left. App: ${appName || mine?.app_name}. Sign as the app developer.`
    : `Write a short post for a developer community (max 150 words) asking real Android users to join a closed test for ${appName || mine?.app_name} (${mine?.package_name}). Mention it takes 2 minutes, test-for-test welcome, and include invite link: ${inviteLink || mine?.invite_link}.`;
  try {
    const r = await fetch(`${s.ai_base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.ai_api_key}` },
      body: JSON.stringify({ model: s.ai_model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
    });
    if (!r.ok) return res.status(502).json({ error: `AI API error ${r.status}: ${(await r.text()).slice(0, 200)}` });
    const data = await r.json();
    res.json({ text: data.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(502).json({ error: 'AI request failed: ' + e.message });
  }
}));

app.post('/api/contact', contactLimit, ah(async (req, res) => {
  const { name, email, topic, message } = req.body || {};
  if (!name || !String(email).includes('@') || !topic || !message || String(message).length < 10) {
    return res.status(400).json({ error: 'Name, valid email, a topic and a message (10+ chars) are required.' });
  }
  await db.prepare('INSERT INTO contact_messages (id, name, email, topic, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), String(name).slice(0, 100), String(email).toLowerCase(), String(topic).slice(0, 60), String(message).slice(0, 2000), now());
  res.json({ ok: true });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, app: APP_NAME }));

/* ---------- social: Reddit OAuth ---------- */

app.get('/api/social/reddit/auth', requireAuth, ah(async (req, res) => {
  const { url } = redditService.getAuthUrl(req.session.userId, BASE_URL);
  res.json({ url });
}));

app.get('/api/social/reddit/callback', requireAuth, ah(async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });
  try {
    const { username } = await redditService.exchangeCode(code, state, BASE_URL);
    res.json({ ok: true, username });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

app.delete('/api/social/reddit/disconnect', requireAuth, ah(async (req, res) => {
  await redditService.disconnect(req.session.userId);
  res.json({ ok: true });
}));

app.get('/api/social/reddit/status', requireAuth, ah(async (req, res) => {
  const status = await redditService.getStatus(req.session.userId);
  res.json(status);
}));

/* ---------- social: Discord config ---------- */

app.put('/api/social/discord/config', requireAuth, ah(async (req, res) => {
  const { botToken, guildId, channelId, enabled } = req.body || {};
  if (botToken) {
    try { await discordService.validateToken(botToken); }
    catch (e) { return res.status(400).json({ error: 'Invalid bot token: ' + e.message }); }
  }
  await discordService.setConfig({ botToken, guildId, channelId, enabled: !!enabled });
  res.json({ ok: true });
}));

app.get('/api/social/discord/status', requireAuth, ah(async (req, res) => {
  const status = await discordService.getStatus();
  res.json(status);
}));

app.get('/api/social/discord/channels', requireAuth, ah(async (req, res) => {
  const config = await discordService.getConfig();
  if (!config?.bot_token || !config.guild_id) return res.json([]);
  const channels = await discordService.getChannels(config.bot_token, config.guild_id);
  res.json(channels.map(c => ({ id: c.id, name: c.name })));
}));

/* ---------- social: feed & search ---------- */

app.get('/api/social/feed', requireAuth, ah(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const platform = req.query.platform || null;
  const sort = req.query.sort || 'new';
  const feed = await socialAggregator.getFeed(req.session.userId, { page, pageSize, platform, sort });
  res.json(feed);
}));

app.post('/api/social/search', requireAuth, ah(async (req, res) => {
  const { query, subreddits } = req.body || {};
  if (!query || String(query).trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }
  const results = await socialAggregator.searchAll(req.session.userId, {
    query: String(query).trim(),
    subreddits: subreddits || ['AndroidClosedTesting', 'androiddev']
  });
  res.json(results);
}));

/* ---------- social: auto-post ---------- */

app.post('/api/social/post', requireAuth, ah(async (req, res) => {
  const { platform, subreddit, channelId, title, text, content } = req.body || {};
  if (!platform || !['reddit', 'discord'].includes(platform)) {
    return res.status(400).json({ error: 'Platform must be reddit or discord' });
  }

  const body = platform === 'reddit' ? text : content;
  if (!body || String(body).trim().length < 10) {
    return res.status(400).json({ error: 'Post content must be at least 10 characters' });
  }

  // Rate limit: 5 posts per user per day
  const today = new Date().toISOString().slice(0, 10);
  const userPostKey = `post:${req.session.userId}:${today}`;
  const allowed = await rateLimiter.check(userPostKey, 5, 86400000);
  if (!allowed) return res.status(429).json({ error: 'Maximum 5 posts per day' });

  const target = platform === 'reddit' ? subreddit : channelId;
  if (!target) return res.status(400).json({ error: platform === 'reddit' ? 'Subreddit required' : 'Channel ID required' });

  const postId = randomUUID();
  await db.prepare(`
    INSERT INTO social_posts (id, user_id, platform, target, title, body, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(postId, req.session.userId, platform, target, title || '', String(body).trim(), now());

  res.json({ ok: true, postId, status: 'pending' });
}));

app.get('/api/social/posts', requireAuth, ah(async (req, res) => {
  const posts = db.prepare('SELECT * FROM social_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.session.userId);
  res.json(posts);
}));

app.delete('/api/social/posts/:id', requireAuth, ah(async (req, res) => {
  await db.prepare("DELETE FROM social_posts WHERE id = ? AND user_id = ? AND status = 'pending'")
    .run(req.params.id, req.session.userId);
  res.json({ ok: true });
}));

/* ---------- social: cron endpoints ---------- */

app.get('/api/cron/search', ah(async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const results = await scheduler.runSearchCycle();
  res.json({ ok: true, ...results });
}));

app.get('/api/cron/post', ah(async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const results = await scheduler.runPostCycle();
  res.json({ ok: true, ...results });
}));

app.get('/api/cron/refresh', ah(async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const results = await scheduler.runRefreshCycle();
  res.json({ ok: true, ...results });
}));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>`);
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (req.path === '/' || req.path === '/index.html') return res.status(200).send(indexHtml);
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  res.status(500).json({ error: 'Something broke on our side — try again.' });
});

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(PORT, () => console.log(`${APP_NAME} running at http://localhost:${PORT}`));
}

export { app };