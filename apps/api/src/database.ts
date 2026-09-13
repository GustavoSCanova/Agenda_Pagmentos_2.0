import sqlite3 from 'sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Transaction, TransactionType } from '@a-new-project/shared';

export type DbUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

export type PersistTransactionInput = {
  userId: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  description?: string;
};

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(path.join(dataDir, 'finance.db'));

const runAsync = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });

const getAsync = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row?: T) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });

const allAsync = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows?: T[]) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows ?? []);
    });
  });

const hashPassword = (password: string) =>
  crypto.createHash('sha256').update(password).digest('hex');

const ensureSchema = async () => {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

};

await ensureSchema();

export const createUser = async ({ name, email, password }: CreateUserInput) => {
  const id = `u-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const passwordHash = hashPassword(password);

  await runAsync(
    'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    [id, name, email, passwordHash],
  );

  return {
    id,
    name,
    email,
    passwordHash,
  };
};

export const findUserByEmail = async (email: string) => {
  const row = await getAsync<{ id: string; name: string; email: string; password_hash: string }>(
    'SELECT id, name, email, password_hash FROM users WHERE email = ?',
    [email],
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
  } satisfies DbUser;
};

export const verifyUserCredentials = async (email: string, password: string) => {
  const user = await findUserByEmail(email);

  if (!user) {
    return null;
  }

  const passwordHash = hashPassword(password);

  if (user.passwordHash !== passwordHash) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
};

export const verifyUserPasswordById = async (userId: string, password: string) => {
  const user = await getAsync<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);

  if (!user) {
    return false;
  }

  return user.password_hash === hashPassword(password);
};

export const updateUserProfile = async (userId: string, { name, password }: { name?: string; password?: string }) => {
  const user = await getAsync<{ id: string; name: string; email: string }>('SELECT id, name, email FROM users WHERE id = ?', [userId]);

  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  const updatedName = name?.trim();

  if (!updatedName && !password) {
    throw new Error('Informe um nome ou uma nova senha.');
  }

  if (password !== undefined && password.length < 6) {
    throw new Error('A nova senha deve ter ao menos seis caracteres.');
  }

  if (password) {
    await runAsync('UPDATE users SET name = ?, password_hash = ? WHERE id = ?', [
      updatedName || user.name,
      hashPassword(password),
      userId,
    ]);
  } else {
    await runAsync('UPDATE users SET name = ? WHERE id = ?', [updatedName, userId]);
  }

  return { id: user.id, name: updatedName || user.name, email: user.email };
};

export const deleteUserByAdmin = async (userId: string) => {
  const user = await getAsync<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);

  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  await runAsync('DELETE FROM transactions WHERE user_id = ?', [userId]);
  await runAsync('DELETE FROM users WHERE id = ?', [userId]);
  return true;
};

export const deleteTransactionsByUser = async (userId: string) => {
  const user = await getAsync<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);

  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  await runAsync('DELETE FROM transactions WHERE user_id = ?', [userId]);
  return true;
};

export const listTransactions = async (userId: string): Promise<Transaction[]> => {
  const rows = await allAsync<{
    id: string;
    title: string;
    amount: number;
    type: TransactionType;
    category: string;
    date: string;
    description?: string | null;
  }>(
    'SELECT id, title, amount, type, category, date, description FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC',
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    date: row.date,
    description: row.description ?? undefined,
  }));
};

export const listUsers = async () => {
  const rows = await allAsync<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM users ORDER BY name ASC',
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
  }));
};

export const listAllTransactions = async () => {
  const rows = await allAsync<{
    id: string;
    user_id: string;
    title: string;
    amount: number;
    type: TransactionType;
    category: string;
    date: string;
    description?: string | null;
    user_name: string;
    user_email: string;
  }>(
    `SELECT t.id, t.user_id, t.title, t.amount, t.type, t.category, t.date, t.description, u.name AS user_name, u.email AS user_email
     FROM transactions t
     INNER JOIN users u ON u.id = t.user_id
     ORDER BY t.date DESC, t.id DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    date: row.date,
    description: row.description ?? undefined,
    userName: row.user_name,
    userEmail: row.user_email,
  }));
};

export const persistTransaction = async ({
  userId,
  title,
  amount,
  type,
  category,
  date,
  description,
}: PersistTransactionInput) => {
  const id = `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await runAsync(
    'INSERT INTO transactions (id, user_id, title, amount, type, category, date, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, title, Number(amount), type, category, date, description ?? null],
  );

  return {
    id,
    title,
    amount: Number(amount),
    type,
    category,
    date,
    description,
  } satisfies Transaction;
};

export const replaceTransactionsForUser = async (
  userId: string,
  incomingTransactions: Omit<Transaction, 'id'>[],
) => {
  await runAsync('DELETE FROM transactions WHERE user_id = ?', [userId]);

  const inserted: Transaction[] = [];

  for (const transaction of incomingTransactions) {
    const created = await persistTransaction({
      userId,
      title: transaction.title,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      date: transaction.date,
      description: transaction.description,
    });

    inserted.push(created);
  }

  return inserted;
};

export const updateTransactionById = async (
  id: string,
  userId: string,
  updates: Partial<Omit<Transaction, 'id'>>,
) => {
  const existing = await getAsync<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM transactions WHERE id = ? AND user_id = ?',
    [id, userId],
  );

  if (!existing) {
    throw new Error('Transação não encontrada para este usuário.');
  }

  const title = updates.title ?? '';
  const amount = Number(updates.amount ?? 0);
  const type = updates.type ?? 'expense';
  const category = updates.category ?? '';
  const date = updates.date ?? new Date().toISOString().slice(0, 10);
  const description = updates.description ?? null;

  await runAsync(
    'UPDATE transactions SET title = ?, amount = ?, type = ?, category = ?, date = ?, description = ? WHERE id = ? AND user_id = ?',
    [title, amount, type, category, date, description, id, userId],
  );

  return {
    id,
    title,
    amount,
    type,
    category,
    date,
    description: description ?? undefined,
  } satisfies Transaction;
};

export const deleteTransactionById = async (id: string, userId: string) => {
  const result = await runAsync(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?',
    [id, userId],
  );

  return true;
};

export const deleteUserById = async (userId: string, password: string) => {
  const user = await getAsync<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE id = ?',
    [userId],
  );

  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  const passwordHash = hashPassword(password);

  if (user.password_hash !== passwordHash) {
    throw new Error('Senha incorreta.');
  }

  // Delete all transactions first
  await runAsync(
    'DELETE FROM transactions WHERE user_id = ?',
    [userId],
  );

  // Then delete the user
  await runAsync(
    'DELETE FROM users WHERE id = ?',
    [userId],
  );

  return true;
};
