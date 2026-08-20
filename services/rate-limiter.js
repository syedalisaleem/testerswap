import { db } from '../db.js';

const now = () => Date.now();

class RateLimiter {
  async check(key, limit, windowMs) {
    const windowStart = now() - windowMs;
    await db.prepare('DELETE FROM rate_limits WHERE key = ? AND window_start < ?').run(key, windowStart);
    const row = await db.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').get(key);
    if (!row) {
      await db.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)').run(key, now());
      return true;
    }
    if (row.count >= limit) return false;
    await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
    return true;
  }

  async reset(key) {
    await db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
  }

  async getCount(key, windowMs) {
    const windowStart = now() - windowMs;
    await db.prepare('DELETE FROM rate_limits WHERE key = ? AND window_start < ?').run(key, windowStart);
    const row = await db.prepare('SELECT count FROM rate_limits WHERE key = ?').get(key);
    return row ? row.count : 0;
  }
}

export const rateLimiter = new RateLimiter();
