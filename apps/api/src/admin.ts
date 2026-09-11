import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export type AdminCredentials = {
  email: string;
  password: string;
};

const configPath = fileURLToPath(new URL('../admin.local.json', import.meta.url));

const getAdminCredentials = (): AdminCredentials => {
  if (!fs.existsSync(configPath)) {
    throw new Error('Administrador não configurado. Crie admin.local.json a partir de admin.example.json.');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<AdminCredentials>;

  if (!config.email || !config.password) {
    throw new Error('admin.local.json deve conter e-mail e senha do administrador.');
  }

  return { email: config.email.trim().toLowerCase(), password: config.password };
};

const safelyMatches = (provided: string, expected: string) => {
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
};

export const verifyAdminCredentials = (email: string, password: string) => {
  const admin = getAdminCredentials();
  return admin.email === email.trim().toLowerCase() && safelyMatches(password, admin.password);
};