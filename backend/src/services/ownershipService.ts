import { Pool } from 'pg';
import { determineCategory } from '../utils/productGroup';
import dotenv from 'dotenv';
dotenv.config();

// ── Types ────────────────────────────────────────────

export type OwnershipPeriod = 'L14' | 'L30' | 'L60' | 'L90';

export interface OwnershipThresholds {
  minOrders: number;
  minClicks: number;
  minSpend: number;
  heroScoreRatio: number; // support must have > this ratio of hero's score
}

const DEFAULT_THRESHOLDS: OwnershipThresholds = {
  minOrders: 3,
  minClicks: 20,
  minSpend: 5,
  heroScoreRatio: 0.5,
};

export interface KeywordOwnershipResult {
  keyword: string;
  hero: {
    asin: string;
    sku: string;
    campaignName: string;
    category: string;
    score: number;
    spend: number;
    sales: number;
    orders: number;
    clicks: number;
    acos: number;
    cvr: number;
  } | null;
  supporters: Array<{
    asin: string;
    sku: string;
    score: number;
    spend: number;
    sales: number;
  }>;
  excludes: number; // count of ASINs to exclude
  totalCompetitors: number;
  isContested: boolean;
}

export interface OwnershipSummary {
  totalKeywords: number;
  ownedKeywords: number;
  contestedKeywords: number;
  totalAsins: number;
  results: KeywordOwnershipResult[];
}

// ── DataBridge + PriceLab pools ──────────────────────

let dbPool: Pool | null = null;
let plPool: Pool | null = null;

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

