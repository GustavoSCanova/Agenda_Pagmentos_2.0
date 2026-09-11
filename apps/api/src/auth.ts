import crypto from 'node:crypto';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role?: 'admin';
};

const JWT_SECRET = process.env.JWT_SECRET ?? 'finance-dev-secret';

const base64UrlEncode = (value: string) =>
  Buffer.from(value).toString('base64url');

const base64UrlDecode = (value: string) =>
  Buffer.from(value, 'base64url').toString('utf8');

export const createAuthToken = (user: AuthUser) => {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const payload = JSON.stringify({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
  });

  const signingInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
};

export const verifyAuthToken = (token: string) => {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Token inválido.');
  }

  const [header, payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expectedSignature) {
    throw new Error('Assinatura inválida.');
  }

  const parsedPayload = JSON.parse(base64UrlDecode(payload)) as {
    sub: string;
    name: string;
    email: string;
    role?: 'admin';
  };

  return {
    id: parsedPayload.sub,
    name: parsedPayload.name,
    email: parsedPayload.email,
    role: parsedPayload.role,
  };
};
