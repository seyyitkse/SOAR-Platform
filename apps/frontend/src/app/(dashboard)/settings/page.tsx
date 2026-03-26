'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi, usersApi, alertRulesApi, authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Plug,
  Users,
  Bell,
  User,
  Plus,
  Trash2,
  Loader2,
  Power,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Key,
  Check,
} from 'lucide-react';

type TabId = 'integrations' | 'users' | 'alerts' | 'profile';

interface TabItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  permission?: string;
}

const tabs: TabItem[] = [
  { id: 'integrations', label: 'Entegrasyonlar', icon: <Plug className="w-4 h-4" />, permission: 'manage_integrations' },
  { id: 'users', label: 'Kullanicilar', icon: <Users className="w-4 h-4" />, permission: 'manage_users' },
  { id: 'alerts', label: 'Alert Kurallari', icon: <Bell className="w-4 h-4" />, permission: 'manage_alert_rules' },
  { id: 'profile', label: 'Profil', icon: <User className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const availableTabs = tabs.filter((t) => {
    if (!t.permission) return true;
    return user?.permissions[t.permission as keyof typeof user.permissions];
  });

  const [activeTab, setActiveTab] = useState<TabId>(availableTabs[0]?.id || 'profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ayarlar</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform yapilandirmasi ve yonetimi</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'integrations' && <IntegrationsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'alerts' && <AlertsTab />}
      {activeTab === 'profile' && <ProfileTab />}
    </div>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab() {
  const queryClient = useQueryClient();
  const [newKeyIntegration, setNewKeyIntegration] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [showKeyValue, setShowKeyValue] = useState(false);

  const { data: intData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => integrationsApi.getIntegrations(),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => integrationsApi.syncIntegration(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => integrationsApi.updateIntegration(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const addKeyMutation = useMutation({
    mutationFn: ({ integrationId, data }: { integrationId: string; data: { key_name: string; key_value: string } }) =>
      integrationsApi.addApiKey(integrationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setNewKeyIntegration(null);
      setKeyName('');
      setKeyValue('');
    },
  });

  const integrations = intData?.data?.data || [];

  const statusColor = (s: string) => {
    if (s === 'active') return 'text-green-400';
    if (s === 'error') return 'text-red-400';
    if (s === 'syncing') return 'text-blue-400';
    return 'text-slate-400';
  };

  return (
    <div className="space-y-4">
      {integrations.map((int: Record<string, unknown>) => (
        <div key={int.id as string} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Plug className="w-5 h-5 text-muted-foreground" />
              <div>
                <h3 className="font-semibold">{int.display_name as string}</h3>
                <p className={`text-xs font-medium ${statusColor(int.status as string)}`}>{int.status as string}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateMutation.mutate({
                  id: int.id as string,
                  data: { status: (int.status as string) === 'disabled' ? 'active' : 'disabled' },
                })}
                className={`p-2 rounded-lg transition ${(int.status as string) === 'disabled' ? 'hover:bg-green-500/10 text-muted-foreground' : 'hover:bg-red-500/10 text-green-400'}`}
                title="Aktif/Pasif"
              >
                <Power className="w-4 h-4" />
              </button>
              <button
                onClick={() => syncMutation.mutate(int.id as string)}
                disabled={syncMutation.isPending}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition"
                title="Manuel Senkronizasyon"
              >
                <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Base URL</span>
              <span className="font-mono text-xs">{int.base_url as string}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Poll Interval</span>
              <span className="text-xs">{int.poll_interval_sec as number}s</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Son Sync</span>
              <span className="text-xs">{int.last_sync_at ? new Date(int.last_sync_at as string).toLocaleString('tr-TR') : '-'}</span>
            </div>
            {int.error_message && (
              <div className="col-span-2">
                <span className="text-xs text-red-400">{int.error_message as string}</span>
              </div>
            )}
          </div>

          {/* API Key management */}
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Key className="w-3 h-3" /> API Keys
              </span>
              <button
                onClick={() => setNewKeyIntegration(int.id as string)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Yeni Key
              </button>
            </div>

            {/* Add key form */}
            {newKeyIntegration === (int.id as string) && (
              <div className="p-3 rounded-lg bg-muted mb-2 space-y-2">
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Key adi"
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-xs"
                />
                <div className="relative">
                  <input
                    type={showKeyValue ? 'text' : 'password'}
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder="Key degeri"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded text-xs pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyValue(!showKeyValue)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showKeyValue ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setNewKeyIntegration(null); setKeyName(''); setKeyValue(''); }}
                    className="px-3 py-1 text-xs border border-border rounded hover:bg-accent transition"
                  >
                    Iptal
                  </button>
                  <button
                    onClick={() => addKeyMutation.mutate({
                      integrationId: int.id as string,
                      data: { key_name: keyName, key_value: keyValue },
                    })}
                    disabled={!keyName || !keyValue || addKeyMutation.isPending}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition"
                  >
                    Ekle
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      {integrations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Entegrasyon bulunamadi</div>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role_id: '' });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getUsers({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: { username: string; email: string; password: string; role_id: string }) =>
      usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAdd(false);
      setForm({ username: '', email: '', password: '', role_id: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => usersApi.updateUser(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const users = usersData?.data?.data || [];

  const roleColor = (role: string) => {
    if (role === 'super_admin') return 'bg-purple-500/20 text-purple-400';
    if (role === 'admin') return 'bg-blue-500/20 text-blue-400';
    if (role === 'analyst') return 'bg-green-500/20 text-green-400';
    return 'bg-amber-500/20 text-amber-400';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Kullanici Ekle
        </button>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Yeni Kullanici</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="Kullanici adi" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              <input type="email" placeholder="E-posta" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              <input type="password" placeholder="Sifre" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              <input type="text" placeholder="Rol ID" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-accent transition">Iptal</button>
                <button
                  onClick={() => createMutation.mutate(form)}
                  disabled={createMutation.isPending || !form.username || !form.email || !form.password}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Olustur'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kullanici</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-posta</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Durum</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Islem</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: Record<string, unknown>) => (
              <tr key={u.id as string} className="border-b border-border">
                <td className="px-4 py-3 font-medium">{u.username as string}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.email as string}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(((u.role as Record<string, unknown>)?.name as string) || '')}`}>
                    {((u.role as Record<string, unknown>)?.display_name as string) || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${(u.is_active as boolean) ? 'text-green-400' : 'text-red-400'}`}>
                    {(u.is_active as boolean) ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => updateMutation.mutate({ id: u.id as string, data: { is_active: !(u.is_active as boolean) } })}
                    className="p-1.5 rounded hover:bg-accent text-muted-foreground transition"
                    title={`${(u.is_active as boolean) ? 'Devre disi birak' : 'Aktif et'}`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────

function AlertsTab() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: '', description: '', severity_threshold: 7,
    action: 'notify_and_log', is_active: true,
  });

  const { data: rulesData } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => alertRulesApi.getRules(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => alertRulesApi.createRule(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['alert-rules'] }); setShowAdd(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => alertRulesApi.toggleRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertRulesApi.deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const rules = rulesData?.data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
          <Plus className="w-4 h-4" /> Yeni Kural
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Yeni Alert Kurali</h2>
            <div className="space-y-3">
              <input type="text" placeholder="Kural adi" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              <textarea placeholder="Aciklama" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none" rows={2} />
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Severity Esigi (1-10)</label>
                <input type="number" min={1} max={10} value={ruleForm.severity_threshold} onChange={(e) => setRuleForm({ ...ruleForm, severity_threshold: Number(e.target.value) })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
              </div>
              <select value={ruleForm.action} onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                <option value="notify">Bildirim</option>
                <option value="log">Log</option>
                <option value="notify_and_log">Bildirim + Log</option>
              </select>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-accent transition">Iptal</button>
                <button
                  onClick={() => createMutation.mutate({ ...ruleForm, notify_channels: [], condition: {} })}
                  disabled={!ruleForm.name || createMutation.isPending}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition"
                >
                  Olustur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rules.map((rule: Record<string, unknown>) => (
          <div key={rule.id as string} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm">{rule.name as string}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${(rule.is_active as boolean) ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                  {(rule.is_active as boolean) ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{rule.description as string}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Severity &gt;= {rule.severity_threshold as number} | {rule.action as string}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-3">
              <button onClick={() => toggleMutation.mutate(rule.id as string)} className="p-1.5 rounded hover:bg-accent transition" title="Aktif/Pasif">
                <Power className="w-4 h-4" />
              </button>
              <button
                onClick={() => { if (confirm('Kural silinecek. Emin misiniz?')) deleteMutation.mutate(rule.id as string); }}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                title="Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {rules.length === 0 && <div className="text-center py-12 text-muted-foreground">Alert kurali bulunamadi</div>}
      </div>
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChangePassword = async () => {
    setError('');
    setMessage('');
    if (newPw !== confirmPw) {
      setError('Yeni sifreler eslesmiyor');
      return;
    }
    if (newPw.length < 6) {
      setError('Sifre en az 6 karakter olmali');
      return;
    }
    try {
      await usersApi.updateUser(user!.id, { current_password: currentPw, new_password: newPw });
      setMessage('Sifre basariyla degistirildi');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch {
      setError('Sifre degistirilemedi. Mevcut sifrenizi kontrol edin.');
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-4">Profil Bilgileri</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kullanici Adi</span>
            <span className="font-medium">{user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-posta</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rol</span>
            <span className="font-medium">{user?.role}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-4">Sifre Degistir</h3>
        <div className="space-y-3">
          <input type="password" placeholder="Mevcut sifre" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          <input type="password" placeholder="Yeni sifre" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          <input type="password" placeholder="Yeni sifre (tekrar)" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />

          {error && <p className="text-sm text-red-400">{error}</p>}
          {message && <p className="text-sm text-green-400 flex items-center gap-1"><Check className="w-4 h-4" />{message}</p>}

          <button
            onClick={handleChangePassword}
            disabled={!currentPw || !newPw || !confirmPw}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition"
          >
            Sifre Degistir
          </button>
        </div>
      </div>
    </div>
  );
}
