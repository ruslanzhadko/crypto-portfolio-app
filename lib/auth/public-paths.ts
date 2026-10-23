export function isPublicPath(path: string): boolean {
  return (
    path === '/' ||
    path === '/feed' ||
    path === '/changelog' ||
    path === '/api/feed' ||
    path.startsWith('/api/feed/media/') ||
    path === '/api/public/market' ||
    path === '/api/market/changes' ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/health') ||
    path.startsWith('/api/cron') ||
    path === '/api/worker/activity' ||
    path === '/api/worker/alert' ||
    path === '/api/worker/wallet-sync' ||
    path === '/api/telegram/webhook'
  );
}
