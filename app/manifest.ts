import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CryptoPortfolio',
    short_name: 'CryptoPortfolio',
    description: 'Your crypto portfolio, market data and price alerts.',
    start_url: '/',
    // All locale prefixes and dashboard sections belong to the same app.
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#0a0a0f',
    icons: [{ src: '/logo2.png', sizes: '1254x1254', type: 'image/png', purpose: 'any' }],
  };
}
