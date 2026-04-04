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
  marketplace: string;
  total_spend: string;
  total_sales: string;
  acos: string;
  total_rows: number;
  upload_date: string;
}

export interface Action {
  id: number;
  snapshot_id: number;
  application_channel: string;
  priority: string;
  action_type: string;
  target_campaign: string | null;
  target_ad_group: string | null;
  target_keyword: string | null;
  target_asin: string | null;
  current_value: string | null;
  recommended_value: string | null;
  reason: string;
  estimated_monthly_savings: string;
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
  keyword_text: string;
  hero_asin: string;
  hero_product_group: string;
  category: string;
  ownership_score: string;
  support_count: string;
  total_competitors: string;
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
  asin_count: string;
  product_groups: string;
  total_spend: string;
  total_sales: string;
  // Computed by fetchCategories
  acos: number;
  spend: number;
  sales: number;
}

// ── API functions ──────────────────────────────────────

export async function fetchHealth() {
  const { data } = await axios.get<HealthResponse>('/health', { withCredentials: true });
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

export async function fetchActionSummary(snapshotId: number): Promise<ActionSummary> {
  const { data } = await api.get(`/snapshots/${snapshotId}/actions/summary`);

  // API returns flat array: [{ action_type, count, total_savings }, ...]
  // Transform to ActionSummary shape
  const rows = Array.isArray(data) ? data : [];
  const byType: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let total = 0;
  let savings = 0;

  for (const r of rows) {
    const type = r.action_type || r.type || 'unknown';
    const count = parseInt(r.count) || 0;
    const sav = parseFloat(r.total_savings) || 0;

    byType[type] = (byType[type] || 0) + count;
    total += count;
    savings += sav;

    if (r.application_channel && r.application_channel !== 'all') {
      byChannel[r.application_channel] = (byChannel[r.application_channel] || 0) + count;
    }
    if (r.priority && r.priority !== 'all') {
      byPriority[r.priority] = (byPriority[r.priority] || 0) + count;
    }
  }

  return { total, byType, byChannel, byPriority, savings };
}

export async function fetchOwnership(
  snapshotId: number,
  params?: { limit?: number; offset?: number; search?: string }
): Promise<OwnershipResponse> {
  const { data } = await api.get<OwnershipResponse>(`/snapshots/${snapshotId}/ownership`, { params });
  return data;
}

export async function fetchCategories(snapshotId: number): Promise<CategoryPerformance[]> {
  const { data } = await api.get(`/snapshots/${snapshotId}/categories`);
  return (data || []).map((r: any) => ({
    ...r,
    spend: parseFloat(r.total_spend) || 0,
    sales: parseFloat(r.total_sales) || 0,
    acos: parseFloat(r.acos) || 0,
  }));
}

export async function patchActionStatus(actionId: number, status: 'approved' | 'skipped' | 'rejected') {
  const { data } = await api.patch(`/actions/${actionId}/status`, { status });
  return data;
}

export interface ExecutionResult {
  actionId: number;
  success: boolean;
  message: string;
}

export async function executeAction(actionId: number) {
  const { data } = await api.post<ExecutionResult>(`/actions/${actionId}/execute`);
  return data;
}

export async function executeBulkActions(ids: number[]) {
  const { data } = await api.post('/actions/bulk-execute', { ids });
  return data;
}

// ── Dashboard types ──────────────────────────────────

export type Period = 'L7' | 'L14' | 'L30' | 'L60' | 'L90';

export interface KpiValues {
  spend: number;
  sales: number;
  acos: number;
  roas: number;
  orders: number;
  clicks: number;
  impressions: number;
  cpc: number;
  ctr: number;
  cvr: number;
}

export interface KpiResponse {
  current: KpiValues;
  previous: KpiValues;
  change: Record<keyof KpiValues, number | null>;
  periodStart: string;
  periodEnd: string;
  prevStart: string;
  prevEnd: string;
}

export interface DailyRow {
  date: string;
  spend: number;
  sales: number;
  acos: number;
  orders: number;
  clicks: number;
  impressions: number;
}

export interface CampaignRow {
  campaign_name: string;
  campaign_id?: string;
  spend: number;
  sales: number;
  acos: number;
  roas: number;
  orders: number;
  clicks: number;
  impressions: number;
  cpc: number;
  ctr: number;
}

export interface SearchTermRow {
  search_term: string;
  spend: number;
  sales: number;
  acos: number;
  orders: number;
  clicks: number;
  impressions: number;
  cpc: number;
  ctr: number;
}

export interface CategoryRow {
  category: string;
  asin_count: number;
  spend: number;
  sales: number;
  acos: number;
  roas: number;
  orders: number;
  clicks: number;
  impressions: number;
  cpc: number;
  ctr: number;
}

// ── Dashboard API functions ──────────────────────────

export async function fetchDashboardKpis(period: Period) {
  const { data } = await api.get<KpiResponse>('/dashboard/kpis', { params: { period } });
  return data;
}

export async function fetchDashboardDaily(period: Period) {
  const { data } = await api.get<DailyRow[]>('/dashboard/daily', { params: { period } });
  return data;
}

export async function fetchDashboardCampaigns(period: Period, limit = 15) {
  const { data } = await api.get<CampaignRow[]>('/dashboard/campaigns', { params: { period, limit } });
  return data;
}

export async function fetchDashboardSearchTerms(period: Period, limit = 20) {
  const { data } = await api.get<SearchTermRow[]>('/dashboard/search-terms', { params: { period, limit } });
  return data;
}

export async function fetchDashboardCategories(period: Period) {
  const { data } = await api.get<CategoryRow[]>('/dashboard/categories', { params: { period } });
  return data;
}

// ── Budget Recommendations ──────────────────────────

export interface BudgetRecommendation {
  index: number;
  campaignId: string;
  suggestedBudget: number;
  sevenDaysMissedOpportunities?: {
    startDate: string;
    endDate: string;
    percentTimeInBudget: number;
    estimatedMissedImpressionsLower: number;
    estimatedMissedImpressionsUpper: number;
    estimatedMissedClicksLower: number;
    estimatedMissedClicksUpper: number;
    estimatedMissedSalesLower: number;
    estimatedMissedSalesUpper: number;
  };
  budgetRuleRecommendation?: any;
}

export async function fetchBudgetRecommendations(campaignIds: string[]) {
  const { data } = await api.get<{ recommendations: BudgetRecommendation[] }>(
    '/recommendations/budget',
    { params: { campaignIds: campaignIds.join(',') } }
  );
  return data.recommendations;
}

// ── Bid Recommendations ──────────────────────────────

export interface BidValue { suggestedBid: number }

export interface BidExpressionResult {
  targetingExpression: { type: string; value: string | null };
  bidValues: BidValue[];
}

export interface BidTheme {
  theme: string;
  bidRecommendationsForTargetingExpressions: BidExpressionResult[];
}

export async function fetchBidRecommendations(
  campaignId: string,
  adGroupId: string,
  type: 'auto' | 'keyword',
  keywords?: { text: string; matchType: 'BROAD' | 'EXACT' | 'PHRASE' }[]
) {
  const { data } = await api.post<{ recommendations: BidTheme[] }>('/recommendations/bids', {
    campaignId,
    adGroupId,
    type,
    keywords,
  });
  return data.recommendations;
}

// ── Keyword Recommendations ──────────────────────────

export interface KeywordBidInfo {
  matchType: string;
  rank: number;
  bid: number;
  suggestedBid: { rangeStart: number; rangeMedian: number; rangeEnd: number };
}

export interface KeywordRecommendation {
  keyword: string;
  translation?: string;
  userSelectedKeyword: boolean;
  searchTermImpressionRank?: number;
  searchTermImpressionShare?: number;
  recId: string;
  bidInfo: KeywordBidInfo[];
}

export async function fetchKeywordRecommendations(asins: string[], max = 200) {
  const { data } = await api.get<{ recommendations: KeywordRecommendation[] }>(
    '/recommendations/keywords',
    { params: { asins: asins.join(','), max } }
  );
  return data.recommendations;
}

// ── Bid Optimizer (existing) ──────────────────────────

export interface BidPreviewRow {
  keywordId: string;
  keywordText: string;
  matchType: string;
  campaignName: string;
  campaignId: string;
  adGroupId: string;
  currentBid: number;
  optimalBid: number;
  cappedBid: number;
  bidDelta: number;
  clicks: number;
  spend: number;
  sales: number;
  acos: number;
  rpc: number;
  reason: string;
}

export async function fetchBidPreview(days = 14) {
  const { data } = await api.get<{ recommendations: BidPreviewRow[] }>('/bids/preview', { params: { days } });
  return data.recommendations;
}

export async function applyBids(ids?: string[]) {
  const { data } = await api.post('/bids/apply', { ids });
  return data;
}
