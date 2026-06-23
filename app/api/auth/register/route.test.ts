import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Мокаємо ПЕРЕД імпортом route.
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed:pw') },
}));

import { POST } from './route';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);
const mockHash = vi.mocked(bcrypt.hash);

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  email: 'user@example.com',
  password: 'securepass123',
  name: 'Test User',
};

// Симулюємо те, що Prisma реально повертає після select {id,email,name,role}.
// passwordHash навмисно відсутній — select його виключає на рівні Prisma.
const DB_RETURNED_USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  role: 'USER' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(null);
  mockCreate.mockResolvedValue(DB_RETURNED_USER as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/register', () => {
  describe('happy path', () => {
    it('valid payload → 201 with correct user shape', async () => {
      const res = await POST(makeRequest(VALID_PAYLOAD) as never);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.user).toMatchObject({ id: 'user-1', email: 'user@example.com', role: 'USER' });
    });

    it('create() is called with select that excludes passwordHash (leak prevention)', async () => {
      await POST(makeRequest(VALID_PAYLOAD) as never);

      const createArgs = mockCreate.mock.calls[0]![0] as {
        select?: Record<string, boolean>;
      };
      expect(createArgs.select?.passwordHash).toBeFalsy();
      expect(createArgs.select?.id).toBe(true);
      expect(createArgs.select?.email).toBe(true);
      expect(createArgs.select?.role).toBe(true);
    });

    it('create() receives bcrypt hash (cost 12), never plaintext', async () => {
      await POST(makeRequest(VALID_PAYLOAD) as never);

      expect(mockHash).toHaveBeenCalledWith(VALID_PAYLOAD.password, 12);
      const createArgs = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(createArgs.data.passwordHash).toBe('hashed:pw');
      expect(createArgs.data.password).toBeUndefined();
    });

    it('email is lowercased via Zod before DB call', async () => {
      await POST(makeRequest({ ...VALID_PAYLOAD, email: 'USER@EXAMPLE.COM' }) as never);

      const findArgs = mockFindUnique.mock.calls[0]![0] as { where: { email: string } };
      expect(findArgs.where.email).toBe('user@example.com');

      const createArgs = mockCreate.mock.calls[0]![0] as { data: { email: string } };
      expect(createArgs.data.email).toBe('user@example.com');
    });

    it('name omitted → create called with name: null', async () => {
      const { name: _n, ...withoutName } = VALID_PAYLOAD;
      const res = await POST(makeRequest(withoutName) as never);

      expect(res.status).toBe(201);
      const createArgs = mockCreate.mock.calls[0]![0] as { data: { name: unknown } };
      expect(createArgs.data.name).toBeNull();
    });
  });

  describe('admin role assignment', () => {
    it('ADMIN_EMAIL matches (case-insensitive) → role=ADMIN stored', async () => {
      vi.stubEnv('ADMIN_EMAIL', 'Admin@Site.com');

      await POST(makeRequest({ ...VALID_PAYLOAD, email: 'admin@site.com' }) as never);

      const createArgs = mockCreate.mock.calls[0]![0] as { data: { role: string } };
      expect(createArgs.data.role).toBe('ADMIN');
    });

    it('email differs from ADMIN_EMAIL → role=USER', async () => {
      vi.stubEnv('ADMIN_EMAIL', 'other@site.com');

      await POST(makeRequest(VALID_PAYLOAD) as never);

      const createArgs = mockCreate.mock.calls[0]![0] as { data: { role: string } };
      expect(createArgs.data.role).toBe('USER');
    });

    it('ADMIN_EMAIL not set → everyone gets role=USER', async () => {
      delete process.env.ADMIN_EMAIL;

      await POST(makeRequest(VALID_PAYLOAD) as never);

      const createArgs = mockCreate.mock.calls[0]![0] as { data: { role: string } };
      expect(createArgs.data.role).toBe('USER');
    });
  });

  describe('validation errors (DB not called)', () => {
    it('invalid email → 400 BAD_REQUEST', async () => {
      const res = await POST(makeRequest({ ...VALID_PAYLOAD, email: 'not-an-email' }) as never);

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('BAD_REQUEST');
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('password too short (7 chars, min=8) → 400', async () => {
      const res = await POST(makeRequest({ ...VALID_PAYLOAD, password: '1234567' }) as never);

      expect(res.status).toBe(400);
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('password too long (101 chars, max=100) → 400', async () => {
      const res = await POST(makeRequest({ ...VALID_PAYLOAD, password: 'a'.repeat(101) }) as never);

      expect(res.status).toBe(400);
    });

    it('name empty string (min=1) → 400', async () => {
      const res = await POST(makeRequest({ ...VALID_PAYLOAD, name: '' }) as never);

      expect(res.status).toBe(400);
    });

    it('name too long (101 chars, max=100) → 400', async () => {
      const res = await POST(makeRequest({ ...VALID_PAYLOAD, name: 'a'.repeat(101) }) as never);

      expect(res.status).toBe(400);
    });

    it('invalid JSON body → 400', async () => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      });
      const res = await POST(req as never);

      expect(res.status).toBe(400);
    });
  });

  describe('conflict and DB errors', () => {
    it('duplicate email → 409 CONFLICT, create not called', async () => {
      mockFindUnique.mockResolvedValue({ id: 'existing' } as never);

      const res = await POST(makeRequest(VALID_PAYLOAD) as never);
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('findUnique throws → 500 INTERNAL_ERROR', async () => {
      mockFindUnique.mockRejectedValue(new Error('DB timeout'));

      const res = await POST(makeRequest(VALID_PAYLOAD) as never);

      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
    });

    it('create throws → 500 INTERNAL_ERROR', async () => {
      mockCreate.mockRejectedValue(new Error('DB connection lost'));

      const res = await POST(makeRequest(VALID_PAYLOAD) as never);

      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
    });
  });
});
