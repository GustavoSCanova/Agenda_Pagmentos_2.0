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
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'new' | 'admin'>('dashboard');
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
  const [unlockedAdminUserId, setUnlockedAdminUserId] = useState<string | null>(null);
  const [unlockedTransactions, setUnlockedTransactions] = useState<Transaction[]>([]);
  const [adminUserPasswordInput, setAdminUserPasswordInput] = useState('');
  const [showAdminUserPasswordInput, setShowAdminUserPasswordInput] = useState(false);
  const [fetchingUserTransactions, setFetchingUserTransactions] = useState(false);
  const [editingAdminUser, setEditingAdminUser] = useState<(User & { password: string }) | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminEditPassword, setShowAdminEditPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Histórico:
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

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 4);
  }, [transactions]);

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

  const handleSelectAdminUser = (userId: string) => {
    setSelectedAdminUserId(userId);
    if (unlockedAdminUserId !== userId) {
      setUnlockedAdminUserId(null);
      setUnlockedTransactions([]);
      setAdminUserPasswordInput('');
    }
  };

  const handleUnlockUserTransactions = async () => {
    if (!token || !selectedAdminUserId || !adminUserPasswordInput) return;

    try {
      setFetchingUserTransactions(true);
      const userTransactions = await fetchJson<Transaction[]>(`/api/admin/users/${selectedAdminUserId}/transactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: adminUserPasswordInput }),
      });

      setUnlockedAdminUserId(selectedAdminUserId);
      setUnlockedTransactions(userTransactions);
      setAdminUserPasswordInput('');
    } catch (error) {
      Alert.alert(
        'Acesso negado',
        error instanceof Error ? error.message : 'Senha do usuário incorreta.',
      );
    } finally {
      setFetchingUserTransactions(false);
    }
  };

  const handleAdminUserUpdate = async () => {
    if (!token || !editingAdminUser) return;

    try {
      setLoading(true);
      await fetchJson(`/api/admin/users/${editingAdminUser.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editingAdminUser.name,
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
      setActiveTab('dashboard');
      Alert.alert('Sucesso', 'Transação registrada com sucesso!');
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
      <SafeAreaProvider>
        <SafeAreaView style={styles.authScreen} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
          >
            <ScrollView
              contentContainerStyle={styles.authScreenContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.authCard}>
                <Text style={styles.eyebrow}>Agenda de Pagamentos 2.0</Text>
                <Text style={styles.title}>
                  {adminLogin ? 'Acesso administrativo' : authMode === 'login' ? 'Acessar conta' : 'Criar conta'}
                </Text>

                {adminLogin ? (
                  <View style={styles.authFieldsContainer}>
                    <TextInput style={styles.input} placeholder="E-mail do administrador" placeholderTextColor="#94a3b8" autoCapitalize="none" keyboardType="email-address" value={authData.email} onChangeText={(value) => setAuthData((current) => ({ ...current, email: value }))} />
                    <View style={styles.passwordWrapper}>
                      <TextInput style={[styles.input, styles.passwordInput]} placeholder="Senha do administrador" placeholderTextColor="#94a3b8" secureTextEntry={!showPassword} autoCapitalize="none" value={authData.password} onChangeText={(value) => setAuthData((current) => ({ ...current, password: value }))} />
                      <Pressable style={styles.eyeButtonAbsolute} onPress={() => setShowPassword((prev) => !prev)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '🔒'}</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.primaryButton} onPress={handleAuthSubmit} disabled={loading}><Text style={styles.primaryButtonText}>{loading ? 'Aguarde...' : 'Entrar como administrador'}</Text></Pressable>
                    <Pressable style={styles.textButton} onPress={() => setAdminLogin(false)}><Text style={styles.textButtonLabel}>Voltar</Text></Pressable>
                  </View>
                ) : (
                  <View style={styles.authFieldsContainer}>
                    <View style={styles.switchRow}>
                      <Pressable style={[styles.switchButton, authMode === 'login' && styles.switchButtonActive]} onPress={() => setAuthMode('login')}><Text style={[styles.switchText, authMode === 'login' && styles.switchTextActive]}>Login</Text></Pressable>
                      <Pressable style={[styles.switchButton, authMode === 'register' && styles.switchButtonActive]} onPress={() => setAuthMode('register')}><Text style={[styles.switchText, authMode === 'register' && styles.switchTextActive]}>Registrar</Text></Pressable>
                    </View>
                    {authMode === 'register' && <TextInput style={styles.input} placeholder="Nome" placeholderTextColor="#94a3b8" value={authData.name} onChangeText={(value) => setAuthData((current) => ({ ...current, name: value }))} />}
                    <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor="#94a3b8" autoCapitalize="none" keyboardType="email-address" value={authData.email} onChangeText={(value) => setAuthData((current) => ({ ...current, email: value }))} />
                    <View style={styles.passwordWrapper}>
                      <TextInput style={[styles.input, styles.passwordInput]} placeholder="Senha" placeholderTextColor="#94a3b8" secureTextEntry={!showPassword} autoCapitalize="none" value={authData.password} onChangeText={(value) => setAuthData((current) => ({ ...current, password: value }))} />
                      <Pressable style={styles.eyeButtonAbsolute} onPress={() => setShowPassword((prev) => !prev)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '🔒'}</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.primaryButton} onPress={handleAuthSubmit} disabled={loading}><Text style={styles.primaryButtonText}>{loading ? 'Aguarde...' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</Text></Pressable>
                    {authMode === 'login' && <Pressable style={styles.textButton} onPress={() => setAdminLogin(true)}><Text style={styles.textButtonLabel}>Acesso administrador</Text></Pressable>}
                  </View>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          <StatusBar style="dark" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const selectedUser = (adminData?.users ?? []).find((item) => item.id === selectedAdminUserId);
  const selectedTransactions = (adminData?.transactions ?? []).filter((item) => item.userId === selectedAdminUserId);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        {/* HEADER FIXO SUPERIOR COM TABS DE NAVEGAÇÃO */}
        <View style={styles.headerNavContainer}>
          <View style={styles.topHeader}>
            <View style={styles.topHeaderLeft}>
              <Text style={styles.eyebrow}>Agenda de Pagamentos 2.0</Text>
              <Text style={styles.welcomeTitle} numberOfLines={1} adjustsFontSizeToFit>
                Olá, {user.name}
              </Text>
            </View>
            <Pressable style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutButtonText}>Sair</Text>
            </Pressable>
          </View>

          {/* NAVEGAÇÃO POR ABAS NO TOPO */}
          <View style={styles.topNavTabs}>
            <Pressable
              style={[styles.topTab, activeTab === 'dashboard' && styles.topTabActive]}
              onPress={() => setActiveTab('dashboard')}
            >
              <Text style={styles.topTabIcon}>🏠</Text>
              <Text style={[styles.topTabLabel, activeTab === 'dashboard' && styles.topTabLabelActive]}>Início</Text>
            </Pressable>

            <Pressable
              style={[styles.topTab, activeTab === 'history' && styles.topTabActive]}
              onPress={() => setActiveTab('history')}
            >
              <Text style={styles.topTabIcon}>📊</Text>
              <Text style={[styles.topTabLabel, activeTab === 'history' && styles.topTabLabelActive]}>Extrato</Text>
            </Pressable>

            <Pressable
              style={[styles.topTab, activeTab === 'new' && styles.topTabActive]}
              onPress={() => setActiveTab('new')}
            >
              <Text style={styles.topTabIcon}>➕</Text>
              <Text style={[styles.topTabLabel, activeTab === 'new' && styles.topTabLabelActive]}>Novo</Text>
            </Pressable>

            {user.role === 'admin' && (
              <Pressable
                style={[styles.topTab, activeTab === 'admin' && styles.topTabActive]}
                onPress={() => setActiveTab('admin')}
              >
                <Text style={styles.topTabIcon}>⚙️</Text>
                <Text style={[styles.topTabLabel, activeTab === 'admin' && styles.topTabLabelActive]}>Admin</Text>
              </Pressable>
            )}
          </View>
        </View>

      {/* ÁREA DE CONTEÚDO */}
      <View style={styles.mainContent}>
        {activeTab === 'dashboard' && (
          <FlatList
            data={[]}
            renderItem={null}
            keyExtractor={() => 'dashboard'}
            showsVerticalScrollIndicator={false}
            style={styles.tabContentList}
            contentContainerStyle={styles.tabContent}
            ListHeaderComponent={
              <>
                {/* CARD DE SALDO PRINCIPAL */}
                <View style={styles.mainBalanceCard}>
                  <View style={styles.mainBalanceHeader}>
                    <Text style={styles.mainBalanceLabel}>
                      Saldo Total Disponível
                    </Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>Ativo</Text>
                    </View>
                  </View>
                  <Text
                    style={styles.mainBalanceValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCurrency(summary.balance)}
                  </Text>
                  <View style={styles.mainBalanceDivider} />
                  <View style={styles.mainBalanceStats}>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>↓ Entradas</Text>
                      <Text style={styles.miniStatIncome} numberOfLines={1} adjustsFontSizeToFit>
                        {formatCurrency(summary.income)}
                      </Text>
                    </View>
                    <View style={styles.miniStatSeparator} />
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>↑ Saídas</Text>
                      <Text style={styles.miniStatExpense} numberOfLines={1} adjustsFontSizeToFit>
                        {formatCurrency(summary.expense)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ATALHO RÁPIDO PARA NOVA TRANSAÇÃO */}
                <Pressable
                  style={styles.quickAddBanner}
                  onPress={() => setActiveTab('new')}
                >
                  <View style={styles.quickAddIconWrapper}>
                    <Text style={styles.quickAddIcon}>➕</Text>
                  </View>
                  <View style={styles.quickAddText}>
                    <Text style={styles.quickAddTitle}>Nova Movimentação</Text>
                    <Text style={styles.quickAddSubtitle}>Cadastre uma receita ou despesa</Text>
                  </View>
                  <Text style={styles.quickAddArrow}>›</Text>
                </Pressable>

                {/* COMPARAÇÃO MENSAL */}
                <View style={styles.cleanCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.cardTitle}>Comparativo Mensal</Text>
                      <Text style={styles.cardSubtitle}>{monthLabel(selectedMonth)}</Text>
                    </View>
                    <View style={styles.monthControls}>
                      <Pressable style={styles.monthArrow} onPress={() => changeMonth(-1)}>
                        <Text style={styles.monthArrowText}>‹</Text>
                      </Pressable>
                      <Pressable style={styles.monthArrow} onPress={() => changeMonth(1)}>
                        <Text style={styles.monthArrowText}>›</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.compareMonthsTag}>
                    <Text style={styles.compareMonthText} numberOfLines={1}>{monthLabel(previousMonth)}</Text>
                    <Text style={styles.compareVs}>vs.</Text>
                    <Text style={[styles.compareMonthText, styles.compareMonthActive]} numberOfLines={1}>{monthLabel(selectedMonth)}</Text>
                  </View>

                  <View style={styles.compareRow}>
                    <View style={styles.compareItem}>
                      <Text style={styles.compareLabel} numberOfLines={1}>Receitas</Text>
                      <Text style={styles.compareValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(monthlySummary.income)}</Text>
                      <Text style={styles.comparePrevious} numberOfLines={1} adjustsFontSizeToFit>ant: {formatCurrency(previousMonthlySummary.income)}</Text>
                    </View>

                    <View style={styles.compareItem}>
                      <Text style={styles.compareLabel} numberOfLines={1}>Despesas</Text>
                      <Text style={styles.compareValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(monthlySummary.expense)}</Text>
                      <Text style={styles.comparePrevious} numberOfLines={1} adjustsFontSizeToFit>ant: {formatCurrency(previousMonthlySummary.expense)}</Text>
                      <Text style={[styles.variation, expenseVariation !== null && expenseVariation > 0 ? styles.variationRed : styles.variationGreen]} numberOfLines={1}>
                        {expenseVariation === null ? 'Sem base' : `${expenseVariation >= 0 ? '↑' : '↓'} ${Math.abs(expenseVariation).toFixed(1)}%`}
                      </Text>
                    </View>

                    <View style={styles.compareItem}>
                      <Text style={styles.compareLabel} numberOfLines={1}>Saldo</Text>
                      <Text style={styles.compareValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(monthlySummary.balance)}</Text>
                      <Text style={styles.comparePrevious} numberOfLines={1} adjustsFontSizeToFit>ant: {formatCurrency(previousMonthlySummary.balance)}</Text>
                      <Text style={[styles.variation, balanceVariation !== null && balanceVariation >= 0 ? styles.variationGreen : styles.variationRed]} numberOfLines={1}>
                        {balanceVariation === null ? 'Sem base' : `${balanceVariation >= 0 ? '↑' : '↓'} ${Math.abs(balanceVariation).toFixed(1)}%`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ÚLTIMAS TRANSAÇÕES */}
                <View style={styles.cleanCard}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>Recentes</Text>
                    <Pressable onPress={() => setActiveTab('history')}>
                      <Text style={styles.viewAllLink}>Ver extrato completo →</Text>
                    </Pressable>
                  </View>

                  {recentTransactions.length === 0 ? (
                    <Text style={styles.emptyStateText}>Nenhuma movimentação cadastrada ainda.</Text>
                  ) : (
                    recentTransactions.map((item) => (
                      <View key={item.id} style={styles.recentItem}>
                        <View style={[styles.typePillIcon, item.type === 'income' ? styles.typePillIncome : styles.typePillExpense]}>
                          <Text style={styles.typePillText}>{item.type === 'income' ? '↓' : '↑'}</Text>
                        </View>
                        <View style={styles.recentInfo}>
                          <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.recentMeta} numberOfLines={1}>{item.category} · {item.date}</Text>
                        </View>
                        <Text style={[styles.recentAmount, item.type === 'income' ? styles.recentAmountIncome : styles.recentAmountExpense]} numberOfLines={1} adjustsFontSizeToFit>
                          {item.type === 'income' ? '+' : '-'} {formatCurrency(item.amount)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            }
          />
        )}

        {activeTab === 'history' && (
          <FlatList
            data={[]}
            renderItem={null}
            keyExtractor={() => 'history'}
            showsVerticalScrollIndicator={false}
            style={styles.tabContentList}
            contentContainerStyle={styles.tabContent}
            ListHeaderComponent={
              <>
                <View style={styles.tabHeader}>
                  <View>
                    <Text style={styles.tabHeading}>Extrato Completo</Text>
                    <Text style={styles.tabSubheading}>{transactions.length} movimentação(ões) no total</Text>
                  </View>
                </View>

                {/* BOTÕES DE PLANILHA */}
                <View style={styles.actionButtonsRow}>
                  <Pressable style={[styles.fileActionBtn, styles.exportBtn]} onPress={handleExport} disabled={loading}>
                    <Text style={styles.fileActionBtnText}>📥 Exportar Excel</Text>
                  </Pressable>
                  <Pressable style={[styles.fileActionBtn, styles.importBtn]} onPress={handleImport} disabled={loading}>
                    <Text style={[styles.fileActionBtnText, styles.importBtnText]}>📤 Importar Planilha</Text>
                  </Pressable>
                </View>

                {/* LISTA AGRUPADA */}
                {groupedTransactions.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyCardTitle}>Nenhuma movimentação</Text>
                    <Text style={styles.emptyCardSubtitle}>Use a aba "Nova" ou importe uma planilha para começar.</Text>
                  </View>
                ) : (
                  groupedTransactions.map(([month, monthTransactions]) => {
                    const expanded = expandedMonths[month] ?? true;
                    const monthTotal = getMonthlySummary(transactions, month);

                    return (
                      <View key={month} style={styles.monthGroupCard}>
                        <Pressable
                          style={styles.monthGroupHeader}
                          onPress={() => setExpandedMonths((current) => ({ ...current, [month]: !expanded }))}
                        >
                          <View>
                            <Text style={styles.monthGroupTitle}>{monthLabel(month)}</Text>
                            <Text style={styles.monthGroupMeta}>
                              {monthTransactions.length} itens · Saldo {formatCurrency(monthTotal.balance)}
                            </Text>
                          </View>
                          <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
                        </Pressable>

                        {expanded &&
                          monthTransactions.map((item) => (
                            <View key={item.id} style={styles.transactionRow}>
                              <View style={[styles.typePillIcon, item.type === 'income' ? styles.typePillIncome : styles.typePillExpense]}>
                                <Text style={styles.typePillText}>{item.type === 'income' ? '↓' : '↑'}</Text>
                              </View>
                              <View style={styles.transactionRowInfo}>
                                <Text style={styles.transactionRowTitle} numberOfLines={1}>{item.title}</Text>
                                <Text style={styles.transactionRowMeta} numberOfLines={1}>{item.category} · {item.date}</Text>
                                {!!item.description && <Text style={styles.transactionRowDesc} numberOfLines={1}>{item.description}</Text>}
                              </View>

                              <View style={styles.transactionRowRight}>
                                <Text style={[styles.transactionRowAmount, item.type === 'income' ? styles.recentAmountIncome : styles.recentAmountExpense]} numberOfLines={1} adjustsFontSizeToFit>
                                  {item.type === 'income' ? '+' : '-'} {formatCurrency(item.amount)}
                                </Text>
                                <View style={styles.rowActions}>
                                  <Pressable style={styles.iconButton} onPress={() => handleEditStart(item)}>
                                    <Text style={styles.iconButtonText}>✏️</Text>
                                  </Pressable>
                                  <Pressable style={styles.iconButtonDanger} onPress={() => handleDeleteTransaction(item)}>
                                    <Text style={styles.iconButtonText}>🗑️</Text>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          ))}
                      </View>
                    );
                  })
                )}
              </>
            }
          />
        )}

        {activeTab === 'new' && (
          <FlatList
            data={[]}
            renderItem={null}
            keyExtractor={() => 'new'}
            showsVerticalScrollIndicator={false}
            style={styles.tabContentList}
            contentContainerStyle={styles.tabContent}
            ListHeaderComponent={
              <View style={styles.cleanCard}>
                <Text style={styles.tabHeading}>Nova Movimentação</Text>
                <Text style={styles.tabSubheading}>Preencha os dados abaixo para salvar</Text>

                {/* SELETOR RECEITA / DESPESA */}
                <View style={styles.typeSelectorRow}>
                  <Pressable
                    style={[styles.typeOption, form.type === 'income' && styles.typeOptionIncomeActive]}
                    onPress={() => setForm((c) => ({ ...c, type: 'income' }))}
                  >
                    <Text style={[styles.typeOptionText, form.type === 'income' && styles.typeOptionTextActive]}>↓ Receita</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.typeOption, form.type === 'expense' && styles.typeOptionExpenseActive]}
                    onPress={() => setForm((c) => ({ ...c, type: 'expense' }))}
                  >
                    <Text style={[styles.typeOptionText, form.type === 'expense' && styles.typeOptionTextActive]}>↑ Despesa</Text>
                  </Pressable>
                </View>

                <Text style={styles.inputLabel}>Título da transação</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Salário, Aluguel, Supermercado"
                  placeholderTextColor="#94a3b8"
                  value={form.title}
                  onChangeText={(value) => setForm((current) => ({ ...current, title: value }))}
                />

                <View style={styles.rowTwo}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Valor (R$)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0,00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                      value={form.amount}
                      onChangeText={(value) => setForm((current) => ({ ...current, amount: value }))}
                    />
                  </View>

                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Categoria</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: Moradia, Alimentação"
                      placeholderTextColor="#94a3b8"
                      value={form.category}
                      onChangeText={(value) => setForm((current) => ({ ...current, category: value }))}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Data (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-09-11"
                  placeholderTextColor="#94a3b8"
                  value={form.date}
                  onChangeText={(value) => setForm((current) => ({ ...current, date: value }))}
                />

                <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Detalhes adicionais..."
                  placeholderTextColor="#94a3b8"
                  value={form.description}
                  onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
                />

                <Pressable
                  style={styles.primaryButton}
                  onPress={handleTransactionSubmit}
                  disabled={loading}
                >
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Salvando...' : 'Cadastrar Movimentação'}
                  </Text>
                </Pressable>
              </View>
            }
          />
        )}

        {activeTab === 'admin' && user.role === 'admin' && (
          <FlatList
            data={adminData?.users ?? []}
            keyExtractor={(item) => item.id}
            style={styles.tabContentList}
            contentContainerStyle={styles.tabContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.tabHeader}>
                <Text style={styles.tabHeading}>Painel Administrativo</Text>
                <Text style={styles.tabSubheading}>Gerencie usuários e consulte finanças com autorização</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.adminUserCard, selectedAdminUserId === item.id && styles.adminUserCardSelected]}>
                <Pressable style={styles.adminUserInfo} onPress={() => handleSelectAdminUser(item.id)}>
                  <Text style={styles.adminUserName}>{item.name}</Text>
                  <Text style={styles.adminUserEmail}>{item.email}</Text>
                </Pressable>
                <View style={styles.adminUserActions}>
                  <Pressable style={styles.adminEditButton} onPress={() => setEditingAdminUser({ id: item.id, name: item.name, email: item.email, password: '' })}>
                    <Text style={styles.adminActionText}>Editar</Text>
                  </Pressable>
                  <Pressable style={styles.adminDeleteButton} onPress={() => handleAdminUserDelete(item)}>
                    <Text style={styles.adminActionText}>Excluir</Text>
                  </Pressable>
                </View>
              </View>
            )}
            ListFooterComponent={
              <View style={styles.adminTransactionsCard}>
                <Text style={styles.cardTitle}>
                  {selectedUser ? `Finanças de ${selectedUser.name}` : 'Histórico Financeiro do Usuário'}
                </Text>
                {!selectedUser ? (
                  <Text style={styles.emptyStateText}>Selecione um usuário acima para consultar suas movimentações.</Text>
                ) : unlockedAdminUserId !== selectedUser.id ? (
                  <View style={styles.adminPrivacyBox}>
                    <Text style={styles.adminPrivacyTitle}>🔒 Acesso Protegido por Privacidade</Text>
                    <Text style={styles.adminPrivacyText}>
                      Para visualizar as finanças de {selectedUser.name}, digite a senha cadastrada do usuário:
                    </Text>
                    <View style={styles.passwordWrapper}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="Senha do usuário"
                        placeholderTextColor="#94a3b8"
                        secureTextEntry={!showAdminUserPasswordInput}
                        autoCapitalize="none"
                        value={adminUserPasswordInput}
                        onChangeText={setAdminUserPasswordInput}
                      />
                      <Pressable
                        style={styles.eyeButtonAbsolute}
                        onPress={() => setShowAdminUserPasswordInput((prev) => !prev)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.eyeIcon}>{showAdminUserPasswordInput ? '👁️' : '🔒'}</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={[styles.primaryButton, { marginTop: 12 }]}
                      onPress={handleUnlockUserTransactions}
                      disabled={fetchingUserTransactions || !adminUserPasswordInput}
                    >
                      <Text style={styles.primaryButtonText}>
                        {fetchingUserTransactions ? 'Verificando...' : 'Desbloquear Extrato'}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={styles.unlockedHeaderRow}>
                      <Text style={styles.unlockedBadge}>✅ Extrato Liberado ({unlockedTransactions.length} itens)</Text>
                      <Pressable
                        style={styles.lockButton}
                        onPress={() => {
                          setUnlockedAdminUserId(null);
                          setUnlockedTransactions([]);
                        }}
                      >
                        <Text style={styles.lockButtonText}>🔒 Bloquear</Text>
                      </Pressable>
                    </View>

                    {unlockedTransactions.length === 0 ? (
                      <Text style={styles.emptyStateText}>Este usuário não possui movimentações cadastradas.</Text>
                    ) : (
                      unlockedTransactions.map((item) => (
                        <View key={item.id} style={styles.recentItem}>
                          <View style={styles.recentInfo}>
                            <Text style={styles.recentTitle}>{item.title}</Text>
                            <Text style={styles.recentMeta}>{item.category} · {item.date}</Text>
                          </View>
                          <Text style={[styles.recentAmount, item.type === 'income' ? styles.recentAmountIncome : styles.recentAmountExpense]}>
                            {item.type === 'income' ? '+' : '-'} {formatCurrency(item.amount)}
                          </Text>
                        </View>
                      ))
                    )}
                  </>
                )}
              </View>
            }
          />
        )}
      </View>

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

            <Text style={styles.inputLabel}>Título</Text>
            <TextInput
              style={styles.input}
              placeholder="Título"
              placeholderTextColor="#94a3b8"
              value={editForm.title}
              onChangeText={(value) => setEditForm((current) => ({ ...current, title: value }))}
            />

            <View style={styles.rowTwo}>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Valor</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Valor"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  value={editForm.amount}
                  onChangeText={(value) => setEditForm((current) => ({ ...current, amount: value }))}
                />
              </View>

              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Categoria</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Categoria"
                  placeholderTextColor="#94a3b8"
                  value={editForm.category}
                  onChangeText={(value) => setEditForm((current) => ({ ...current, category: value }))}
                />
              </View>
            </View>

            <View style={styles.rowTwo}>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Data</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Data"
                  placeholderTextColor="#94a3b8"
                  value={editForm.date}
                  onChangeText={(value) => setEditForm((current) => ({ ...current, date: value }))}
                />
              </View>

              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Tipo</Text>
                <Pressable
                  style={[styles.typeButton, editForm.type === 'income' ? styles.typeButtonIncome : styles.typeButtonExpense]}
                  onPress={() => setEditForm((current) => ({ ...current, type: current.type === 'income' ? 'expense' : 'income' }))}
                >
                  <Text style={[styles.typeButtonText, editForm.type === 'income' ? styles.typeButtonTextIncome : styles.typeButtonTextExpense]}>
                    {editForm.type === 'income' ? '↓ Receita' : '↑ Despesa'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.inputLabel}>Descrição</Text>
            <TextInput
              style={styles.input}
              placeholder="Descrição"
              placeholderTextColor="#94a3b8"
              value={editForm.description}
              onChangeText={(value) => setEditForm((current) => ({ ...current, description: value }))}
            />

            <Pressable style={styles.primaryButton} onPress={handleEditTransaction} disabled={loading}>
              <Text style={styles.primaryButtonText}>{loading ? 'Salvando...' : 'Salvar alterações'}</Text>
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => setEditingTransaction(null)} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DE EDIÇÃO ADMIN */}
      <Modal visible={editingAdminUser !== null} transparent animationType="slide" onRequestClose={() => setEditingAdminUser(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar usuário</Text>
            <Text style={styles.inputLabel}>Nome</Text>
            <TextInput style={styles.input} placeholder="Nome" placeholderTextColor="#94a3b8" value={editingAdminUser?.name ?? ''} onChangeText={(value) => setEditingAdminUser((current) => current && { ...current, name: value })} />
            <Text style={styles.inputLabel}>E-mail</Text>
            <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor="#94a3b8" autoCapitalize="none" keyboardType="email-address" value={editingAdminUser?.email ?? ''} onChangeText={(value) => setEditingAdminUser((current) => current && { ...current, email: value })} />
            <Text style={styles.inputLabel}>Nova senha (opcional)</Text>
            <View style={styles.passwordWrapper}>
              <TextInput style={[styles.input, styles.passwordInput]} placeholder="Nova senha" placeholderTextColor="#94a3b8" secureTextEntry={!showAdminEditPassword} autoCapitalize="none" value={editingAdminUser?.password ?? ''} onChangeText={(value) => setEditingAdminUser((current) => current && { ...current, password: value })} />
              <Pressable style={styles.eyeButtonAbsolute} onPress={() => setShowAdminEditPassword((prev) => !prev)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.eyeIcon}>{showAdminEditPassword ? '👁️' : '🔒'}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.primaryButton} onPress={handleAdminUserUpdate} disabled={loading}>
              <Text style={styles.primaryButtonText}>Salvar</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setEditingAdminUser(null)}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  mainContent: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  tabContentList: {
    flex: 1,
  },

  topHeader: {
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 4 : 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  headerNavContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    elevation: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },

  topNavTabs: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  topTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },

  topTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  topTabIcon: {
    fontSize: 15,
  },

  topTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  topTabLabelActive: {
    color: '#2563eb',
    fontWeight: '800',
  },

  topHeaderLeft: {
    flex: 1,
  },

  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#2563eb',
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },

  logoutButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexShrink: 0,
  },

  logoutButtonText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },

  tabContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 14,
  },

  tabHeader: {
    marginBottom: 6,
  },

  tabHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },

  tabSubheading: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  mainBalanceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },

  mainBalanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },

  mainBalanceLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },

  statusPill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },

  statusPillText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },

  mainBalanceValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },

  mainBalanceDivider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 16,
  },

  mainBalanceStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  miniStat: {
    flex: 1,
  },

  miniStatSeparator: {
    width: 1,
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
  },

  miniStatLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },

  miniStatIncome: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '800',
  },

  miniStatExpense: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '800',
  },

  quickAddBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  quickAddIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quickAddIcon: {
    fontSize: 18,
  },

  quickAddText: {
    flex: 1,
  },

  quickAddTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e40af',
  },

  quickAddSubtitle: {
    fontSize: 12,
    color: '#3b82f6',
    marginTop: 2,
  },

  quickAddArrow: {
    fontSize: 22,
    color: '#2563eb',
    fontWeight: '700',
  },

  cleanCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    shadowColor: '#64748b',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },

  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'capitalize',
    marginTop: 2,
  },

  viewAllLink: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '700',
  },

  monthControls: {
    flexDirection: 'row',
    gap: 6,
  },

  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  monthArrowText: {
    fontSize: 18,
    color: '#0f172a',
    fontWeight: '700',
    lineHeight: 20,
  },

  compareMonthsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },

  compareMonthText: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'capitalize',
  },

  compareMonthActive: {
    color: '#2563eb',
    fontWeight: '700',
  },

  compareVs: {
    color: '#cbd5e1',
    fontWeight: '700',
  },

  compareRow: {
    flexDirection: 'row',
    gap: 6,
  },

  compareItem: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    minWidth: 0,
  },

  compareLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },

  compareValue: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },

  comparePrevious: {
    color: '#94a3b8',
    fontSize: 8,
    marginTop: 4,
  },

  variation: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },

  variationGreen: {
    color: '#16a34a',
  },

  variationRed: {
    color: '#dc2626',
  },

  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },

  typePillIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  typePillIncome: {
    backgroundColor: '#ecfdf5',
  },

  typePillExpense: {
    backgroundColor: '#fef2f2',
  },

  typePillText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },

  recentInfo: {
    flex: 1,
  },

  recentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },

  recentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },

  recentAmount: {
    fontSize: 14,
    fontWeight: '800',
  },

  recentAmountIncome: {
    color: '#16a34a',
  },

  recentAmountExpense: {
    color: '#dc2626',
  },

  emptyStateText: {
    color: '#94a3b8',
    fontSize: 13,
    paddingVertical: 14,
    textAlign: 'center',
  },

  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },

  fileActionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  exportBtn: {
    backgroundColor: '#0f172a',
  },

  importBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },

  fileActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  importBtnText: {
    color: '#2563eb',
  },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 32,
    alignItems: 'center',
  },

  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },

  emptyCardSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },

  monthGroupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },

  monthGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  monthGroupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'capitalize',
  },

  monthGroupMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },

  chevron: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: '700',
  },

  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    gap: 12,
  },

  transactionRowInfo: {
    flex: 1,
  },

  transactionRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },

  transactionRowMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },

  transactionRowDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },

  transactionRowRight: {
    alignItems: 'flex-end',
  },

  transactionRowAmount: {
    fontSize: 14,
    fontWeight: '800',
  },

  rowActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },

  iconButton: {
    backgroundColor: '#f1f5f9',
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconButtonDanger: {
    backgroundColor: '#fef2f2',
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconButtonText: {
    fontSize: 13,
  },

  typeSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 6,
  },

  typeOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  typeOptionIncomeActive: {
    backgroundColor: '#10b981',
  },

  typeOptionExpenseActive: {
    backgroundColor: '#ef4444',
  },

  typeOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },

  typeOptionTextActive: {
    color: '#ffffff',
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },

  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },

  rowTwo: {
    flexDirection: 'row',
    gap: 10,
  },

  halfInput: {
    flex: 1,
  },

  typeButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  typeButtonIncome: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },

  typeButtonExpense: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },

  typeButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },

  typeButtonTextIncome: {
    color: '#16a34a',
  },

  typeButtonTextExpense: {
    color: '#dc2626',
  },

  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#2563eb',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  cancelButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },

  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },

  adminUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  adminUserCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },

  adminUserInfo: {
    flex: 1,
  },

  adminUserName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },

  adminUserEmail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },

  adminUserActions: {
    flexDirection: 'row',
    gap: 6,
  },

  adminEditButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  adminDeleteButton: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  adminActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },

  adminTransactionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 10,
  },

  adminPrivacyBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },

  adminPrivacyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },

  adminPrivacyText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },

  unlockedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  unlockedBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },

  lockButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },

  lockButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },

  bottomBarContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },

  bottomBar: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 10 : 12,
  },

  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },

  bottomTabActive: {
    transform: [{ scale: 1.05 }],
  },

  bottomTabIcon: {
    fontSize: 20,
  },

  bottomTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },

  bottomTabLabelActive: {
    color: '#2563eb',
    fontWeight: '800',
  },

  authScreen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  authScreenContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 20 : 40,
    paddingBottom: Platform.OS === 'android' ? 140 : 40,
  },

  authCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },

  authFieldsContainer: {
    gap: 12,
  },

  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
    width: '100%',
  },

  passwordInput: {
    paddingRight: 48,
  },

  eyeButtonAbsolute: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },

  eyeIcon: {
    fontSize: 18,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
    marginBottom: 20,
  },

  switchRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },

  switchButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },

  switchButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#64748b',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },

  switchText: {
    fontWeight: '600',
    color: '#64748b',
    fontSize: 14,
  },

  switchTextActive: {
    fontWeight: '800',
    color: '#0f172a',
  },

  textButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },

  textButtonLabel: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    padding: 20,
  },

  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
});
