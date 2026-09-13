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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'new' | 'settings' | 'admin'>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0, balance: 0 });
  const [form, setForm] = useState(emptyForm);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [adminLogin, setAdminLogin] = useState(false);
  const [authData, setAuthData] = useState(emptyAuth);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{ title: string; amount: number; type: 'income' | 'expense'; category: string; date: string; description?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<string | null>(null);
  const [deleteUserPassword, setDeleteUserPassword] = useState('');
  const [profileForm, setProfileForm] = useState({ name: '', password: '' });
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [unlockedWebAdminUserId, setUnlockedWebAdminUserId] = useState<string | null>(null);
  const [unlockedWebTransactions, setUnlockedWebTransactions] = useState<Array<{ id: string; title: string; amount: number; type: 'income' | 'expense'; category: string; date: string }>>([]);
  const [webAdminUserPasswordInput, setWebAdminUserPasswordInput] = useState('');
  const [webAdminFetching, setWebAdminFetching] = useState(false);
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
    setActiveTab(result.user.role === 'admin' ? 'admin' : 'dashboard');
    setAuthData(emptyAuth);
    void loadData(result.token);
    void loadAdminData(result.token);
  };

  const handleProfileUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !user || (!profileForm.name.trim() && !profileForm.password)) return;

    const response = await fetch('/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...(profileForm.name.trim() ? { name: profileForm.name.trim() } : {}),
        ...(profileForm.password ? { password: profileForm.password } : {}),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      alert(result.message ?? 'Não foi possível atualizar suas configurações.');
      return;
    }

    saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
    setProfileForm({ name: '', password: '' });
    alert('Suas configurações foram atualizadas.');
  };

  const handleUnlockWebUserTransactions = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selectedAdminUserId || !webAdminUserPasswordInput) return;

    setWebAdminFetching(true);
    const response = await fetch(`/api/admin/users/${selectedAdminUserId}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: webAdminUserPasswordInput }),
    });

    const result = await response.json();
    setWebAdminFetching(false);

    if (!response.ok) {
      alert(result.message ?? 'Senha do usuário incorreta.');
      return;
    }

    setUnlockedWebAdminUserId(selectedAdminUserId);
    setUnlockedWebTransactions(result);
    setWebAdminUserPasswordInput('');
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

  const handleAdminTransactionsDelete = async (userId: string, userName: string) => {
    if (!token || !window.confirm(`Excluir todas as movimentações de ${userName}? Esta ação não pode ser desfeita.`)) return;

    const response = await fetch(`/api/admin/users/${userId}/transactions`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();

    if (!response.ok) {
      alert(result.message ?? 'Não foi possível excluir o extrato.');
      return;
    }

    setUnlockedWebAdminUserId(null);
    setUnlockedWebTransactions([]);
    alert('Extrato excluído.');
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
      setActiveTab('dashboard');
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
    setActiveTab('dashboard');
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
          <h1>Olá, {user.name}</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="logout-button" onClick={logout}>Sair</button>
        </div>
      </header>

      {/* NAVEGAÇÃO POR ABAS WEB */}
      <nav className="web-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          🏠 Início
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📊 Extrato
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
          onClick={() => setActiveTab('new')}
        >
          ➕ Nova Movimentação
        </button>
        {user.role !== 'admin' && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Configurações
          </button>
        )}
        {user.role === 'admin' && (
          <button
            type="button"
            className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            🛡️ Administração
          </button>
        )}
      </nav>

      {/* CONTEÚDO DA ABA DASHBOARD */}
      {activeTab === 'dashboard' && (
        <section className="dashboard-view">
          <div className="main-balance-card-web">
            <div className="balance-info-web">
              <span className="balance-tag-web">Saldo Total Disponível</span>
              <h2>R$ {summary.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
            </div>
            <div className="balance-quick-stats">
              <div className="quick-stat-box income-box">
                <span>↓ Receitas</span>
                <strong>R$ {summary.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="quick-stat-box expense-box">
                <span>↑ Despesas</span>
                <strong>R$ {summary.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card dashboard-action-card">
              <h3>Ações Rápidas</h3>
              <p>Gerencie suas finanças com agilidade</p>
              <div className="action-button-group">
                <button type="button" className="action-cta-btn" onClick={() => setActiveTab('new')}>
                  ➕ Cadastrar Nova Movimentação
                </button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab('history')}>
                  📊 Ver Extrato Completo
                </button>
              </div>
            </div>

            <div className="card">
              <div className="list-header">
                <h3>Últimas Movimentações</h3>
                <button type="button" className="link-btn" onClick={() => setActiveTab('history')}>
                  Ver tudo →
                </button>
              </div>
              {transactions.length === 0 ? (
                <p className="empty-text">Nenhuma transação cadastrada ainda.</p>
              ) : (
                <ul className="transaction-list">
                  {transactions.slice(0, 4).map((transaction) => (
                    <li key={transaction.id} className={transaction.type === 'income' ? 'income-item' : 'expense-item'}>
                      <div className="transaction-item-content">
                        <div>
                          <strong>{transaction.title}</strong>
                          <small>{transaction.category} · {transaction.date}</small>
                        </div>
                        <span className="transaction-amount">
                          {transaction.type === 'income' ? '+' : '-'}R${' '}
                          {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA EXTRATO */}
      {activeTab === 'history' && (
        <section className="history-view">
          <div className="card list-card">
            <div className="list-header">
              <div>
                <h2>Extrato de Movimentações</h2>
                <p className="subtitle-text">{transactions.length} transação(ões) encontradas</p>
              </div>
              <div className="data-actions">
                <button type="button" className="secondary-button" onClick={() => void handleExport()}>
                  📥 Exportar Excel
                </button>
                <label className="import-button">
                  {importing ? 'Importando...' : '📤 Importar Planilha'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => void handleImport(event)}
                    disabled={importing}
                  />
                </label>
              </div>
            </div>

            {transactions.length === 0 ? (
              <p className="empty-text">Nenhuma movimentação registrada.</p>
            ) : (
              <ul className="transaction-list">
                {transactions.map((transaction) => (
                  <li key={transaction.id} className={transaction.type === 'income' ? 'income-item' : 'expense-item'}>
                    <div className="transaction-item-content">
                      <div>
                        <strong>{transaction.title}</strong>
                        <small>
                          {transaction.category} · {transaction.date}
                          {transaction.description && ` · ${transaction.description}`}
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
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA NOVA TRANSAÇÃO */}
      {activeTab === 'new' && (
        <section className="new-view">
          <form className="card form-card centered-form-card" onSubmit={handleSubmit}>
            <h2>Nova Movimentação</h2>
            <p className="subtitle-text">Cadastre uma nova receita ou despesa</p>

            <label>
              Título da transação
              <input name="title" value={form.title} onChange={handleChange} placeholder="Ex: Salário, Aluguel" required />
            </label>

            <div className="inline-fields">
              <label>
                Valor (R$)
                <input name="amount" type="number" min="0" step="0.01" value={form.amount} onChange={handleChange} placeholder="0,00" required />
              </label>

              <label>
                Tipo de movimentação
                <select name="type" value={form.type} onChange={handleChange}>
                  <option value="expense">↑ Despesa</option>
                  <option value="income">↓ Receita</option>
                </select>
              </label>
            </div>

            <div className="inline-fields">
              <label>
                Categoria
                <input name="category" value={form.category} onChange={handleChange} placeholder="Ex: Alimentação, Moradia" required />
              </label>

              <label>
                Data
                <input name="date" type="date" value={form.date} onChange={handleChange} required />
              </label>
            </div>

            <label>
              Descrição (opcional)
              <input name="description" value={form.description} onChange={handleChange} placeholder="Observações adicionais..." />
            </label>

            <button type="submit" className="primary-button-full">Cadastrar Movimentação</button>
          </form>
        </section>
      )}

      {activeTab === 'settings' && user.role !== 'admin' && (
        <section className="new-view">
          <div className="card form-card">
            <h2>Configurações</h2>
            <p>Atualize seu nome ou sua senha.</p>
            <form className="modal-form" onSubmit={(event) => void handleProfileUpdate(event)}>
              <label>
                Nome
                <input
                  type="text"
                  value={profileForm.name}
                  placeholder={user.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Nova senha
                <input
                  type="password"
                  minLength={6}
                  value={profileForm.password}
                  placeholder="Deixe vazio para manter a atual"
                  onChange={(event) => setProfileForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <button type="submit" className="primary-button" disabled={!profileForm.name.trim() && !profileForm.password}>Salvar configurações</button>
            </form>
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA ADMIN */}
      {activeTab === 'admin' && user.role === 'admin' && (
        <section className="admin-panel">
          <div className="card admin-card">
            <h2>Usuários Cadastrados</h2>
            <ul className="admin-list">
              {(adminData?.users ?? []).map((item) => (
                <li key={item.id} className={selectedAdminUserId === item.id ? 'selected-admin-user' : ''}>
                  <button
                    type="button"
                    className="admin-user-select"
                    onClick={() => {
                      setSelectedAdminUserId(item.id);
                      if (unlockedWebAdminUserId !== item.id) {
                        setUnlockedWebAdminUserId(null);
                        setUnlockedWebTransactions([]);
                        setWebAdminUserPasswordInput('');
                      }
                    }}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.email}</span>
                    </div>
                  </button>
                  <div className="admin-user-actions">
                    <button type="button" className="secondary-button" onClick={() => void handleAdminTransactionsDelete(item.id, item.name)}>Excluir extrato</button>
                    <button type="button" className="danger-button" onClick={() => setAdminUserDelete({ id: item.id, name: item.name })}>Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card admin-card">
            <h2>{selectedAdminUserId ? `Finanças de ${(adminData?.users ?? []).find((item) => item.id === selectedAdminUserId)?.name ?? 'usuário'}` : 'Selecione um usuário'}</h2>
            {!selectedAdminUserId ? (
              <p className="empty-admin-state">Clique em um usuário para consultar seus dados.</p>
            ) : unlockedWebAdminUserId !== selectedAdminUserId ? (
              <form className="modal-form" onSubmit={(e) => void handleUnlockWebUserTransactions(e)} style={{ marginTop: '1rem' }}>
                <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  🔒 Por questões de privacidade, insira a senha cadastrada do usuário para visualizar o extrato financeiro:
                </p>
                <label>
                  Senha do Usuário
                  <input
                    type="password"
                    value={webAdminUserPasswordInput}
                    onChange={(e) => setWebAdminUserPasswordInput(e.target.value)}
                    placeholder="Senha do usuário"
                    required
                  />
                </label>
                <button type="submit" className="primary-button" disabled={webAdminFetching || !webAdminUserPasswordInput}>
                  {webAdminFetching ? 'Verificando...' : 'Desbloquear Extrato'}
                </button>
              </form>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '0.9rem' }}>✅ Extrato Liberado ({unlockedWebTransactions.length} itens)</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => { setUnlockedWebAdminUserId(null); setUnlockedWebTransactions([]); }}
                  >
                    🔒 Bloquear
                  </button>
                </div>
                <ul className="admin-list admin-transactions">
                  {unlockedWebTransactions.map((item) => (
                    <li key={item.id} className="admin-transaction-item">
                      <div className="transaction-info-admin">
                        <strong>{item.title}</strong>
                        <span>{item.category} · {item.date}</span>
                      </div>
                      <div className="transaction-meta-admin">
                        <span>{item.type === 'income' ? 'Receita' : 'Despesa'}</span>
                        <strong>R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
                {unlockedWebTransactions.length === 0 && <p className="empty-admin-state">Este usuário ainda não possui transações.</p>}
              </>
            )}
          </div>
        </section>
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
