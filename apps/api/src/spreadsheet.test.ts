import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
});