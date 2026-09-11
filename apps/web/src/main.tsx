import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import type { Summary, Transaction } from '@a-new-project/shared';
import { clearToken, getToken, saveToken } from './auth';

const emptyForm = {
  title: '',
  amount: '',
  category: '',
  type: 'expense',
  description: '',
  date: new Date().toISOString().slice(0, 10),
};

const emptyAuth = {
  name: '',
  email: '',
  password: '',
};

type SessionUser = { id: string; name: string; email: string; role?: 'admin' };

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0, balance: 0 });
  const [form, setForm] = useState(emptyForm);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [adminLogin, setAdminLogin] = useState(false);
  const [authData, setAuthData] = useState(emptyAuth);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [adminView, setAdminView] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{ title: string; amount: number; type: 'income' | 'expense'; category: string; date: string; description?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<string | null>(null);
  const [deleteUserPassword, setDeleteUserPassword] = useState('');
  const [adminUserEdit, setAdminUserEdit] = useState<{ id: string; name: string; email: string; password: string } | null>(null);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [adminUserDelete, setAdminUserDelete] = useState<{ id: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [adminData, setAdminData] = useState<{ users: Array<{ id: string; name: string; email: string }>; transactions: Array<{
    id: string;
    userId: string;
    title: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    date: string;
    description?: string;
    userName: string;
    userEmail: string;
  }> } | null>(null);

  const loadData = async (authToken: string) => {
    const [transactionsResponse, summaryResponse] = await Promise.all([
      fetch('/api/transactions', {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
      fetch('/api/summary', {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    ]);

    if (!transactionsResponse.ok || !summaryResponse.ok) {
      clearToken();
      setToken(null);
      setUser(null);
      return;
    }

    const data = await transactionsResponse.json();
    const summaryData = await summaryResponse.json();

    setTransactions(data);
    setSummary(summaryData);
  };

  useEffect(() => {
    const savedToken = getToken();

    if (!savedToken) {
      return;
    }

    setToken(savedToken);

    const fetchUser = async () => {
      const response = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });

      if (response.ok) {
        const payload = await response.json();
        setUser(payload.user);
        void loadData(savedToken);
        void loadAdminData(savedToken);
      }
    };

    void fetchUser();
  }, []);

  useEffect(() => {
    if (token) {
      void loadAdminData(token);
    }
  }, [token]);

  const handleAuthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setAuthData((current) => ({ ...current, [name]: value }));
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const endpoint = adminLogin ? '/api/auth/admin/login' : authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload =
      adminLogin || authMode === 'login'
        ? { email: authData.email, password: authData.password }
        : { name: authData.name, email: authData.email, password: authData.password };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.message ?? 'Erro de autenticação.');
      return;
    }

    saveToken(result.token);
    setUser(result.user);
    setToken(result.token);
    setAdminView(result.user.role === 'admin');
    setAuthData(emptyAuth);
    void loadData(result.token);
    void loadAdminData(result.token);
  };

  const handleAdminUserUpdate = async () => {
    if (!token || !adminUserEdit) return;

    const response = await fetch(`/api/admin/users/${adminUserEdit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        email: adminUserEdit.email,
        ...(adminUserEdit.password ? { password: adminUserEdit.password } : {}),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      alert(result.message ?? 'Não foi possível atualizar o usuário.');
      return;
    }

    setAdminUserEdit(null);
    void loadAdminData(token);
  };

  const handleAdminUserDelete = async () => {
    if (!token || !adminUserDelete) return;

    const response = await fetch(`/api/admin/users/${adminUserDelete.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();

    if (!response.ok) {
      alert(result.message ?? 'Não foi possível excluir o usuário.');
      return;
    }

    if (selectedAdminUserId === adminUserDelete.id) {
      setSelectedAdminUserId(null);
    }
    setAdminUserDelete(null);
    void loadAdminData(token);
  };

  const loadAdminData = async (authToken: string) => {
    const response = await fetch('/api/admin', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    setAdminData(payload);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      alert('Você precisa estar autenticado.');
      return;
    }

    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: form.title,
        amount: Number(form.amount),
        type: form.type,
        category: form.category,
        date: form.date,
        description: form.description,
      }),
    });

    if (response.ok) {
      setForm(emptyForm);
      void loadData(token);
      void loadAdminData(token);
    }
  };

  const handleEditStart = (transaction: Transaction) => {
    setEditFormData({
      title: transaction.title,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      date: transaction.date,
      description: transaction.description,
    });
    setEditingId(transaction.id);
  };

  const handleEditChange = (field: string, value: string | number) => {
    setEditFormData((current) => {
      if (!current) return current;
      return { ...current, [field]: value };
    });
  };

  const handleEditTransaction = async () => {
    if (!editingId || !editFormData || !token) {
      return;
    }

    const response = await fetch(`/api/transactions/${editingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editFormData),
    });

    if (response.ok) {
      setEditingId(null);
      setEditFormData(null);
      void loadData(token);
      void loadAdminData(token);
    } else {
      alert('Erro ao atualizar transação.');
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!token) {
      return;
    }

    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      setDeleteConfirm(null);
      void loadData(token);
      void loadAdminData(token);
    } else {
      alert('Erro ao excluir transação.');
    }
  };

  const handleDeleteUser = async () => {
    if (!token || !deleteUserConfirm) {
      return;
    }

    const response = await fetch(`/api/users/${deleteUserConfirm}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password: deleteUserPassword }),
    });

    if (response.ok) {
      setDeleteUserConfirm(null);
      setDeleteUserPassword('');
      // Clear token and go to login since user is deleted
      clearToken();
      setToken(null);
      setUser(null);
      alert('Usuário deletado com sucesso.');
    } else {
      const error = await response.json();
      alert(error.message || 'Erro ao deletar usuário.');
    }
  };

  const handleExport = async () => {
    if (!token) return;

    const response = await fetch('/api/transactions/export', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      alert('Não foi possível exportar as transações.');
      return;
    }

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transacoes.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !token) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setImporting(true);
      const response = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        alert(result.message ?? 'Não foi possível importar o arquivo.');
        return;
      }

      const rejected = result.rejectedRows?.length
        ? ` ${result.rejectedRows.length} linha(s) foram ignoradas por dados inválidos.`
        : '';
      alert(`${result.imported} transação(ões) importada(s).${rejected}`);
      void loadData(token);
      void loadAdminData(token);
    } catch {
      alert('Não foi possível importar o arquivo.');
    } finally {
      setImporting(false);
    }
  };

  const logout = () => {
    clearToken();
    setToken(null);
    setUser(null);
    setTransactions([]);
    setSummary({ income: 0, expense: 0, balance: 0 });
    setAdminView(false);
    setAdminData(null);
  };

  if (!token || !user) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Agenda de Pagamentos 2.0</p>
          <h1>{adminLogin ? 'Acesso administrativo' : authMode === 'login' ? 'Acessar conta' : 'Criar conta'}</h1>

          {adminLogin ? (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <label>E-mail do administrador<input type="email" name="email" value={authData.email} onChange={handleAuthChange} required /></label>
              <label>Senha do administrador<input type="password" name="password" value={authData.password} onChange={handleAuthChange} required /></label>
              <button type="submit">Entrar como administrador</button>
              <button type="button" className="text-button" onClick={() => setAdminLogin(false)}>Voltar</button>
            </form>
          ) : (
            <>
              <div className="mode-switch">
                <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
                <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Registrar</button>
              </div>
              <form onSubmit={handleAuthSubmit} className="auth-form">
                {authMode === 'register' && <label>Nome<input name="name" value={authData.name} onChange={handleAuthChange} required /></label>}
                <label>E-mail<input type="email" name="email" value={authData.email} onChange={handleAuthChange} required /></label>
                <label>Senha<input type="password" name="password" value={authData.password} onChange={handleAuthChange} required /></label>
                <button type="submit">{authMode === 'login' ? 'Entrar' : 'Registrar'}</button>
                {authMode === 'login' && <button type="button" className="text-button" onClick={() => setAdminLogin(true)}>Acesso administrador</button>}
              </form>
            </>
          )}
        </div>

      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Agenda de Pagamentos 2.0</p>
          <h1>{adminView ? 'Painel administrativo' : 'Dashboard financeiro'}</h1>
          <p className="user-label">Olá, {user.name}</p>
        </div>
        <div className="header-actions">
          {user.role === 'admin' && <button type="button" className="secondary-button" onClick={() => setAdminView((value) => !value)}>{adminView ? 'Voltar' : 'Admin'}</button>}
          <button type="button" className="logout-button" onClick={logout}>Sair</button>
        </div>
      </header>

      {adminView ? (
        <section className="admin-panel">
          <div className="card admin-card">
            <h2>Usuários</h2>
            <ul className="admin-list">
              {(adminData?.users ?? []).map((item) => (
                <li key={item.id} className={selectedAdminUserId === item.id ? 'selected-admin-user' : ''}>
                  <button type="button" className="admin-user-select" onClick={() => setSelectedAdminUserId(item.id)}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.email}</span>
                    </div>
                  </button>
                  <div className="admin-user-actions">
                    <button type="button" className="secondary-button" onClick={() => setAdminUserEdit({ id: item.id, name: item.name, email: item.email, password: '' })}>Editar</button>
                    <button type="button" className="danger-button" onClick={() => setAdminUserDelete({ id: item.id, name: item.name })}>Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card admin-card">
            <h2>{selectedAdminUserId ? `Transações de ${(adminData?.users ?? []).find((item) => item.id === selectedAdminUserId)?.name ?? 'usuário'}` : 'Selecione um usuário'}</h2>
            <ul className="admin-list admin-transactions">
              {(adminData?.transactions ?? []).filter((item) => item.userId === selectedAdminUserId).map((item) => (
                <li key={item.id} className="admin-transaction-item">
                  <div className="transaction-info-admin">
                    <strong>{item.title}</strong>
                    <span>{item.userName} · {item.category}</span>
                  </div>
                  <div className="transaction-meta-admin">
                    <span>{item.type === 'income' ? 'Receita' : 'Despesa'}</span>
                    <strong>R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </li>
              ))}
            </ul>
            {selectedAdminUserId && (adminData?.transactions ?? []).every((item) => item.userId !== selectedAdminUserId) && <p className="empty-admin-state">Este usuário ainda não possui transações.</p>}
            {!selectedAdminUserId && <p className="empty-admin-state">Clique em um usuário para consultar seus dados.</p>}
          </div>
        </section>
      ) : (
        <>
          <section className="summary-grid">
        <article className="card income">
          <span>Receitas</span>
          <strong>R$ {summary.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        </article>
        <article className="card expense">
          <span>Despesas</span>
          <strong>R$ {summary.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        </article>
        <article className="card balance">
          <span>Saldo</span>
          <strong>R$ {summary.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        </article>
      </section>

      <section className="content-grid">
        <form className="card form-card" onSubmit={handleSubmit}>
          <h2>Nova transação</h2>

          <label>
            Título
            <input name="title" value={form.title} onChange={handleChange} placeholder="Ex: Salário" required />
          </label>

          <div className="inline-fields">
            <label>
              Valor
              <input name="amount" type="number" min="0" step="0.01" value={form.amount} onChange={handleChange} required />
            </label>

            <label>
              Tipo
              <select name="type" value={form.type} onChange={handleChange}>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
            </label>
          </div>

          <label>
            Categoria
            <input name="category" value={form.category} onChange={handleChange} placeholder="Ex: Alimentação" required />
          </label>

          <div className="inline-fields">
            <label>
              Data
              <input name="date" type="date" value={form.date} onChange={handleChange} required />
            </label>
          </div>

          <label>
            Descrição
            <input name="description" value={form.description} onChange={handleChange} placeholder="Opcional" />
          </label>

          <button type="submit">Salvar transação</button>
        </form>

        <div className="card list-card">
          <div className="list-header">
            <h2>Histórico</h2>
            <div className="data-actions">
              <button type="button" className="secondary-button" onClick={() => void handleExport()}>
                Exportar Excel
              </button>
              <label className="import-button">
                {importing ? 'Importando...' : 'Importar arquivo'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => void handleImport(event)}
                  disabled={importing}
                />
              </label>
            </div>
          </div>
          <ul className="transaction-list">
            {transactions.map((transaction) => (
              <li key={transaction.id} className={transaction.type === 'income' ? 'income-item' : 'expense-item'}>
                <div className="transaction-item-content">
                  <div>
                    <strong>{transaction.title}</strong>
                    <small>
                      {transaction.category} · {transaction.date}
                    </small>
                  </div>
                  <span className="transaction-amount">
                    {transaction.type === 'income' ? '+' : '-'}R${' '}
                    {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="transaction-actions">
                  <button
                    type="button"
                    className="action-button edit-action"
                    onClick={() => handleEditStart(transaction)}
                    title="Editar transação"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="action-button delete-action"
                    onClick={() => setDeleteConfirm(transaction.id)}
                    title="Deletar transação"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
          </section>
        </>
      )}

      {deleteUserConfirm && (
        <div className="modal-overlay" onClick={() => { setDeleteUserConfirm(null); setDeleteUserPassword(''); }}>
          <div className="modal-box modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Deletar Conta</h3>
            <p>Tem certeza que deseja deletar sua conta? Esta ação não pode ser desfeita e deletará todos os seus dados.</p>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="delete-password" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Digite sua senha para confirmar:
              </label>
              <input
                id="delete-password"
                type="password"
                className="form-input"
                value={deleteUserPassword}
                onChange={(e) => setDeleteUserPassword(e.target.value)}
                placeholder="Sua senha"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => { setDeleteUserConfirm(null); setDeleteUserPassword(''); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void handleDeleteUser()}
                disabled={!deleteUserPassword}
              >
                Deletar Conta
              </button>
            </div>
          </div>
        </div>
      )}

      {adminUserEdit && (
        <div className="modal-overlay" onClick={() => setAdminUserEdit(null)}>
          <div className="modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><h3>Editar {adminUserEdit.name}</h3><button type="button" className="modal-close" onClick={() => setAdminUserEdit(null)}>✕</button></div>
            <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void handleAdminUserUpdate(); }}>
              <label>E-mail<input type="email" value={adminUserEdit.email} onChange={(event) => setAdminUserEdit((current) => current && { ...current, email: event.target.value })} required /></label>
              <label>Nova senha<input type="password" minLength={6} value={adminUserEdit.password} onChange={(event) => setAdminUserEdit((current) => current && { ...current, password: event.target.value })} placeholder="Deixe vazio para manter" /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdminUserEdit(null)}>Cancelar</button><button type="submit" className="primary-button">Salvar</button></div>
            </form>
          </div>
        </div>
      )}

      {adminUserDelete && (
        <div className="modal-overlay" onClick={() => setAdminUserDelete(null)}>
          <div className="modal-box modal-confirm" onClick={(event) => event.stopPropagation()}>
            <h3>Excluir usuário</h3>
            <p>Deseja excluir {adminUserDelete.name}? Todas as transações desta conta serão apagadas permanentemente.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAdminUserDelete(null)}>Cancelar</button>
              <button type="button" className="danger-button" onClick={() => void handleAdminUserDelete()}>Excluir usuário</button>
            </div>
          </div>
        </div>
      )}

      {editingId && editFormData && (
        <div className="modal-overlay" onClick={() => { setEditingId(null); setEditFormData(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar transação</h3>
              <button type="button" className="modal-close" onClick={() => { setEditingId(null); setEditFormData(null); }}>✕</button>
            </div>
            <form className="modal-form">
              <label>
                Título
                <input
                  type="text"
                  value={editFormData.title}
                  onChange={(event) => handleEditChange('title', event.target.value)}
                />
              </label>
              <label>
                Valor
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editFormData.amount}
                  onChange={(event) => handleEditChange('amount', Number(event.target.value))}
                />
              </label>
              <label>
                Tipo
                <select
                  value={editFormData.type}
                  onChange={(event) => handleEditChange('type', event.target.value)}
                >
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </label>
              <label>
                Categoria
                <input
                  type="text"
                  value={editFormData.category}
                  onChange={(event) => handleEditChange('category', event.target.value)}
                />
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={editFormData.date}
                  onChange={(event) => handleEditChange('date', event.target.value)}
                />
              </label>
              <label>
                Descrição
                <input
                  type="text"
                  value={editFormData.description ?? ''}
                  onChange={(event) => handleEditChange('description', event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => { setEditingId(null); setEditFormData(null); }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleEditTransaction()}
                >
                  Salvar mudanças
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar exclusão</h3>
            <p>Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void handleDeleteTransaction(deleteConfirm)}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
