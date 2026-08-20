import { db } from '../db.js';
import { socialAggregator } from './social-aggregator.js';
import { redditService } from './reddit.js';
import { discordService } from './discord.js';

class Scheduler {
  async runSearchCycle() {
    const results = { reddit: 0, discord: 0 };

    const queries = ['closed test', 'android testing', 'test signup', 'looking for testers'];

    for (const query of queries) {
      try {
        const res = await socialAggregator.searchAll(null, {
          query,
          subreddits: ['AndroidClosedTesting', 'androiddev', 'AndroidApps']
        });
        results.reddit += res.reddit.length;
        results.discord += res.discord.length;
      } catch (e) {
        console.error(`Search cycle error for "${query}":`, e.message);
      }
    }

    // Clean old cache
    await socialAggregator.clearStale();

    return results;
  }

  async runPostCycle() {
    const results = { posted: 0, failed: 0 };
    const pending = db.prepare("SELECT * FROM social_posts WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5").all();

    for (const post of pending) {
      try {
        if (post.platform === 'reddit') {
          const res = await redditService.submit(post.user_id, {
            subreddit: post.target,
            title: post.title,
            text: post.body
          });
          await db.prepare("UPDATE social_posts SET status = 'posted', external_id = ?, url = ? WHERE id = ?")
            .run(res.id, res.url, post.id);
          results.posted++;
        } else if (post.platform === 'discord') {
          const config = await discordService.getConfig();
          const channelId = config?.channel_id || post.target;
          const res = await discordService.sendMessage(channelId, post.body);
          await db.prepare("UPDATE social_posts SET status = 'posted', external_id = ?, url = ? WHERE id = ?")
            .run(res.id, res.url, post.id);
          results.posted++;
        }
      } catch (e) {
        await db.prepare("UPDATE social_posts SET status = 'failed', error = ? WHERE id = ?")
          .run(e.message, post.id);
        results.failed++;
      }
    }

    return results;
  }

  async runRefreshCycle() {
    let refreshed = 0;
    const expiring = db.prepare('SELECT user_id FROM reddit_accounts WHERE expires_at < ?')
      .all(Date.now() + 3600000);

    for (const account of expiring) {
      try {
        await redditService.refreshToken(account.user_id);
        refreshed++;
      } catch (e) {
        console.error(`Token refresh failed for ${account.user_id}:`, e.message);
        // Disconnect after 3 failed refreshes
        await db.prepare('DELETE FROM reddit_accounts WHERE user_id = ? AND expires_at < ?')
          .run(account.user_id, Date.now() - 7200000);
      }
    }

    return { refreshed };
  }
}

export const scheduler = new Scheduler();
