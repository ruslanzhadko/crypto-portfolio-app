import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/services/telegram', () => ({
  replyToUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from './route';
import { replyToUpdate } from '@/lib/services/telegram';

const mockReply = vi.mocked(replyToUpdate);

const VALID_SECRET = 'super-secret-token';

function makeWebhookRequest(body: unknown, secret?: string): Request {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret !== undefined ? { 'x-telegram-bot-api-secret-token': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeUpdate(text: string, chatId = 12345, firstName?: string) {
  return {
    update_id: 1,
    message: {
      chat: { id: chatId },
      from: firstName ? { first_name: firstName } : undefined,
      text,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', VALID_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/telegram/webhook', () => {
  describe('authorization', () => {
    it('correct secret → 200, reply called', async () => {
      const res = await POST(makeWebhookRequest(makeUpdate('/id'), VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      expect(mockReply).toHaveBeenCalledOnce();
    });

    it('wrong secret → 200 (Telegram protocol), reply NOT called', async () => {
      const res = await POST(makeWebhookRequest(makeUpdate('/id'), 'wrong-secret') as never);

      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('missing secret header → 200, reply NOT called', async () => {
      const res = await POST(makeWebhookRequest(makeUpdate('/id')) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('TELEGRAM_WEBHOOK_SECRET env not set → unauthorized even with correct token', async () => {
      vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');

      const res = await POST(makeWebhookRequest(makeUpdate('/id'), VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });
  });

  describe('update parsing and malformed input', () => {
    it('invalid JSON body → 200 (swallowed), no reply', async () => {
      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': VALID_SECRET,
        },
        body: '{not json',
      });
      const res = await POST(req as never);

      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('update without message → 200, no reply', async () => {
      const res = await POST(makeWebhookRequest({ update_id: 1 }, VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('message without chat field → 200 (guard prevents crash, always-200 contract)', async () => {
      const malformed = { update_id: 1, message: { text: '/start' } }; // no chat
      const res = await POST(makeWebhookRequest(malformed, VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('message with no text field → 200, falls to unhandled branch, no reply', async () => {
      const photoUpdate = { update_id: 1, message: { chat: { id: 12345 } } }; // sticker/photo
      const res = await POST(makeWebhookRequest(photoUpdate, VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });
  });

  describe('command routing', () => {
    it('/start → reply with chatId embedded, emoji present (regression guard)', async () => {
      await POST(makeWebhookRequest(makeUpdate('/start', 99999, 'Alice'), VALID_SECRET) as never);

      expect(mockReply).toHaveBeenCalledOnce();
      const [calledChatId, calledText] = mockReply.mock.calls[0]!;
      expect(calledChatId).toBe(99999);
      expect(calledText).toContain('99999');
      expect(calledText).toContain('Alice');
      // Emoji regression: these must render as actual characters, not literal \uXXXX strings
      expect(calledText).toContain('\u{1F44B}'); // 👋
      expect(calledText).not.toContain('\\u{');  // no escaped escape sequences
    });

    it('/start with deeplink args (/start abc) → reply called (startsWith guard)', async () => {
      await POST(makeWebhookRequest(makeUpdate('/start referral123', 77777), VALID_SECRET) as never);

      expect(mockReply).toHaveBeenCalledOnce();
      const [chatId] = mockReply.mock.calls[0]!;
      expect(chatId).toBe(77777);
    });

    it('/startfoo (no space) → NOT matched as /start → unhandled, no reply', async () => {
      const res = await POST(makeWebhookRequest(makeUpdate('/startfoo'), VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('/start with HTML in firstName → escaped (XSS prevention)', async () => {
      await POST(makeWebhookRequest(makeUpdate('/start', 111, '<script>alert(1)</script>'), VALID_SECRET) as never);

      const [, text] = mockReply.mock.calls[0]!;
      expect(text).not.toContain('<script>');
      expect(text).toContain('&lt;script&gt;');
    });

    it('/start without firstName → generic greeting Привіт!', async () => {
      await POST(makeWebhookRequest(makeUpdate('/start', 222), VALID_SECRET) as never);

      const [chatId, text] = mockReply.mock.calls[0]!;
      expect(chatId).toBe(222);
      expect(text).toContain('Привіт!');
    });

    it('/id → replyToUpdate with chatId in <code> tag', async () => {
      await POST(makeWebhookRequest(makeUpdate('/id', 55555), VALID_SECRET) as never);

      expect(mockReply).toHaveBeenCalledOnce();
      const [chatId, text] = mockReply.mock.calls[0]!;
      expect(chatId).toBe(55555);
      expect(text).toContain('<code>55555</code>');
    });

    it('/chatid alias → same behavior as /id', async () => {
      await POST(makeWebhookRequest(makeUpdate('/chatid', 66666), VALID_SECRET) as never);

      expect(mockReply).toHaveBeenCalledOnce();
      const [, text] = mockReply.mock.calls[0]!;
      expect(text).toContain('66666');
    });

    it('/help → reply contains both /start and /id commands', async () => {
      await POST(makeWebhookRequest(makeUpdate('/help'), VALID_SECRET) as never);

      expect(mockReply).toHaveBeenCalledOnce();
      const [, text] = mockReply.mock.calls[0]!;
      expect(text).toContain('/start');
      expect(text).toContain('/id');
    });

    it('unhandled command → no reply, returns 200', async () => {
      const res = await POST(makeWebhookRequest(makeUpdate('/unknown'), VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('plain text (no command) → no reply, returns 200', async () => {
      const res = await POST(makeWebhookRequest(makeUpdate('Hello!'), VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect(mockReply).not.toHaveBeenCalled();
    });
  });

  describe('error resilience', () => {
    it('replyToUpdate throws → error swallowed, still returns 200', async () => {
      mockReply.mockRejectedValue(new Error('Telegram API down'));

      const res = await POST(makeWebhookRequest(makeUpdate('/id'), VALID_SECRET) as never);

      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      // Error was logged (proves .catch() ran)
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('NEXT_PUBLIC_APP_URL in /start reply', () => {
    it('app URL set → settingsUrl is full URL/settings', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');

      await POST(makeWebhookRequest(makeUpdate('/start'), VALID_SECRET) as never);

      const [, text] = mockReply.mock.calls[0]!;
      expect(text).toContain('https://app.example.com/settings');
    });

    it('app URL not set → settingsUrl is /settings (no domain prefix)', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

      await POST(makeWebhookRequest(makeUpdate('/start'), VALID_SECRET) as never);

      const [, text] = mockReply.mock.calls[0]!;
      expect(text).toContain('/settings');
      expect(text).not.toContain('https://');
    });
  });
});
