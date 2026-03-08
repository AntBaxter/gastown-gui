import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';

export class MailService {
  constructor({ gtGateway, cache, gtRoot, mailTtlMs = 15000 } = {}) {
    if (!gtGateway) throw new Error('MailService requires gtGateway');
    this._gt = gtGateway;
    this._cache = cache ?? null;
    this._gtRoot = gtRoot;
    this._mailTtlMs = mailTtlMs;
    this._feedCache = { mtimeMs: 0, size: 0, events: null };
  }

  async inbox({ refresh = false } = {}) {
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('mail');
      if (cached !== undefined) return cached;
    }

    const result = await this._gt.mailInbox();
    if (!result.ok) throw new Error(result.error || 'Failed to fetch mail');

    const data = Array.isArray(result.data) ? result.data : [];
    this._cache?.set?.('mail', data, this._mailTtlMs);
    return data;
  }

  async read(id) {
    const result = await this._gt.mailRead(id);
    if (!result.ok) return null;
    return result.data || { id, error: 'Not found' };
  }

  async send({ to, subject, message, priority } = {}) {
    const result = await this._gt.mailSend({ to, subject, message, priority });
    if (!result.ok) throw new Error(result.error || 'Failed to send mail');
    return { success: true };
  }

  async markRead(id) {
    const result = await this._gt.mailMarkRead(id);
    if (!result.ok) throw new Error(result.error || 'Failed to mark as read');
    return { success: true, id, read: true };
  }

  async markUnread(id) {
    const result = await this._gt.mailMarkUnread(id);
    if (!result.ok) throw new Error(result.error || 'Failed to mark as unread');
    return { success: true, id, read: false };
  }

  async delete(id) {
    const result = await this._gt.mailDelete(id);
    if (!result.ok) throw new Error(result.error || 'Failed to delete mail');
    this._cache?.del?.('mail');
    return { success: true, id };
  }

  async allFromFeed({ page = 1, limit = 50 } = {}) {
    const feedPath = path.join(this._gtRoot, '.events.jsonl');

    try {
      await fsPromises.access(feedPath);
    } catch {
      this._feedCache.events = null;
      return { items: [], total: 0, page, limit, hasMore: false };
    }

    const mailEvents = await this._loadFeedEvents(feedPath);
    const offset = (page - 1) * limit;
    const total = mailEvents.length;
    const paginatedItems = mailEvents.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { items: paginatedItems, total, page, limit, hasMore };
  }

  async _loadFeedEvents(feedPath) {
    const stats = await fsPromises.stat(feedPath);
    if (this._feedCache.events &&
        this._feedCache.mtimeMs === stats.mtimeMs &&
        this._feedCache.size === stats.size) {
      return this._feedCache.events;
    }

    const fileStream = fs.createReadStream(feedPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const mailEvents = [];
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === 'mail') {
          mailEvents.push({
            id: `feed-${event.ts}-${mailEvents.length}`,
            from: event.actor || 'unknown',
            to: event.payload?.to || 'unknown',
            subject: event.payload?.subject || event.summary || '(No Subject)',
            body: event.payload?.body || event.payload?.message || '',
            timestamp: event.ts,
            read: true,
            priority: event.payload?.priority || 'normal',
            feedEvent: true,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    mailEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    this._feedCache.events = mailEvents;
    this._feedCache.mtimeMs = stats.mtimeMs;
    this._feedCache.size = stats.size;

    return mailEvents;
  }
}
