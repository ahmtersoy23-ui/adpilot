import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export default api;

// ── Types ──────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  database: string;
}

export interface StatsResponse {
  products: number;
  campaigns: number;
  keywords: number;
  snapshots: number;
}

export interface Snapshot {
  id: number;
  period_start: string;
  period_end: string;
  status: string;
  row_count: number;
  created_at: string;
}

export interface Action {
  id: number;
  snapshot_id: number;
  channel: string;
  priority: string;
  type: string;
  campaign_name: string;
  keyword_or_asin: string;
  reason: string;
  estimated_savings: number;
  status: string;
  created_at: string;
}

export interface ActionSummary {
  total: number;
  byChannel: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  savings: number;
}

export interface OwnershipRow {
  id: number;
  snapshot_id: number;
  keyword: string;
  hero_asin: string;
  hero_product_group: string;
  category: string;
  score: number;
  role: string;
  role_count: number;
}

export interface CategoryPerformance {
  category: string;
  spend: number;
  sales: number;
  acos: number;
  orders: number;
}

// ── API functions ──────────────────────────────────────

export async function fetchHealth() {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export async function fetchStats() {
  const { data } = await api.get<StatsResponse>('/stats');
  return data;
}

export async function fetchSnapshots() {
  const { data } = await api.get<Snapshot[]>('/snapshots');
  return data;
}

export async function fetchLatestSnapshot() {
  const { data } = await api.get<Snapshot>('/snapshots/latest');
  return data;
}

export async function fetchActions(
  snapshotId: number,
  params?: { channel?: string; priority?: string; type?: string; status?: string }
) {
  const { data } = await api.get<Action[]>(`/snapshots/${snapshotId}/actions`, { params });
  return data;
}

export async function fetchActionSummary(snapshotId: number) {
  const { data } = await api.get<ActionSummary>(`/snapshots/${snapshotId}/actions/summary`);
  return data;
}

export async function fetchOwnership(
  snapshotId: number,
  params?: { limit?: number; offset?: number; search?: string }
) {
  const { data } = await api.get<OwnershipRow[]>(`/snapshots/${snapshotId}/ownership`, { params });
  return data;
}

export async function fetchCategories(snapshotId: number) {
  const { data } = await api.get<CategoryPerformance[]>(`/snapshots/${snapshotId}/categories`);
  return data;
}

export async function patchActionStatus(actionId: number, status: 'approved' | 'skipped' | 'rejected') {
  const { data } = await api.patch(`/actions/${actionId}/status`, { status });
  return data;
}
