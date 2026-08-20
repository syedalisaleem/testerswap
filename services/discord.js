import { db } from '../db.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const USER_AGENT = 'TesterSwap/1.0';

class DiscordService {
  async getConfig() {
    return db.prepare('SELECT * FROM discord_config WHERE id = 1').get();
  }

  async setConfig({ botToken, guildId, channelId, enabled }) {
    const existing = await this.getConfig();
    if (existing) {
      await db.prepare(`
        UPDATE discord_config SET bot_token = ?, guild_id = ?, channel_id = ?, enabled = ?, updated_at = ?
        WHERE id = 1
      `).run(botToken || existing.bot_token, guildId || existing.guild_id, channelId || existing.channel_id, enabled ? 1 : 0, Date.now());
    } else {
      await db.prepare(`
        INSERT INTO discord_config (id, bot_token, guild_id, channel_id, enabled, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
      `).run(botToken || '', guildId || '', channelId || '', enabled ? 1 : 0, Date.now());
    }
  }

  async validateToken(token) {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { 'Authorization': `Bot ${token}`, 'User-Agent': USER_AGENT }
    });
    if (!res.ok) throw new Error('Invalid Discord bot token');
    return res.json();
  }

  async getGuilds(token) {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { 'Authorization': `Bot ${token}`, 'User-Agent': USER_AGENT }
    });
    if (!res.ok) throw new Error('Failed to fetch Discord guilds');
    return res.json();
  }

  async getChannels(token, guildId) {
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
      headers: { 'Authorization': `Bot ${token}`, 'User-Agent': USER_AGENT }
    });
    if (!res.ok) throw new Error('Failed to fetch Discord channels');
    const channels = await res.json();
    return channels.filter(c => c.type === 0); // text channels only
  }

  async searchMessages(channelId, query, limit = 25) {
    const config = await this.getConfig();
    if (!config?.bot_token) throw new Error('Discord bot not configured');

    const params = new URLSearchParams({ query, limit: String(limit) });
    const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages?${params}`, {
      headers: { 'Authorization': `Bot ${config.bot_token}`, 'User-Agent': USER_AGENT }
    });

    if (!res.ok) {
      if (res.status === 429) {
        const retry = parseFloat(res.headers.get('retry-after') || '1');
        throw new Error(`Discord rate limited — retry after ${retry}s`);
      }
      throw new Error(`Discord search failed: ${res.status}`);
    }

    const messages = await res.json();
    return messages.map(m => ({
      id: m.id,
      author: m.author?.username || 'unknown',
      authorAvatar: m.author?.avatar || '',
      content: m.content,
      channel: channelId,
      timestamp: new Date(m.timestamp).getTime(),
      url: `https://discord.com/channels/${config.guild_id}/${channelId}/${m.id}`
    }));
  }

  async sendMessage(channelId, content) {
    const config = await this.getConfig();
    if (!config?.bot_token) throw new Error('Discord bot not configured');

    const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${config.bot_token}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT
      },
      body: JSON.stringify({ content })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord send failed: ${err}`);
    }

    const msg = await res.json();
    return {
      id: msg.id,
      url: `https://discord.com/channels/${config.guild_id}/${channelId}/${msg.id}`
    };
  }

  async getStatus() {
    const config = await this.getConfig();
    if (!config?.bot_token || !config.enabled) return { connected: false };
    try {
      const guilds = await this.getGuilds(config.bot_token);
      const guild = guilds.find(g => g.id === config.guild_id);
      return {
        connected: true,
        guildName: guild?.name || 'Unknown',
        channelName: '', // populated by caller
        enabled: !!config.enabled
      };
    } catch {
      return { connected: false, error: 'Bot token invalid' };
    }
  }
}

export const discordService = new DiscordService();
