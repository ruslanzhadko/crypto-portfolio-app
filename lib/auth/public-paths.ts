export function isPublicPath(path: string): boolean {
  return (
    path === '/' ||
    path === '/feed' ||
    path === '/api/feed' ||
    path.startsWith('/api/feed/media/') ||
    path === '/api/public/market' ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/health') ||
    path.startsWith('/api/cron') ||
    path === '/api/telegram/webhook'
  );
}
