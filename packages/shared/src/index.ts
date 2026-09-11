export type User = {
  id: string;
  name: string;
  email: string;
};

export type TransactionType = 'income' | 'expense';

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  description?: string;
};

export type Summary = {
  income: number;
  expense: number;
  balance: number;
};

export const APP_NAME = 'Agenda de Pagamentos 2.0';
