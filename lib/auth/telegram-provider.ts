import type { OIDCConfig } from 'next-auth/providers';

export function telegramProvider(): OIDCConfig<{ sub: string; name?: string }> {
  return {
    id: 'telegram',
    name: 'Telegram',
    type: 'oidc',
    issuer: 'https://oauth.telegram.org',
    clientId: process.env.AUTH_TELEGRAM_ID,
    clientSecret: process.env.AUTH_TELEGRAM_SECRET,
    authorization: {
      url: 'https://oauth.telegram.org/auth',
      params: { scope: 'openid profile' },
    },
    // Telegram has no userinfo endpoint. Auth.js beta.32's discovery callback
    // incorrectly requires one even for OIDC. Explicit token configuration
    // avoids that branch; the profile comes from the validated ID token.
    token: 'https://oauth.telegram.org/token',
    idToken: true,
    checks: ['pkce', 'state'],
    client: { token_endpoint_auth_method: 'client_secret_basic' },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? 'Telegram',
        email: null,
        role: 'USER',
        isBlocked: false,
      };
    },
  };
}
