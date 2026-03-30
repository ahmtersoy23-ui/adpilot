import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API response types
export interface Snapshot {
  id: number;
  period_start: string;
  period_end: string;
  marketplace: string;
  total_spend: number;
  total_sales: number;
  acos: number;
  search_term_rows: number;
  targeting_rows: number;
  advertised_product_rows: number;
  upload_date: string;
}

export interface Stats {
  products: number;
  campaigns: number;
  keywords: number;
  snapshots: number;
  otherSkuRatio?: {
    advSales: number;
    otherSales: number;
    percentage: number;
  } | null;
}

export interface Action {
  id: number;
  action_type: string;
  application_channel: string;
  priority: string;
  target_campaign: string;
  target_ad_group?: string;
  target_keyword?: string;
  target_asin?: string;
  current_value?: string;
  recommended_value?: string;
  estimated_monthly_savings: number;
  reason: string;
  status: string;
  created_at: string;
}

export interface ActionSummary {
  action_type: string;
  application_channel: string;
  priority: string;
  count: number;
  total_savings: number;
}

export interface OwnershipRow {
  id: number;
  keyword_text: string;
  hero_asin?: string;
  hero_product_group?: string;
  category?: string;
  ownership_score?: number;
  support_count: number;
  total_competitors: number;
  is_contested: boolean;
}

export interface OwnershipResponse {
  data: OwnershipRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface CategoryPerformance {
  category: string;
  asin_count: number;
  product_groups: number;
  total_spend: number;
  total_sales: number;
  acos: number;
}

// API functions
export const getSnapshots = () => api.get<Snapshot[]>('/api/snapshots');
export const getLatestSnapshot = () => api.get<Snapshot>('/api/snapshots/latest');
export const getStats = () => api.get<Stats>('/api/stats');

export const getActions = (snapshotId: number, params?: { channel?: string; priority?: string; type?: string }) =>
  api.get<Action[]>(`/api/snapshots/${snapshotId}/actions`, { params });

export const getActionSummary = (snapshotId: number, groupBy?: 'priority') =>
  api.get<ActionSummary[]>(`/api/snapshots/${snapshotId}/actions/summary`, { params: groupBy ? { groupBy } : undefined });

export const getOwnership = (snapshotId: number, params?: { limit?: number; offset?: number }) =>
  api.get<OwnershipResponse>(`/api/snapshots/${snapshotId}/ownership`, { params });

export const getCategories = (snapshotId: number) =>
  api.get<CategoryPerformance[]>(`/api/snapshots/${snapshotId}/categories`);

export const getPurchasedProductAnalysis = (snapshotId: number) =>
  api.get(`/api/snapshots/${snapshotId}/purchased-product-analysis`);

export const updateActionStatus = (actionId: number, status: 'pending' | 'applied' | 'skipped') =>
  api.patch(`/api/actions/${actionId}/status`, { status });

export const bulkUpdateActionStatus = (ids: number[], status: 'pending' | 'applied' | 'skipped') =>
  api.patch('/api/actions/bulk-status', { ids, status });
