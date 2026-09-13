import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';

import { createTransactionsSpreadsheet, readTransactionsSpreadsheet } from './spreadsheet.js';

describe('planilhas de transações', () => {
  it('exporta e relê transações no formato compatível com Excel', () => {
    const file = createTransactionsSpreadsheet([
      {
        id: 't-1',
        title: 'Salário',
        amount: 2500.5,
        type: 'income',
        category: 'Trabalho',
        date: '2026-09-10',
        description: 'Setembro',
      },
    ]);

    const result = readTransactionsSpreadsheet(file);

    assert.deepEqual(result.rejectedRows, []);
    assert.deepEqual(result.transactions, [
      {
        title: 'Salário',
        amount: 2500.5,
        type: 'income',
        category: 'Trabalho',
        date: '2026-09-10',
        description: 'Setembro',
      },
    ]);
  });

  it('interpreta valores nos formatos brasileiro e americano', () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Título', 'Valor', 'Tipo', 'Categoria', 'Data', 'Descrição'],
      ['Brasileiro', 'R$ 2.479,76', 'Receita', 'Teste', '10/09/2026', ''],
      ['Americano', '$ 2,479.76', 'Despesa', 'Teste', '2026-09-11', ''],
      ['Decimal simples', '2479.76', 'Despesa', 'Teste', '2026-09-12', ''],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transações');

    const result = readTransactionsSpreadsheet(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));

    assert.deepEqual(result.rejectedRows, []);
    assert.deepEqual(result.transactions.map((item) => item.amount), [2479.76, 2479.76, 2479.76]);
  });
});