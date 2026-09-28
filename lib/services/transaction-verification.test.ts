import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { transactionInitiators } from './transaction-verification';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(axios.post);
const hash = `0x${'a'.repeat(64)}`;
const otherHash = `0x${'b'.repeat(64)}`;
const from = `0x${'c'.repeat(40)}`;
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ANKR_API_KEY', 'test-key'); });

describe('parent transaction initiators', () => {
  it('checks distinct hashes using a batch and accepts replies out of order', async () => {
    post.mockResolvedValueOnce({ data: [
      { id: 1, result: { hash: otherHash, from } },
      { id: 0, result: { hash, from: from.toUpperCase().replace('0X', '0x') } },
    ] });
    const verified = await transactionInitiators([{ chainName: 'bsc', hash }, { chainName: 'bsc', hash: otherHash }, { chainName: 'bsc', hash }]);
    expect(verified.get(`bsc:${hash}`)).toBe(from);
    expect(verified.get(`bsc:${otherHash}`)).toBe(from);
    expect(post.mock.calls[0]?.[1]).toHaveLength(2);
  });
  it('does not treat failed, missing or mismatched responses as evidence', async () => {
    post.mockResolvedValueOnce({ data: [{ id: 0, result: { hash: otherHash, from } }, { id: 1, error: { code: -1 } }] });
    expect((await transactionInitiators([{ chainName: 'bsc', hash }, { chainName: 'bsc', hash: otherHash }])).size).toBe(0);
    post.mockRejectedValueOnce(new Error('Timeout'));
    expect((await transactionInitiators([{ chainName: 'bsc', hash }])).size).toBe(0);
  });
  it('does not send invalid hashes or unsupported chains to an RPC', async () => {
    expect((await transactionInitiators([{ chainName: 'solana', hash }, { chainName: 'bsc', hash: 'bad' }])).size).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });
});
