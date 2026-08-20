import { db } from '../db.js';
import { rateLimiter } from './rate-limiter.js';
import { randomBytes } from 'node:crypto';

const REDDIT_AUTH_URL = 'https://www.reddit.com/api/v1/authorize';
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';
const USER_AGENT = 'TesterSwap/1.0 (by /u/testerswap-app)';
const RATE_KEY = 'reddit_api';
const RATE_LIMIT = 80; // stay under 100 QPM
const RATE_WINDOW = 60000; // 1 minute

class RedditService {
  constructor() {
    this.stateMap = new Map(); // state -> { userId, expiresAt }
  }

  getAuthUrl(userId, baseUrl) {
    const clientId = process.env.REDDIT_CLIENT_ID;
    if (!clientId) throw new Error('Reddit client ID not configured');

    const state = randomBytes(16).toString('hex');
    this.stateMap.set(state, { userId, expiresAt: Date.now() + 600000 });

    const redirectUri = process.env.REDDIT_REDIRECT_URI || `${baseUrl}/api/social/reddit/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      state,
      redirect_uri: redirectUri,
      duration: 'permanent',
      scope: 'identity submit read'
    });

    return { url: `${REDDIT_AUTH_URL}?${params}`, state };
  }

  async exchangeCode(code, state, baseUrl) {
    const entry = this.stateMap.get(state);
    if (!entry || Date.now() > entry.expiresAt) {
      throw new Error('Invalid or expired OAuth state');
    }
    this.stateMap.delete(state);

    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Reddit credentials not configured');

    const redirectUri = process.env.REDDIT_REDIRECT_URI || `${baseUrl}/api/social/reddit/callback`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    });

    const res = await fetch(REDDIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Reddit token exchange failed: ${err}`);
    }

    const data = await res.json();
    const expiresAt = Date.now() + (data.expires_in * 1000);

    // Get username
    const meRes = await fetch(`${REDDIT_API_BASE}/api/v1/me`, {
      headers: { 'Authorization': `Bearer ${data.access_token}`, 'User-Agent': USER_AGENT }
    });
    const me = meRes.ok ? await meRes.json() : {};

    await db.prepare(`
      INSERT INTO reddit_accounts (user_id, access_token, refresh_token, expires_at, reddit_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        reddit_username = excluded.reddit_username
    `).run(entry.userId, data.access_token, data.refresh_token, expiresAt, me.name || '', Date.now());

    return { username: me.name };
  }

  async refreshToken(userId) {
    const account = await db.prepare('SELECT * FROM reddit_accounts WHERE user_id = ?').get(userId);
    if (!account) throw new Error('Reddit account not connected');

    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token
    });

    const res = await fetch(REDDIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body
    });

    if (!res.ok) throw new Error('Reddit token refresh failed');
    const data = await res.json();
    const expiresAt = Date.now() + (data.expires_in * 1000);

    await db.prepare('UPDATE reddit_accounts SET access_token = ?, expires_at = ? WHERE user_id = ?')
      .run(data.access_token, expiresAt, userId);

    return { accessToken: data.access_token };
  }

  async _getAccessToken(userId) {
    const account = await db.prepare('SELECT * FROM reddit_accounts WHERE user_id = ?').get(userId);
    if (!account) throw new Error('Reddit account not connected');

    // Refresh if within 5 minutes of expiry
    if (Date.now() > account.expires_at - 300000) {
      const { accessToken } = await this.refreshToken(userId);
      return accessToken;
    }
    return account.access_token;
  }

  async search(subreddit, query, limit = 25) {
    const allowed = await rateLimiter.check(RATE_KEY, RATE_LIMIT, RATE_WINDOW);
    if (!allowed) throw new Error('Reddit rate limit exceeded — try again shortly');

    const params = new URLSearchParams({
      q: query,
      restrict_sr: '1',
      sort: 'new',
      t: 'month',
      limit: String(limit)
    });

    const res = await fetch(`${REDDIT_API_BASE}/r/${subreddit}/search.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error('Reddit rate limited');
      throw new Error(`Reddit search failed: ${res.status}`);
    }

    const data = await res.json();
    const children = data?.data?.children || [];

    return children.map(c => ({
      id: c.data.id,
      subreddit: c.data.subreddit,
      title: c.data.title,
      body: c.data.selftext || '',
      author: c.data.author,
      score: c.data.score,
      url: `https://reddit.com${c.data.permalink}`,
      created: c.data.created_utc * 1000
    }));
  }

  async submit(userId, { subreddit, title, text }) {
    const accessToken = await this._getAccessToken(userId);
    const allowed = await rateLimiter.check(RATE_KEY, RATE_LIMIT, RATE_WINDOW);
    if (!allowed) throw new Error('Reddit rate limit exceeded — try again shortly');

    const body = new URLSearchParams({
      sr: subreddit,
      kind: 'self',
      title,
      text,
      resubmit: 'true'
    });

    const res = await fetch(`${REDDIT_API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Reddit post failed: ${err}`);
    }

    const data = await res.json();
    if (data.errors?.length) throw new Error(`Reddit: ${data.errors[0][1]}`);

    return {
      id: data.id,
      url: `https://reddit.com${data.permalink}`
    };
  }

  async getStatus(userId) {
    const account = await db.prepare('SELECT * FROM reddit_accounts WHERE user_id = ?').get(userId);
    if (!account) return { connected: false };
    return {
      connected: true,
      username: account.reddit_username,
      expiresAt: account.expires_at
    };
  }

  async disconnect(userId) {
    await db.prepare('DELETE FROM reddit_accounts WHERE user_id = ?').run(userId);
  }
}

export const redditService = new RedditService();
