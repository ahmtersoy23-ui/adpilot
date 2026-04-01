import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// ── Types ────────────────────────────────────────────

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
  change: Record<keyof KpiValues, number | null>; // percentage change
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

// ── Date helpers ─────────────────────────────────────

const PERIOD_DAYS: Record<Period, number> = {
  L7: 7, L14: 14, L30: 30, L60: 60, L90: 90,
};

function periodRange(period: Period): { start: string; end: string; prevStart: string; prevEnd: string } {
  const days = PERIOD_DAYS[period];
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1); // yesterday (today's data incomplete)
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - days + 1);

  return {
    start: fmt(start),
    end: fmt(end),
    prevStart: fmt(prevStart),
    prevEnd: fmt(prevEnd),
  };
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ── DataBridge pool (read-only, via SSH tunnel) ──────

let dbPool: Pool | null = null;

function getDataBridgePool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      host: process.env.DATABRIDGE_DB_HOST || 'localhost',
      port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'),
      database: process.env.DATABRIDGE_DB_NAME || 'databridge_db',
      user: process.env.DATABRIDGE_DB_USER || 'pricelab',
      password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return dbPool;
}

// ── PriceLab pool (for sku_master category lookup) ───

let plPool: Pool | null = null;

function getPricelabPool(): Pool {
  if (!plPool) {
    plPool = new Pool({
      host: process.env.DATABRIDGE_DB_HOST || 'localhost',
      port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'), // same SSH tunnel
      database: 'pricelab_db',
      user: process.env.DATABRIDGE_DB_USER || 'pricelab',
      password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return plPool;
}

// ── ASIN → Category cache ────────────────────────────

let categoryCache: Map<string, string> | null = null;
let categoryCacheTime = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function getAsinCategoryMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (categoryCache && now - categoryCacheTime < CACHE_TTL) {
    return categoryCache;
  }

  const pool = getPricelabPool();
  const result = await pool.query(`
    SELECT DISTINCT asin, category
    FROM sku_master
    WHERE asin IS NOT NULL AND category IS NOT NULL
  `);

  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.asin, row.category);
  }

  categoryCache = map;
  categoryCacheTime = now;
  console.log(`📦 Category cache refreshed: ${map.size} ASINs`);
  return map;
}

// ── Service ──────────────────────────────────────────

const US_PROFILE_ID = 387696953974213;

export class DashboardService {
  private pool: Pool;

  constructor() {
    this.pool = getDataBridgePool();
  }

  // ── KPIs with period-over-period ───────────────────

  async getKpis(period: Period): Promise<KpiResponse> {
    const { start, end, prevStart, prevEnd } = periodRange(period);

    const [current, previous] = await Promise.all([
      this.aggregateMetrics(start, end),
      this.aggregateMetrics(prevStart, prevEnd),
    ]);

    const change = {} as Record<keyof KpiValues, number | null>;
    for (const key of Object.keys(current) as (keyof KpiValues)[]) {
      const prev = previous[key];
      const cur = current[key];
      if (prev === 0 || prev == null) {
        change[key] = cur > 0 ? null : 0; // null = N/A (infinity)
      } else {
        change[key] = +((cur - prev) / Math.abs(prev) * 100).toFixed(2);
      }
    }

    return {
      current,
      previous,
      change,
      periodStart: start,
      periodEnd: end,
      prevStart,
      prevEnd,
    };
  }

  private async aggregateMetrics(start: string, end: string): Promise<KpiValues> {
    const result = await this.pool.query(`
      SELECT
        COALESCE(SUM(spend), 0)::numeric as spend,
        COALESCE(SUM(sales_7d), 0)::numeric as sales,
        COALESCE(SUM(orders_7d), 0)::int as orders,
        COALESCE(SUM(clicks), 0)::int as clicks,
        COALESCE(SUM(impressions), 0)::bigint as impressions
      FROM ads_targeting_report
      WHERE profile_id = $1
        AND report_date >= $2::date
        AND report_date <= $3::date
    `, [US_PROFILE_ID, start, end]);

    const r = result.rows[0];
    const spend = parseFloat(r.spend) || 0;
    const sales = parseFloat(r.sales) || 0;
    const orders = parseInt(r.orders) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;

    return {
      spend,
      sales,
      acos: sales > 0 ? +(spend / sales * 100).toFixed(2) : 0,
      roas: spend > 0 ? +(sales / spend).toFixed(2) : 0,
      orders,
      clicks,
      impressions,
      cpc: clicks > 0 ? +(spend / clicks).toFixed(2) : 0,
      ctr: impressions > 0 ? +(clicks / impressions * 100).toFixed(2) : 0,
      cvr: clicks > 0 ? +(orders / clicks * 100).toFixed(2) : 0,
    };
  }

  // ── Daily time-series ──────────────────────────────

  async getDaily(period: Period): Promise<DailyRow[]> {
    const { start, end } = periodRange(period);

    const result = await this.pool.query(`
      SELECT
        report_date::text as date,
        COALESCE(SUM(spend), 0)::numeric as spend,
        COALESCE(SUM(sales_7d), 0)::numeric as sales,
        COALESCE(SUM(orders_7d), 0)::int as orders,
        COALESCE(SUM(clicks), 0)::int as clicks,
        COALESCE(SUM(impressions), 0)::bigint as impressions
      FROM ads_targeting_report
      WHERE profile_id = $1
        AND report_date >= $2::date
        AND report_date <= $3::date
      GROUP BY report_date
      ORDER BY report_date
    `, [US_PROFILE_ID, start, end]);

    return result.rows.map(r => ({
      date: r.date,
      spend: parseFloat(r.spend) || 0,
      sales: parseFloat(r.sales) || 0,
      acos: parseFloat(r.sales) > 0
        ? +((parseFloat(r.spend) / parseFloat(r.sales)) * 100).toFixed(2)
        : 0,
      orders: parseInt(r.orders) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
    }));
  }

