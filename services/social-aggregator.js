import { db } from '../db.js';
import { redditService } from './reddit.js';
import { discordService } from './discord.js';
import { randomUUID } from 'node:crypto';

const CACHE_TTL = 1800000; // 30 minutes

class SocialAggregator {
  async searchAll(userId, { query, subreddits = ['AndroidClosedTesting', 'androiddev'] }) {
    const results = { reddit: [], discord: [] };

    // Search Reddit
    try {
      for (const sub of subreddits) {
        try {
          const posts = await redditService.search(sub, query, 10);
          results.reddit.push(...posts);
        } catch (e) {
          console.error(`Reddit search failed for r/${sub}:`, e.message);
        }
      }
    } catch (e) {
      console.error('Reddit search error:', e.message);
    }

    // Search Discord
    try {
      const config = await discordService.getConfig();
      if (config?.enabled && config.channel_id) {
        const msgs = await discordService.searchMessages(config.channel_id, query, 25);
        results.discord.push(...msgs);
      }
    } catch (e) {
      console.error('Discord search error:', e.message);
    }

    // Cache results
    await this._cacheResults([...results.reddit, ...results.discord]);

    return {
      reddit: results.reddit,
      discord: results.discord,
      total: results.reddit.length + results.discord.length
    };
  }

  async _cacheResults(posts) {
    for (const post of posts) {
      try {
        const platform = post.subreddit ? 'reddit' : 'discord';
        await db.prepare(`
          INSERT INTO social_searches (id, platform, query, external_id, author, title, body, url, score, created_at)
          VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(platform, external_id) DO UPDATE SET
            score = excluded.score,
            body = excluded.body
        `).run(
          randomUUID(),
          platform,
          post.id,
          post.author,
          post.title || post.content?.slice(0, 100) || '',
          post.body || post.content || '',
          post.url,
          post.score || 0,
          post.timestamp || post.created || Date.now()
        );
      } catch (e) {
        // Skip duplicate or invalid entries
      }
    }
  }

  async getFeed(userId, { page = 1, pageSize = 20, platform, sort = 'new' } = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (platform) {
      where += ' AND platform = ?';
      params.push(platform);
    }

    const order = sort === 'relevance' ? 'score DESC' : 'created_at DESC';

    const total = Number((await db.prepare(`SELECT COUNT(*) AS c FROM social_searches ${where}`).get(...params)).c);
    const offset = (page - 1) * pageSize;

    const posts = db.prepare(`SELECT * FROM social_searches ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);

    return {
      posts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async clearStale() {
    const cutoff = Date.now() - CACHE_TTL * 2; // 1 hour
    await db.prepare('DELETE FROM social_searches WHERE created_at < ?').run(cutoff);
  }
}

export const socialAggregator = new SocialAggregator();
