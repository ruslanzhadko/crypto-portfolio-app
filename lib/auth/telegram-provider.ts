import type { OIDCConfig } from 'next-auth/providers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const telegramKeys = createRemoteJWKSet(
  new URL('https://oauth.telegram.org/.well-known/jwks.json'),
  { timeoutDuration: 5000 },
);

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
      params: { scope: 'openid profile telegram:bot_access' },
    },
    // Telegram has no userinfo endpoint. Auth.js beta.32's discovery callback
    // incorrectly requires one even for OIDC. Explicit token configuration
    // avoids that branch; the profile comes from the validated ID token.
    token: 'https://oauth.telegram.org/token',
    idToken: true,
    checks: ['pkce', 'state'],
    client: { token_endpoint_auth_method: 'client_secret_basic' },
    async profile(profile, tokens) {
      if (!tokens.id_token) throw new Error('Telegram ID token is missing');
      const verified = await jwtVerify(tokens.id_token, telegramKeys, {
        issuer: 'https://oauth.telegram.org',
        audience: process.env.AUTH_TELEGRAM_ID,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['sub', 'iat', 'exp'],
      });
      if (verified.payload.sub !== profile.sub)
        throw new Error('Telegram identity mismatch');
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
