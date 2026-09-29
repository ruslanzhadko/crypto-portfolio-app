import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from '@/lib/db/prisma';
import { GET } from './route';

const queryRaw = vi.mocked(prisma.$queryRaw);

beforeEach(() => vi.clearAllMocks());

describe('GET /api/health', () => {
  it('checks application liveness without waking the database', async () => {
    const response = await GET(new NextRequest('http://localhost/api/health'));

    expect(response.status).toBe(200);
    expect((await response.json()).db).toBe('unchecked');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('checks the database only when explicitly requested', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const response = await GET(new NextRequest('http://localhost/api/health?db=1'));

    expect(response.status).toBe(200);
    expect((await response.json()).db).toBe('up');
    expect(queryRaw).toHaveBeenCalledOnce();
  });
});
