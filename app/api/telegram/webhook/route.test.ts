import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/services/telegram', () => ({
  replyToUpdate: vi.fn().mockResolvedValue(undefined),
  sendWithKeyboard: vi.fn().mockResolvedValue(undefined),
  editWithKeyboard: vi.fn().mockResolvedValue(undefined),
  answerCallback: vi.fn().mockResolvedValue(undefined),
}));
const stats = vi.hoisted(() => ({ user: vi.fn(), message: vi.fn() }));
vi.mock('@/lib/telegram/stats-bot', async (original) => ({
  ...(await original<typeof import('@/lib/telegram/stats-bot')>()),
  chatUser: stats.user,
  statsMessage: stats.message,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
const positions = vi.hoisted(() => ({
  snapshot: vi.fn(),
  online: vi.fn(),
  cooling: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@/lib/telegram/positions-bot', async (original) => ({
  ...(await original<typeof import('@/lib/telegram/positions-bot')>()),
  positionsSnapshot: positions.snapshot,
  workerOnline: positions.online,
}));
vi.mock('@/lib/positions/view-requests', () => ({
  positionViewCooling: positions.cooling,
  requestPositionView: positions.request,
}));

import { POST } from './route';
import { answerCallback, editWithKeyboard, replyToUpdate, sendWithKeyboard } from '@/lib/services/telegram';

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

    it('/start without firstName → generic greeting Привет!', async () => {
      await POST(makeWebhookRequest(makeUpdate('/start', 222), VALID_SECRET) as never);

      const [chatId, text] = mockReply.mock.calls[0]!;
      expect(chatId).toBe(222);
      expect(text).toContain('Привет!');
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

describe('trading statistics commands', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = VALID_SECRET;
    stats.user.mockResolvedValue({ id: 'u1' });
    stats.message.mockResolvedValue('stats text');
  });

  it('answers /week with the statistics and period buttons', async () => {
    await POST(makeWebhookRequest(makeUpdate('/week'), VALID_SECRET) as never);
    expect(stats.message).toHaveBeenCalledWith('u1', '7d');
    expect(vi.mocked(sendWithKeyboard)).toHaveBeenCalledWith(12345, 'stats text', expect.any(Array));
  });

  it('tells an unlinked chat how to link it', async () => {
    stats.user.mockResolvedValue(null);
    await POST(makeWebhookRequest(makeUpdate('/stats'), VALID_SECRET) as never);
    expect(vi.mocked(sendWithKeyboard)).not.toHaveBeenCalled();
    expect(mockReply).toHaveBeenCalledWith(12345, expect.stringContaining('не привязан'));
  });

  it('redraws the message in place when a period button is pressed', async () => {
    const update = {
      update_id: 2,
      callback_query: { id: 'cb1', data: 'stats:all', message: { chat: { id: 12345 }, message_id: 77 } },
    };
    await POST(makeWebhookRequest(update, VALID_SECRET) as never);
    expect(stats.message).toHaveBeenCalledWith('u1', 'all');
    expect(vi.mocked(editWithKeyboard)).toHaveBeenCalledWith(12345, 77, 'stats text', expect.any(Array));
    expect(vi.mocked(answerCallback)).toHaveBeenCalledWith('cb1', undefined);
  });
});

describe('/positions', () => {
  const snapshot = (age: number) => ({
    connections: [{ id: 'c', exchange: 'binance', positionsAt: Date.now() - age }],
    positions: [],
  });
  const press = {
    update_id: 3,
    callback_query: { id: 'cb2', data: 'pos:refresh', message: { chat: { id: 12345 }, message_id: 88 } },
  };

  beforeEach(() => {
    stats.user.mockResolvedValue({ id: 'u1' });
    positions.snapshot.mockResolvedValue(snapshot(5_000));
    positions.online.mockResolvedValue(true);
    positions.cooling.mockResolvedValue(false);
    positions.request.mockResolvedValue(true);
    vi.mocked(sendWithKeyboard).mockResolvedValue(55);
  });

  it('answers with fresh stored data without asking the worker', async () => {
    await POST(makeWebhookRequest(makeUpdate('/positions'), VALID_SECRET) as never);
    expect(vi.mocked(sendWithKeyboard)).toHaveBeenCalledOnce();
    expect(positions.request).not.toHaveBeenCalled();
  });

  it('asks the worker to edit the sent message when the data is old', async () => {
    positions.snapshot.mockResolvedValue(snapshot(600_000));
    await POST(makeWebhookRequest(makeUpdate('/positions'), VALID_SECRET) as never);
    expect(vi.mocked(sendWithKeyboard).mock.calls[0]![1]).toContain('Запросил свежие данные');
    expect(positions.request).toHaveBeenCalledWith({ userId: 'u1', chatId: 12345, messageId: 55 });
  });

  it('promises no refresh while the worker is offline', async () => {
    positions.snapshot.mockResolvedValue(snapshot(600_000));
    positions.online.mockResolvedValue(false);
    await POST(makeWebhookRequest(makeUpdate('/positions'), VALID_SECRET) as never);
    expect(vi.mocked(sendWithKeyboard).mock.calls[0]![1]).not.toContain('Запросил');
    expect(positions.request).not.toHaveBeenCalled();
  });

  it('tells an unlinked chat how to link it', async () => {
    stats.user.mockResolvedValue(null);
    await POST(makeWebhookRequest(makeUpdate('/positions'), VALID_SECRET) as never);
    expect(mockReply).toHaveBeenCalledWith(12345, expect.stringContaining('не привязан'));
  });

  it('the button leaves the redraw to the worker', async () => {
    await POST(makeWebhookRequest(press, VALID_SECRET) as never);
    expect(positions.request).toHaveBeenCalledWith({ userId: 'u1', chatId: 12345, messageId: 88 });
    expect(vi.mocked(editWithKeyboard)).not.toHaveBeenCalled();
    expect(vi.mocked(answerCallback)).toHaveBeenCalledWith('cb2', expect.stringContaining('Обновляю'));
  });

  it('a repeated press touches neither the database nor the worker', async () => {
    positions.cooling.mockResolvedValue(true);
    await POST(makeWebhookRequest(press, VALID_SECRET) as never);
    expect(stats.user).not.toHaveBeenCalled();
    expect(positions.request).not.toHaveBeenCalled();
    expect(vi.mocked(answerCallback)).toHaveBeenCalledWith('cb2', expect.stringContaining('Уже обновляю'));
  });

  it('without a worker the button redraws from the database', async () => {
    positions.online.mockResolvedValue(false);
    await POST(makeWebhookRequest(press, VALID_SECRET) as never);
    expect(vi.mocked(editWithKeyboard)).toHaveBeenCalledOnce();
    expect(positions.request).not.toHaveBeenCalled();
  });
});
