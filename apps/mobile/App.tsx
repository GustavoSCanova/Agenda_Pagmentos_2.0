import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

type User = {
  id: string;
  name: string;
  email: string;
  role?: 'admin';
};

type AdminData = {
  users: User[];
  transactions: Array<Transaction & { userId: string; userName: string; userEmail: string }>;
};

type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  description?: string;
};

type Summary = {
  income: number;
  expense: number;
  balance: number;
};

type AuthMode = 'login' | 'register';

type TransactionForm = {
  title: string;
  amount: string;
  category: string;
  type: 'income' | 'expense';
  description: string;
  date: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.15.168:3001';
const TOKEN_KEY = 'finance_token';

//const emptyAuth = 
  //name: '',
 // email: 'demo@financapp.com',
  //password: '123456',

const emptyAuth = {
  name: '',
  email: '',
  password: '',
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm: TransactionForm = {
  title: '',
  amount: '',
  category: '',
  type: 'expense',
  description: '',
  date: today(),
};

const formatCurrency = (value: number) =>
  `R$ ${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getMonthKey = (date: string) => {
  const match = String(date).match(/^(\d{4})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : 'sem-data';
};

const monthLabel = (monthKey: string) => {
  if (monthKey === 'sem-data') return 'Sem data';

  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;

  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
};

const shiftMonth = (monthKey: string, delta: number) => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const parseAmount = (value: string) => {
  const cleaned = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return Number(cleaned);
};

const getMonthlySummary = (items: Transaction[], month: string): Summary => {
  const monthly = items.filter((item) => getMonthKey(item.date) === month);

  const income = monthly
    .filter((item) => item.type === 'income')
    .reduce((total, item) => total + Number(item.amount), 0);

  const expense = monthly
    .filter((item) => item.type === 'expense')
    .reduce((total, item) => total + Number(item.amount), 0);

  return {
    income,
    expense,
    balance: income - expense,
  };
};

const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (payload as { message?: string }).message ?? 'Erro ao comunicar com a API.',
    );
  }

  return payload as T;
};

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 390;

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<Summary>({
    income: 0,
    expense: 0,
    balance: 0,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [adminLogin, setAdminLogin] = useState(false);
  const [authData, setAuthData] = useState(emptyAuth);
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [editForm, setEditForm] = useState<TransactionForm>(emptyForm);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [editingAdminUser, setEditingAdminUser] = useState<(User & { password: string }) | null>(null);
  const [loading, setLoading] = useState(false);

  // Histórico:
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Comparação mensal:
  const currentMonth = getMonthKey(today());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const previousMonth = shiftMonth(selectedMonth, -1);

  const monthlySummary = useMemo(
    () => getMonthlySummary(transactions, selectedMonth),
    [transactions, selectedMonth],
  );

  const previousMonthlySummary = useMemo(
    () => getMonthlySummary(transactions, previousMonth),
    [transactions, previousMonth],
  );

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    [...transactions]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .forEach((transaction) => {
        const key = getMonthKey(transaction.date);
        const list = groups.get(key) ?? [];
        list.push(transaction);
        groups.set(key, list);
      });

    return Array.from(groups.entries());
  }, [transactions]);

  const visibleGroups = historyExpanded
    ? groupedTransactions
    : groupedTransactions.slice(0, 2);

  const loadData = async (authToken: string) => {
    const [transactionsData, summaryData] = await Promise.all([
      fetchJson<Transaction[]>('/api/transactions', {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
      fetchJson<Summary>('/api/summary', {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    ]);

    setTransactions(transactionsData);
    setSummary(summaryData);

    if (transactionsData.length > 0) {
      setSelectedMonth(getMonthKey(transactionsData[0].date));
    }
  };

  const restoreSession = async () => {
    const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!savedToken) return;

    try {
      const payload = await fetchJson<{ user: User }>('/api/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });

      setToken(savedToken);
      setUser(payload.user);
      if (payload.user.role === 'admin') {
        await loadAdminData(savedToken);
      } else {
        await loadData(savedToken);
      }
    } catch {
      await AsyncStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    void restoreSession();
  }, []);

  const handleAuthSubmit = async () => {
    try {
      setLoading(true);

      const endpoint = adminLogin
        ? '/api/auth/admin/login'
        : authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

      const payload =
        adminLogin || authMode === 'login'
          ? { email: authData.email, password: authData.password }
          : {
              name: authData.name,
              email: authData.email,
              password: authData.password,
            };

      const result = await fetchJson<{ user: User; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await AsyncStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setUser(result.user);
      setAuthData(emptyAuth);
      if (result.user.role === 'admin') {
        await loadAdminData(result.token);
      } else {
        await loadData(result.token);
      }
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Não foi possível autenticar.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadAdminData = async (authToken: string) => {
    const data = await fetchJson<AdminData>('/api/admin', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    setAdminData(data);
  };

  const handleAdminUserUpdate = async () => {
    if (!token || !editingAdminUser) return;

    try {
      setLoading(true);
      await fetchJson(`/api/admin/users/${editingAdminUser.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: editingAdminUser.email,
          ...(editingAdminUser.password ? { password: editingAdminUser.password } : {}),
        }),
      });
      setEditingAdminUser(null);
      await loadAdminData(token);
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível atualizar o usuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminUserDelete = (selectedUser: User) => {
    Alert.alert(
      'Excluir usuário',
      `Deseja excluir ${selectedUser.name}? Todas as transações desta conta serão apagadas permanentemente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;

            try {
              setLoading(true);
              await fetchJson(`/api/admin/users/${selectedUser.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (selectedAdminUserId === selectedUser.id) setSelectedAdminUserId(null);
              await loadAdminData(token);
            } catch (error) {
              Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível excluir o usuário.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const validateForm = (data: TransactionForm) => {
    if (!data.title.trim() || !data.amount || !data.category.trim() || !data.date) {
      Alert.alert('Dados incompletos', 'Preencha título, valor, categoria e data.');
      return null;
    }

    const amount = parseAmount(data.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Digite um valor válido, por exemplo: 1250,50.');
      return null;
    }

    return amount;
  };

  const handleTransactionSubmit = async () => {
    if (!token) return;

    const amount = validateForm(form);
    if (amount === null) return;

    try {
      setLoading(true);

      await fetchJson<Transaction>('/api/transactions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title.trim(),
          amount,
          type: form.type,
          category: form.category.trim(),
          date: form.date,
          description: form.description.trim(),
        }),
      });

      setForm(emptyForm);
      await loadData(token);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Não foi possível salvar a transação.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditForm({
      title: transaction.title,
      amount: String(transaction.amount).replace('.', ','),
      category: transaction.category,
      type: transaction.type,
      description: transaction.description ?? '',
      date: transaction.date,
    });
  };

  const handleEditTransaction = async () => {
    if (!token || !editingTransaction) return;

    const amount = validateForm(editForm);
    if (amount === null) return;

    try {
      setLoading(true);

      await fetchJson<Transaction>(`/api/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editForm.title.trim(),
          amount,
          type: editForm.type,
          category: editForm.category.trim(),
          date: editForm.date,
          description: editForm.description.trim(),
        }),
      });

      setEditingTransaction(null);
      setEditForm(emptyForm);
      await loadData(token);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error ? error.message : 'Não foi possível atualizar a transação.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    Alert.alert(
      'Excluir transação',
      `Tem certeza que deseja excluir "${transaction.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;

            try {
              setLoading(true);

              await fetchJson(`/api/transactions/${transaction.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });

              await loadData(token);
            } catch (error) {
              Alert.alert(
                'Erro',
                error instanceof Error ? error.message : 'Não foi possível excluir.',
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleExport = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/api/transactions/export`,
        `${FileSystem.cacheDirectory}transacoes.xlsx`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (result.status !== 200) {
        throw new Error('Não foi possível exportar as transações.');
      }

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Arquivo criado', `A planilha foi salva em ${result.uri}.`);
        return;
      }

      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Exportar transações',
        UTI: 'com.microsoft.excel.xlsx',
      });
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível exportar as transações.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!token) return;

    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (selection.canceled) return;

      setLoading(true);
      const file = selection.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'application/octet-stream',
      } as unknown as Blob);

      const response = await fetch(`${API_BASE_URL}/api/transactions/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message ?? 'Não foi possível importar o arquivo.');
      }

      const rejected = result.rejectedRows?.length
        ? ` ${result.rejectedRows.length} linha(s) foram ignoradas por dados inválidos.`
        : '';
      Alert.alert('Importação concluída', `${result.imported} transação(ões) importada(s).${rejected}`);
      await loadData(token);
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível importar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setTransactions([]);
    setSummary({ income: 0, expense: 0, balance: 0 });
  };

  const changeMonth = (delta: number) => {
    setSelectedMonth((month) => shiftMonth(month, delta));
  };

  const comparisonPercent = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const expenseVariation = comparisonPercent(
    monthlySummary.expense,
    previousMonthlySummary.expense,
  );

  const balanceVariation = comparisonPercent(
    monthlySummary.balance,
    previousMonthlySummary.balance,
  );

  if (!token || !user) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.authScreen}
      >
        <View style={styles.authCard}>
          <Text style={styles.eyebrow}>Finance App</Text>
          <Text style={styles.title}>
            {adminLogin ? 'Acesso administrativo' : authMode === 'login' ? 'Acessar conta' : 'Criar conta'}
          </Text>

          {adminLogin ? (
            <>
              <TextInput style={styles.input} placeholder="E-mail do administrador" autoCapitalize="none" keyboardType="email-address" value={authData.email} onChangeText={(value) => setAuthData((current) => ({ ...current, email: value }))} />
              <TextInput style={styles.input} placeholder="Senha do administrador" secureTextEntry value={authData.password} onChangeText={(value) => setAuthData((current) => ({ ...current, password: value }))} />
              <Pressable style={styles.primaryButton} onPress={handleAuthSubmit} disabled={loading}><Text style={styles.primaryButtonText}>{loading ? 'Aguarde...' : 'Entrar como administrador'}</Text></Pressable>
              <Pressable style={styles.textButton} onPress={() => setAdminLogin(false)}><Text style={styles.textButtonLabel}>Voltar</Text></Pressable>
            </>
          ) : (
            <>
              <View style={styles.switchRow}>
                <Pressable style={[styles.switchButton, authMode === 'login' && styles.switchButtonActive]} onPress={() => setAuthMode('login')}><Text style={styles.switchText}>Login</Text></Pressable>
                <Pressable style={[styles.switchButton, authMode === 'register' && styles.switchButtonActive]} onPress={() => setAuthMode('register')}><Text style={styles.switchText}>Registrar</Text></Pressable>
              </View>
              {authMode === 'register' && <TextInput style={styles.input} placeholder="Nome" value={authData.name} onChangeText={(value) => setAuthData((current) => ({ ...current, name: value }))} />}
              <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={authData.email} onChangeText={(value) => setAuthData((current) => ({ ...current, email: value }))} />
              <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={authData.password} onChangeText={(value) => setAuthData((current) => ({ ...current, password: value }))} />
              <Pressable style={styles.primaryButton} onPress={handleAuthSubmit} disabled={loading}><Text style={styles.primaryButtonText}>{loading ? 'Aguarde...' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</Text></Pressable>
              {authMode === 'login' && <Pressable style={styles.textButton} onPress={() => setAdminLogin(true)}><Text style={styles.textButtonLabel}>Acesso administrador</Text></Pressable>}
            </>
          )}
        </View>

        <StatusBar style="auto" />
      </KeyboardAvoidingView>
    );
  }

  if (user.role === 'admin') {
    const selectedUser = (adminData?.users ?? []).find((item) => item.id === selectedAdminUserId);
    const selectedTransactions = (adminData?.transactions ?? []).filter((item) => item.userId === selectedAdminUserId);

    return (
      <View style={styles.screen}>
        <FlatList
          data={adminData?.users ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<View style={styles.adminHeader}><View><Text style={styles.eyebrow}>Finance App</Text><Text style={styles.pageTitle}>Administração</Text><Text style={styles.userLabel}>Olá, {user.name}</Text></View><Pressable style={styles.logoutButton} onPress={logout}><Text style={styles.logoutButtonText}>Sair</Text></Pressable></View>}
          renderItem={({ item }) => (
            <View style={[styles.adminUserCard, selectedAdminUserId === item.id && styles.adminUserCardSelected]}>
              <Pressable style={styles.adminUserInfo} onPress={() => setSelectedAdminUserId(item.id)}>
                <Text style={styles.transactionTitle}>{item.name}</Text>
                <Text style={styles.transactionMeta}>{item.email}</Text>
              </Pressable>
              <View style={styles.adminUserActions}>
                <Pressable style={styles.adminEditButton} onPress={() => setEditingAdminUser({ ...item, password: '' })}><Text style={styles.adminActionText}>Editar</Text></Pressable>
                <Pressable style={styles.adminDeleteButton} onPress={() => handleAdminUserDelete(item)}><Text style={styles.adminActionText}>Excluir</Text></Pressable>
              </View>
            </View>
          )}
          ListFooterComponent={<View style={styles.adminTransactions}><Text style={styles.cardTitle}>{selectedUser ? `Transações de ${selectedUser.name}` : 'Dados do usuário'}</Text>{!selectedUser ? <Text style={styles.emptyText}>Toque em um usuário para visualizar suas transações.</Text> : selectedTransactions.length === 0 ? <Text style={styles.emptyText}>Este usuário ainda não possui transações.</Text> : selectedTransactions.map((item) => <View key={item.id} style={[styles.transactionItem, item.type === 'income' ? styles.incomeItem : styles.expenseItem]}><View style={styles.transactionInfo}><Text style={styles.transactionTitle}>{item.title}</Text><Text style={styles.transactionMeta}>{item.category} · {item.date}</Text></View><Text style={styles.transactionAmount}>{item.type === 'income' ? '+' : '-'} {formatCurrency(item.amount)}</Text></View>)}</View>}
        />
        <Modal visible={editingAdminUser !== null} transparent animationType="slide" onRequestClose={() => setEditingAdminUser(null)}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.modalCard}><Text style={styles.modalTitle}>Editar usuário</Text><TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={editingAdminUser?.email ?? ''} onChangeText={(value) => setEditingAdminUser((current) => current && { ...current, email: value })} /><TextInput style={styles.input} placeholder="Nova senha (opcional)" secureTextEntry value={editingAdminUser?.password ?? ''} onChangeText={(value) => setEditingAdminUser((current) => current && { ...current, password: value })} /><Pressable style={styles.primaryButton} onPress={handleAdminUserUpdate} disabled={loading}><Text style={styles.primaryButtonText}>Salvar</Text></Pressable><Pressable style={styles.cancelButton} onPress={() => setEditingAdminUser(null)}><Text style={styles.cancelButtonText}>Cancelar</Text></Pressable></View></KeyboardAvoidingView>
        </Modal>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={[]}
        ListHeaderComponent={
          <>
            {/* HEADER */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>Finance App</Text>
                <Text style={[styles.pageTitle, compact && styles.pageTitleCompact]}>
                  Dashboard
                </Text>
                <Text style={styles.userLabel} numberOfLines={1}>
                  Olá, {user.name}
                </Text>
              </View>

              <Pressable style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutButtonText}>Sair</Text>
              </Pressable>
            </View>

            {/* RESUMO TOTAL */}
            <View style={styles.summaryRow}>
              {[
                ['Receitas', summary.income, styles.incomeCard],
                ['Despesas', summary.expense, styles.expenseCard],
                ['Saldo', summary.balance, styles.balanceCard],
              ].map(([label, value, cardStyle]) => (
                <View
                  key={String(label)}
                  style={[styles.summaryCard, cardStyle as object]}
                >
                  <Text style={styles.summaryLabel}>{String(label)}</Text>
                  <Text
                    style={[styles.summaryValue, compact && styles.summaryValueCompact]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {formatCurrency(Number(value))}
                  </Text>
                </View>
              ))}
            </View>

            {/* NOVA TRANSAÇÃO */}
            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>Nova transação</Text>

              <TextInput
                style={styles.input}
                placeholder="Título"
                value={form.title}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, title: value }))
                }
              />

              <View style={styles.rowTwo}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Valor"
                  keyboardType="decimal-pad"
                  value={form.amount}
                  onChangeText={(value) =>
                    setForm((current) => ({ ...current, amount: value }))
                  }
                />

                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Categoria"
                  value={form.category}
                  onChangeText={(value) =>
                    setForm((current) => ({ ...current, category: value }))
                  }
                />
              </View>

              <View style={styles.rowTwo}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Data"
                  value={form.date}
                  onChangeText={(value) =>
                    setForm((current) => ({ ...current, date: value }))
                  }
                />

                <Pressable
                  style={[
                    styles.typeButton,
                    form.type === 'income' && styles.typeButtonIncome,
                  ]}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      type: current.type === 'income' ? 'expense' : 'income',
                    }))
                  }
                >
                  <Text style={styles.typeButtonText}>
                    {form.type === 'income' ? 'Receita' : 'Despesa'}
                  </Text>
                </Pressable>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Descrição"
                value={form.description}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, description: value }))
                }
              />

              <Pressable
                style={styles.primaryButton}
                onPress={handleTransactionSubmit}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Salvando...' : 'Salvar transação'}
                </Text>
              </Pressable>
            </View>

            {/* COMPARAÇÃO MENSAL */}
            <View style={styles.compareCard}>
              <View style={styles.compareHeader}>
                <View>
                  <Text style={styles.cardTitle}>Comparar meses</Text>
                  <Text style={styles.monthSubtitle}>
                    {monthLabel(selectedMonth)}
                  </Text>
                </View>

                <View style={styles.monthControls}>
                  <Pressable
                    style={styles.monthArrow}
                    onPress={() => changeMonth(-1)}
                  >
                    <Text style={styles.monthArrowText}>‹</Text>
                  </Pressable>

                  <Pressable
                    style={styles.monthArrow}
                    onPress={() => changeMonth(1)}
                  >
                    <Text style={styles.monthArrowText}>›</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.compareMonths}>
                <Text style={styles.compareMonthText}>
                  {monthLabel(previousMonth)}
                </Text>
                <Text style={styles.compareVs}>vs.</Text>
                <Text style={styles.compareMonthText}>
                  {monthLabel(selectedMonth)}
                </Text>
              </View>

              <View style={styles.compareRow}>
                <View style={styles.compareItem}>
                  <Text style={styles.compareLabel}>Receitas</Text>
                  <Text style={styles.compareValue}>
                    {formatCurrency(monthlySummary.income)}
                  </Text>
                  <Text style={styles.comparePrevious}>
                    anterior: {formatCurrency(previousMonthlySummary.income)}
                  </Text>
                </View>

                <View style={styles.compareItem}>
                  <Text style={styles.compareLabel}>Despesas</Text>
                  <Text style={styles.compareValue}>
                    {formatCurrency(monthlySummary.expense)}
                  </Text>
                  <Text style={styles.comparePrevious}>
                    anterior: {formatCurrency(previousMonthlySummary.expense)}
                  </Text>
                  <Text style={styles.variation}>
                    {expenseVariation === null
                      ? 'Sem base anterior'
                      : `${expenseVariation >= 0 ? '↑' : '↓'} ${Math.abs(expenseVariation).toFixed(1)}%`}
                  </Text>
                </View>

                <View style={styles.compareItem}>
                  <Text style={styles.compareLabel}>Saldo</Text>
                  <Text style={styles.compareValue}>
                    {formatCurrency(monthlySummary.balance)}
                  </Text>
                  <Text style={styles.comparePrevious}>
                    anterior: {formatCurrency(previousMonthlySummary.balance)}
                  </Text>
                  <Text style={styles.variation}>
                    {balanceVariation === null
                      ? 'Sem base anterior'
                      : `${balanceVariation >= 0 ? '↑' : '↓'} ${Math.abs(balanceVariation).toFixed(1)}%`}
                  </Text>
                </View>
              </View>
            </View>

            {/* HISTÓRICO */}
            <View style={styles.listCard}>
              <View style={styles.historyHeader}>
                <View>
                  <Text style={styles.cardTitle}>Histórico</Text>
                  <Text style={styles.historySubtitle}>
                    {transactions.length} transação(ões)
                  </Text>
                </View>
              </View>

              <View style={styles.fileActions}>
                <Pressable
                  style={[styles.fileButton, styles.exportButton]}
                  onPress={handleExport}
                  disabled={loading}
                >
                  <Text style={styles.fileButtonText}>Exportar Excel</Text>
                </Pressable>
                <Pressable
                  style={styles.fileButton}
                  onPress={handleImport}
                  disabled={loading}
                >
                  <Text style={styles.fileButtonText}>Importar arquivo</Text>
                </Pressable>
              </View>

              {visibleGroups.map(([month, monthTransactions]) => {
                const expanded = expandedMonths[month] ?? true;
                const monthTotal = getMonthlySummary(transactions, month);

                return (
                  <View key={month} style={styles.monthGroup}>
                    <Pressable
                      style={styles.monthGroupHeader}
                      onPress={() =>
                        setExpandedMonths((current) => ({
                          ...current,
                          [month]: !expanded,
                        }))
                      }
                    >
                      <View>
                        <Text style={styles.monthGroupTitle}>
                          {monthLabel(month)}
                        </Text>
                        <Text style={styles.monthGroupMeta}>
                          {monthTransactions.length} movimentação(ões) · Saldo{' '}
                          {formatCurrency(monthTotal.balance)}
                        </Text>
                      </View>

                      <Text style={styles.chevron}>
                        {expanded ? '⌃' : '⌄'}
                      </Text>
                    </Pressable>

                    {expanded &&
                      monthTransactions.map((item) => (
                        <View
                          key={item.id}
                          style={[
                            styles.transactionItem,
                            item.type === 'income'
                              ? styles.incomeItem
                              : styles.expenseItem,
                          ]}
                        >
                          <View style={styles.transactionInfo}>
                            <Text
                              style={styles.transactionTitle}
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>

                            <Text style={styles.transactionMeta}>
                              {item.category} · {item.date}
                            </Text>

                            {!!item.description && (
                              <Text
                                style={styles.transactionDescription}
                                numberOfLines={1}
                              >
                                {item.description}
                              </Text>
                            )}
                          </View>

                          <View style={styles.transactionRight}>
                            <Text
                              style={styles.transactionAmount}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.7}
                            >
                              {item.type === 'income' ? '+' : '-'}{' '}
                              {formatCurrency(item.amount)}
                            </Text>

                            <View style={styles.actionRow}>
                              <Pressable
                                style={styles.editButton}
                                onPress={() => handleEditStart(item)}
                              >
                                <Text style={styles.actionText}>✏️</Text>
                              </Pressable>

                              <Pressable
                                style={styles.deleteButton}
                                onPress={() => handleDeleteTransaction(item)}
                              >
                                <Text style={styles.actionText}>🗑️</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      ))}
                  </View>
                );
              })}

              {groupedTransactions.length === 0 && (
                <Text style={styles.emptyText}>
                  Nenhuma movimentação registrada.
                </Text>
              )}

              {!historyExpanded && groupedTransactions.length > 2 && (
                <Pressable
                  style={styles.showMoreButton}
                  onPress={() => setHistoryExpanded(true)}
                >
                  <Text style={styles.showMoreText}>
                    Mostrar todos os meses
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        }
        renderItem={null}
        keyExtractor={() => 'dashboard'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      />

      {/* MODAL DE EDIÇÃO */}
      <Modal
        visible={editingTransaction !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingTransaction(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar transação</Text>

            <TextInput
              style={styles.input}
              placeholder="Título"
              value={editForm.title}
              onChangeText={(value) =>
                setEditForm((current) => ({ ...current, title: value }))
              }
            />

            <View style={styles.rowTwo}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Valor"
                keyboardType="decimal-pad"
                value={editForm.amount}
                onChangeText={(value) =>
                  setEditForm((current) => ({ ...current, amount: value }))
                }
              />

              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Categoria"
                value={editForm.category}
                onChangeText={(value) =>
                  setEditForm((current) => ({ ...current, category: value }))
                }
              />
            </View>

            <View style={styles.rowTwo}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Data"
                value={editForm.date}
                onChangeText={(value) =>
                  setEditForm((current) => ({ ...current, date: value }))
                }
              />

              <Pressable
                style={[
                  styles.typeButton,
                  editForm.type === 'income' && styles.typeButtonIncome,
                ]}
                onPress={() =>
                  setEditForm((current) => ({
                    ...current,
                    type: current.type === 'income' ? 'expense' : 'income',
                  }))
                }
              >
                <Text style={styles.typeButtonText}>
                  {editForm.type === 'income' ? 'Receita' : 'Despesa'}
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Descrição"
              value={editForm.description}
              onChangeText={(value) =>
                setEditForm((current) => ({ ...current, description: value }))
              }
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleEditTransaction}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Salvando...' : 'Salvar alterações'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setEditingTransaction(null)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef4ff',
  },

  content: {
    padding: 20,
    paddingTop: 52,
    paddingBottom: 40,
    gap: 16,
  },

  authScreen: {
    flex: 1,
    backgroundColor: '#eef4ff',
    justifyContent: 'center',
    padding: 20,
  },

  authCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },

  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#4f46e5',
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
    marginBottom: 18,
  },

  switchRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },

  switchButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },

  switchButtonActive: {
    backgroundColor: '#ffffff',
  },

  switchText: {
    fontWeight: '700',
    color: '#0f172a',
  },

  input: {
    borderWidth: 1,
    borderColor: '#dbe3f0',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    color: '#0f172a',
  },

  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },

  textButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },

  textButtonLabel: {
    color: '#2563eb',
    fontWeight: '700',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  adminUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dbe3f0',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },

  adminUserCardSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },

  adminUserInfo: {
    flex: 1,
    minWidth: 0,
  },

  adminUserActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
  },

  adminEditButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },

  adminDeleteButton: {
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },

  adminActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  adminTransactions: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginTop: 10,
    padding: 16,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },

  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },

  pageTitleCompact: {
    fontSize: 28,
  },

  userLabel: {
    color: '#475569',
    marginTop: 4,
    fontSize: 15,
  },

  logoutButton: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },

  logoutButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },

  summaryCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    padding: 14,
  },

  incomeCard: {
    backgroundColor: '#dcfce7',
  },

  expenseCard: {
    backgroundColor: '#fee2e2',
  },

  balanceCard: {
    backgroundColor: '#dbeafe',
  },

  summaryLabel: {
    color: '#334155',
    fontSize: 12,
    marginBottom: 4,
  },

  summaryValue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
  },

  summaryValueCompact: {
    fontSize: 15,
  },

  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },

  compareCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },

  listCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },

  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },

  rowTwo: {
    flexDirection: 'row',
    gap: 10,
  },

  halfInput: {
    flex: 1,
    minWidth: 0,
  },

  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  typeButtonIncome: {
    backgroundColor: '#ecfdf5',
  },

  typeButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },

  compareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  monthSubtitle: {
    color: '#64748b',
    textTransform: 'capitalize',
    fontSize: 13,
  },

  monthControls: {
    flexDirection: 'row',
    gap: 8,
  },

  monthArrow: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  monthArrowText: {
    fontSize: 25,
    color: '#0f172a',
    lineHeight: 28,
  },

  compareMonths: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },

  compareMonthText: {
    color: '#475569',
    fontSize: 12,
    textTransform: 'capitalize',
  },

  compareVs: {
    color: '#94a3b8',
    fontWeight: '700',
  },

  compareRow: {
    flexDirection: 'row',
    gap: 8,
  },

  compareItem: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
  },

  compareLabel: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 4,
  },

  compareValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },

  comparePrevious: {
    color: '#94a3b8',
    fontSize: 9,
    marginTop: 4,
  },

  variation: {
    color: '#2563eb',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },

  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  fileActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },

  fileButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },

  exportButton: {
    backgroundColor: '#475569',
  },

  fileButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  historySubtitle: {
    color: '#64748b',
    fontSize: 12,
  },

  expandButton: {
    backgroundColor: '#e8eefc',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  expandButtonText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700',
  },

  monthGroup: {
    marginBottom: 12,
  },

  monthGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 11,
    padding: 12,
    marginBottom: 8,
  },

  monthGroupTitle: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 14,
    textTransform: 'capitalize',
  },

  monthGroupMeta: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 3,
  },

  chevron: {
    color: '#475569',
    fontSize: 18,
    fontWeight: '800',
  },

  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },

  incomeItem: {
    backgroundColor: '#ecfdf5',
  },

  expenseItem: {
    backgroundColor: '#fef2f2',
  },

  transactionInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },

  transactionTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: '#0f172a',
  },

  transactionMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },

  transactionDescription: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },

  transactionRight: {
    alignItems: 'flex-end',
    width: 118,
  },

  transactionAmount: {
    width: '100%',
    textAlign: 'right',
    fontWeight: '800',
    color: '#0f172a',
    fontSize: 13,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },

  editButton: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionText: {
    fontSize: 16,
  },

  showMoreButton: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },

  showMoreText: {
    color: '#2563eb',
    fontWeight: '700',
  },

  emptyText: {
    color: '#64748b',
    paddingVertical: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },

  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 18,
  },

  cancelButton: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },

  cancelButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