  // ── Top campaigns ──────────────────────────────────

  async getTopCampaigns(period: Period, limit = 15): Promise<CampaignRow[]> {
    const { start, end } = periodRange(period);

    const result = await this.pool.query(`
      SELECT
        campaign_name,
        SUM(spend)::numeric as spend,
        SUM(sales_7d)::numeric as sales,
        SUM(orders_7d)::int as orders,
        SUM(clicks)::int as clicks,
        SUM(impressions)::bigint as impressions
      FROM ads_targeting_report
      WHERE profile_id = $1
        AND report_date >= $2::date
        AND report_date <= $3::date
      GROUP BY campaign_name
      ORDER BY SUM(spend) DESC
      LIMIT $4
    `, [US_PROFILE_ID, start, end, limit]);

    return result.rows.map(r => {
      const spend = parseFloat(r.spend) || 0;
      const sales = parseFloat(r.sales) || 0;
      const clicks = parseInt(r.clicks) || 0;
      const impressions = parseInt(r.impressions) || 0;
      return {
        campaign_name: r.campaign_name,
        spend,
        sales,
        acos: sales > 0 ? +(spend / sales * 100).toFixed(2) : 0,
        roas: spend > 0 ? +(sales / spend).toFixed(2) : 0,
        orders: parseInt(r.orders) || 0,
        clicks,
        impressions,
        cpc: clicks > 0 ? +(spend / clicks).toFixed(2) : 0,
        ctr: impressions > 0 ? +(clicks / impressions * 100).toFixed(2) : 0,
      };
    });
  }

  // ── Top search terms ───────────────────────────────

  async getTopSearchTerms(period: Period, limit = 20): Promise<SearchTermRow[]> {
    const { start, end } = periodRange(period);

    const result = await this.pool.query(`
      SELECT
        customer_search_term as search_term,
        SUM(spend)::numeric as spend,
        SUM(sales_7d)::numeric as sales,
        SUM(orders_7d)::int as orders,
        SUM(clicks)::int as clicks,
        SUM(impressions)::bigint as impressions
      FROM ads_search_term_report
      WHERE profile_id = $1
        AND report_date >= $2::date
        AND report_date <= $3::date
      GROUP BY customer_search_term
      ORDER BY SUM(spend) DESC
      LIMIT $4
    `, [US_PROFILE_ID, start, end, limit]);

    return result.rows.map(r => {
      const spend = parseFloat(r.spend) || 0;
      const sales = parseFloat(r.sales) || 0;
      const clicks = parseInt(r.clicks) || 0;
      const impressions = parseInt(r.impressions) || 0;
      return {
        search_term: r.search_term,
        spend,
        sales,
        acos: sales > 0 ? +(spend / sales * 100).toFixed(2) : 0,
        orders: parseInt(r.orders) || 0,
        clicks,
        impressions,
        cpc: clicks > 0 ? +(spend / clicks).toFixed(2) : 0,
        ctr: impressions > 0 ? +(clicks / impressions * 100).toFixed(2) : 0,
      };
    });
  }

  // ── Category performance (ASIN report + sku_master) ─

  async getCategories(period: Period): Promise<CategoryRow[]> {
    const { start, end } = periodRange(period);

    // Get ASIN-level performance from advertised_product_report
    const result = await this.pool.query(`
      SELECT
        advertised_asin as asin,
        SUM(spend)::numeric as spend,
        SUM(sales_7d)::numeric as sales,
        SUM(orders_7d)::int as orders,
        SUM(clicks)::int as clicks,
        SUM(impressions)::bigint as impressions
      FROM ads_advertised_product_report
      WHERE profile_id = $1
        AND report_date >= $2::date
        AND report_date <= $3::date
        AND advertised_asin IS NOT NULL
      GROUP BY advertised_asin
    `, [US_PROFILE_ID, start, end]);

    // Get ASIN → category mapping
    const catMap = await getAsinCategoryMap();

    // Aggregate by category
    const byCategory = new Map<string, {
      asins: Set<string>;
      spend: number;
      sales: number;
      orders: number;
      clicks: number;
      impressions: number;
    }>();

    for (const r of result.rows) {
      const category = catMap.get(r.asin) || 'Uncategorized';
      let bucket = byCategory.get(category);
      if (!bucket) {
        bucket = { asins: new Set(), spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
        byCategory.set(category, bucket);
      }
      bucket.asins.add(r.asin);
      bucket.spend += parseFloat(r.spend) || 0;
      bucket.sales += parseFloat(r.sales) || 0;
      bucket.orders += parseInt(r.orders) || 0;
      bucket.clicks += parseInt(r.clicks) || 0;
      bucket.impressions += parseInt(r.impressions) || 0;
    }

    // Convert to array and sort by spend
    return Array.from(byCategory.entries())
      .map(([category, b]) => ({
        category,
        asin_count: b.asins.size,
        spend: +b.spend.toFixed(2),
        sales: +b.sales.toFixed(2),
        acos: b.sales > 0 ? +(b.spend / b.sales * 100).toFixed(2) : 0,
        roas: b.spend > 0 ? +(b.sales / b.spend).toFixed(2) : 0,
        orders: b.orders,
        clicks: b.clicks,
        impressions: b.impressions,
        cpc: b.clicks > 0 ? +(b.spend / b.clicks).toFixed(2) : 0,
        ctr: b.impressions > 0 ? +(b.clicks / b.impressions * 100).toFixed(2) : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }
}