function getPricelabPool(): Pool {
  if (!plPool) {
    plPool = new Pool({
      host: process.env.DATABRIDGE_DB_HOST || 'localhost',
      port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'),
      database: 'pricelab_db',
      user: process.env.DATABRIDGE_DB_USER || 'pricelab',
      password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return plPool;
}

const PROFILE_ID = process.env.ADS_PROFILE_ID || '387696953974213';

const PERIOD_DAYS: Record<OwnershipPeriod, number> = {
  L14: 14, L30: 30, L60: 60, L90: 90,
};

// ── Ownership Score ──────────────────────────────────

function calcOwnershipScore(sales: number, cvr: number, acos: number): number {
  if (sales === 0) return 0;
  return (sales * cvr) / (Math.max(0, acos) + 1);
}

// ── ASIN → Category cache ────────────────────────────

let categoryCache: Map<string, string> | null = null;
let categoryCacheTime = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000;

async function getAsinCategoryMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (categoryCache && now - categoryCacheTime < CACHE_TTL) return categoryCache;

  const pool = getPricelabPool();
  const result = await pool.query('SELECT DISTINCT asin, category FROM sku_master WHERE asin IS NOT NULL AND category IS NOT NULL');
  const map = new Map<string, string>();
  for (const r of result.rows) map.set(r.asin, r.category);

  categoryCache = map;
  categoryCacheTime = now;
  return map;
}

// ── Service ──────────────────────────────────────────

export class OwnershipService {

  /**
   * Run full ownership analysis for a period — queries DataBridge directly.
   */
  async analyze(
    period: OwnershipPeriod = 'L30',
    thresholds: OwnershipThresholds = DEFAULT_THRESHOLDS,
  ): Promise<OwnershipSummary> {
    const pool = getDataBridgePool();
    const days = PERIOD_DAYS[period];

    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    console.log(`[Ownership] Analyzing ${period} (${startStr} → ${endStr})...`);

    // Step 1: Get keyword × ASIN performance
    // Join: search_term_report → ads_campaign_asin_map (all ASINs per campaign)
    const rawData = await pool.query(`
      SELECT
        st.customer_search_term as keyword,
        cam.asin,
        cam.sku,
        st.campaign_name,
        SUM(st.spend)::numeric as spend,
        SUM(st.sales_7d)::numeric as sales,
        SUM(st.orders_7d)::int as orders,
        SUM(st.clicks)::int as clicks,
        SUM(st.impressions)::bigint as impressions
      FROM ads_search_term_report st
      JOIN ads_campaign_asin_map cam
        ON st.campaign_id = cam.campaign_id
        AND st.ad_group_id = cam.ad_group_id
      WHERE st.profile_id = $1
        AND st.report_date >= $2::date
        AND st.report_date <= $3::date
        AND st.customer_search_term != '*'
        AND st.customer_search_term != ''
      GROUP BY st.customer_search_term, cam.asin, cam.sku, st.campaign_name
    `, [PROFILE_ID, startStr, endStr]);

    console.log(`[Ownership] ${rawData.rows.length} keyword-ASIN-campaign combos`);

    // Step 2: Get ASIN → category mapping
    const catMap = await getAsinCategoryMap();

    // Step 3: Aggregate by keyword × ASIN (across campaigns)
    const keywordAsinMap = new Map<string, Map<string, {
      asin: string;
      sku: string;
      campaignName: string; // highest-spend campaign
      spend: number;
      sales: number;
      orders: number;
      clicks: number;
    }>>();

    for (const r of rawData.rows) {
      const keyword = r.keyword;
      const asin = r.asin;
      const spend = parseFloat(r.spend) || 0;
      const sales = parseFloat(r.sales) || 0;
      const orders = parseInt(r.orders) || 0;
      const clicks = parseInt(r.clicks) || 0;

      if (!keywordAsinMap.has(keyword)) keywordAsinMap.set(keyword, new Map());
      const asinMap = keywordAsinMap.get(keyword)!;

      const existing = asinMap.get(asin);
      if (existing) {
        existing.spend += spend;
        existing.sales += sales;
        existing.orders += orders;
        existing.clicks += clicks;
        // Keep campaign with highest spend
        if (spend > existing.spend - spend) existing.campaignName = r.campaign_name;
      } else {
        asinMap.set(asin, { asin, sku: r.sku, campaignName: r.campaign_name, spend, sales, orders, clicks });
      }
    }

    console.log(`[Ownership] ${keywordAsinMap.size} unique keywords across ${new Set(rawData.rows.map((r: any) => r.asin)).size} ASINs`);

    // Step 4: Calculate ownership per keyword
    const results: KeywordOwnershipResult[] = [];
    let ownedCount = 0;
    let contestedCount = 0;

    for (const [keyword, asinMap] of keywordAsinMap) {
      // Score each ASIN for this keyword
      const scored = Array.from(asinMap.values()).map(a => {
        const acos = a.sales > 0 ? (a.spend / a.sales * 100) : 0;
        const cvr = a.clicks > 0 ? (a.orders / a.clicks) : 0;
        const score = calcOwnershipScore(a.sales, cvr, acos);
        const meetsThreshold = a.orders >= thresholds.minOrders
          && a.clicks >= thresholds.minClicks
          && a.spend >= thresholds.minSpend;
        return { ...a, acos, cvr, score, meetsThreshold };
      }).sort((a, b) => b.score - a.score);

      // Find hero (highest score that meets threshold)
      const hero = scored.find(s => s.meetsThreshold && s.score > 0) || null;

      if (!hero) {
        contestedCount++;
        results.push({
          keyword,
          hero: null,
          supporters: [],
          excludes: scored.length,
          totalCompetitors: scored.length,
          isContested: true,
        });
        continue;
      }

      ownedCount++;
      const category = catMap.get(hero.asin)
        || determineCategory(hero.campaignName.split(' - MA - SP')[0].trim())
        || 'Other';

      // Classify others
      const supporters = scored.filter(s =>
        s.asin !== hero.asin
        && s.meetsThreshold
        && s.score > hero.score * thresholds.heroScoreRatio
      );

      const excludeCount = scored.filter(s =>
        s.asin !== hero.asin
        && !supporters.some(sup => sup.asin === s.asin)
      ).length;

      results.push({
        keyword,
        hero: {
          asin: hero.asin,
          sku: hero.sku,
          campaignName: hero.campaignName,
          category,
          score: +hero.score.toFixed(4),
          spend: +hero.spend.toFixed(2),
          sales: +hero.sales.toFixed(2),
          orders: hero.orders,
          clicks: hero.clicks,
          acos: +hero.acos.toFixed(2),
          cvr: +(hero.cvr * 100).toFixed(2),
        },
        supporters: supporters.map(s => ({
          asin: s.asin,
          sku: s.sku,
          score: +s.score.toFixed(4),
          spend: +s.spend.toFixed(2),
          sales: +s.sales.toFixed(2),
        })),
        excludes: excludeCount,
        totalCompetitors: scored.length,
        isContested: false,
      });
    }

    // Sort by hero score descending
    results.sort((a, b) => (b.hero?.score || 0) - (a.hero?.score || 0));

    const allAsins = new Set<string>();
    for (const [, asinMap] of keywordAsinMap) {
      for (const asin of asinMap.keys()) allAsins.add(asin);
    }

    console.log(`[Ownership] Done: ${ownedCount} owned, ${contestedCount} contested, ${allAsins.size} ASINs`);

    return {
      totalKeywords: keywordAsinMap.size,
      ownedKeywords: ownedCount,
      contestedKeywords: contestedCount,
      totalAsins: allAsins.size,
      results,
    };
  }
}
