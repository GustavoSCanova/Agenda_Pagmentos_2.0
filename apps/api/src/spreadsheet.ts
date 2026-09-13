import * as XLSX from 'xlsx';
import type { Transaction, TransactionType } from '@a-new-project/shared';

export type ImportedTransaction = Omit<Transaction, 'id'>;

export type RejectedSpreadsheetRow = {
  row: number;
  message: string;
};

export type SpreadsheetImport = {
  transactions: ImportedTransaction[];
  rejectedRows: RejectedSpreadsheetRow[];
};

const columns = ['Título', 'Valor', 'Tipo', 'Categoria', 'Data', 'Descrição'];

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getValue = (row: Record<string, unknown>, names: string[]) => {
  const entry = Object.entries(row).find(([key]) => names.includes(normalizeHeader(key)));
  return entry?.[1];
};

const normalizeDate = (value: unknown) => {
  const date = String(value ?? '').trim();
  const isoDate = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return date;

  const brazilianDate = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianDate) return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;

  return null;
};

const normalizeAmount = (value: unknown) => {
  if (typeof value === 'number') return value;

  const rawAmount = String(value ?? '')
    .trim()
    .replace(/R\$/gi, '')
    .replace(/[^\d,.-]/g, '');

  if (!rawAmount) return Number.NaN;

  const lastComma = rawAmount.lastIndexOf(',');
  const lastDot = rawAmount.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    return Number(
      rawAmount.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '').replace(decimalSeparator, '.'),
    );
  }

  if (lastComma >= 0) {
    const decimals = rawAmount.length - lastComma - 1;
    return Number(decimals === 3 ? rawAmount.replace(',', '') : rawAmount.replace(',', '.'));
  }

  if (lastDot >= 0) {
    const decimals = rawAmount.length - lastDot - 1;
    return Number(decimals === 3 ? rawAmount.replace('.', '') : rawAmount);
  }

  return Number(rawAmount);
};

const normalizeType = (value: unknown): TransactionType | null => {
  const type = normalizeHeader(value);
  if (type === 'income' || type === 'receita') return 'income';
  if (type === 'expense' || type === 'despesa') return 'expense';
  return null;
};

export const createTransactionsSpreadsheet = (transactions: Transaction[]) => {
  const worksheet = XLSX.utils.json_to_sheet(
    transactions.map((transaction) => ({
      Título: transaction.title,
      Valor: transaction.amount,
      Tipo: transaction.type === 'income' ? 'Receita' : 'Despesa',
      Categoria: transaction.category,
      Data: transaction.date,
      Descrição: transaction.description ?? '',
    })),
    { header: columns },
  );

  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 36 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transações');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
};

export const readTransactionsSpreadsheet = (file: Buffer): SpreadsheetImport => {
  const workbook = XLSX.read(file, { type: 'buffer', cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!firstSheet) {
    throw new Error('O arquivo não possui uma planilha para importar.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  if (rows.length === 0) {
    throw new Error('O arquivo não possui transações para importar.');
  }

  const transactions: ImportedTransaction[] = [];
  const rejectedRows: RejectedSpreadsheetRow[] = [];

  rows.forEach((row, index) => {
    const title = String(getValue(row, ['titulo', 'title']) ?? '').trim();
    const amount = normalizeAmount(getValue(row, ['valor', 'amount']));
    const type = normalizeType(getValue(row, ['tipo', 'type']));
    const category = String(getValue(row, ['categoria', 'category']) ?? '').trim();
    const date = normalizeDate(getValue(row, ['data', 'date']));
    const description = String(getValue(row, ['descricao', 'description']) ?? '').trim();
    const rowNumber = index + 2;

    if (!title || !Number.isFinite(amount) || amount <= 0 || !type || !category || !date) {
      rejectedRows.push({
        row: rowNumber,
        message: 'Preencha título, valor positivo, tipo, categoria e data (AAAA-MM-DD ou DD/MM/AAAA).',
      });
      return;
    }

    transactions.push({
      title,
      amount,
      type,
      category,
      date,
      description: description || undefined,
    });
  });

  return { transactions, rejectedRows };
};