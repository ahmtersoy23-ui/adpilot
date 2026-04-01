import { Pool } from 'pg';
import { getAdsClient } from './adsApiClient';
import { determineCategory } from '../utils/productGroup';
import dotenv from 'dotenv';
dotenv.config();

// ── Types ────────────────────────────────────────────

export interface BidRecommendation {
  keywordId: string;
  campaignId: string;
  adGroupId: string;
  campaignName: string;
  keywordText: string;
  matchType: string;
  currentBid: number;
  optimalBid: number;
  cappedBid: number;     // after min/max/change caps
  bidDelta: number;      // % change
  clicks: number;
  spend: number;
  sales: number;
  acos: number;
  rpc: number;           // revenue per click
  reason: string;
}

export interface BidOptimizerConfig {
  targetAcos: number;          // default target ACOS %
  categoryTargets: Record<string, number>; // per-category overrides
  campaignTargets: Record<string, number>; // per-campaign (goal) overrides — highest priority
  minBid: number;              // floor
  maxBid: number;              // ceiling
  maxChangePercent: number;    // max daily change %
  minClicks: number;           // minimum clicks for optimization
  zeroSalesBidReduction: number; // % reduction for zero-sales keywords
  lookbackDays: number;        // days of performance data
}

const DEFAULT_CONFIG: BidOptimizerConfig = {
  targetAcos: 25,
  categoryTargets: {},
  campaignTargets: {},
  minBid: 0.10,
  maxBid: 5.00,
  maxChangePercent: 30,
  minClicks: 10,
  zeroSalesBidReduction: 50,
  lookbackDays: 14,
};

// ── DataBridge pool ──────────────────────────────────

let dbPool: Pool | null = null;

function getDataBridgePool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      host: process.env.DATABRIDGE_DB_HOST || 'localhost',
      port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'),
      database: process.env.DATABRIDGE_DB_NAME || 'databridge_db',
      user: process.env.DATABRIDGE_DB_USER || 'pricelab',
      password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return dbPool;
}

const PROFILE_ID = process.env.ADS_PROFILE_ID || '387696953974213';

// Skip auto-targeting expressions (Amazon manages bids)
const AUTO_TARGETING = new Set([
  'loose-match', 'close-match', 'substitutes', 'complements',
]);

// ── Service ──────────────────────────────────────────

export class BidOptimizer {
  constructor(private localPool: Pool) {}

  /**
   * Load config from settings table, falling back to defaults.
   */
  async getConfig(): Promise<BidOptimizerConfig> {
    try {
      // Read target_acos settings (shared with Settings page)
      const result = await this.localPool.query(
        "SELECT value FROM settings WHERE key = 'target_acos'"
      );
      if (result.rows.length) {
        const v = result.rows[0].value;
        return {
          ...DEFAULT_CONFIG,
          targetAcos: v.default || 25,
          categoryTargets: v.by_category || {},
          campaignTargets: v.by_campaign || {},
        };
      }
    } catch { /* use defaults */ }
    return DEFAULT_CONFIG;
  }

  /**
   * Generate bid recommendations without applying them.
   */
  async preview(configOverride?: Partial<BidOptimizerConfig>): Promise<BidRecommendation[]> {
    const config = { ...(await this.getConfig()), ...configOverride };

    // Step 1: Get keyword performance from DataBridge
    const performance = await this.getKeywordPerformance(config.lookbackDays);
    console.log(`[BidOptimizer] ${performance.length} keyword-adgroup combos with ${config.minClicks}+ clicks`);

    // Step 2: Get current bids from Amazon API
    const currentBids = await this.getCurrentBids();
    console.log(`[BidOptimizer] ${currentBids.size} keywords with current bids from API`);

    // Step 3: Calculate optimal bids
    const recommendations: BidRecommendation[] = [];

    for (const kw of performance) {
      // Skip auto targeting
      if (AUTO_TARGETING.has(kw.targeting)) continue;

      // Find current bid
      const bidKey = `${kw.campaign_id}|${kw.ad_group_id}|${kw.targeting}|${kw.match_type}`;
      const currentInfo = currentBids.get(bidKey);
      if (!currentInfo) continue; // keyword not found in API (possibly paused/archived)

      const currentBid = currentInfo.bid;
      const keywordId = currentInfo.keywordId;

      // Calculate optimal bid — priority: campaign target > category target > default
      const campaignPrefix = kw.campaign_name.split(' - MA - SP')[0].split(' - UNV')[0].trim();
      const category = determineCategory(campaignPrefix) || '';
      const targetAcos = config.campaignTargets[kw.campaign_name]
        ?? config.campaignTargets[campaignPrefix]
        ?? config.categoryTargets[category]
        ?? config.targetAcos;
      const rpc = kw.clicks > 0 ? kw.sales / kw.clicks : 0;

      let optimalBid: number;
      let reason: string;

      if (kw.sales === 0) {
        // Zero sales: reduce bid
        optimalBid = currentBid * (1 - config.zeroSalesBidReduction / 100);
        reason = `Zero sales with ${kw.clicks} clicks, $${kw.spend.toFixed(2)} spent`;
      } else {
        optimalBid = (targetAcos / 100) * rpc;
        const kwAcos = kw.sales > 0 ? (kw.spend / kw.sales * 100) : 0;

        if (optimalBid > currentBid) {
          reason = `ACoS ${kwAcos.toFixed(1)}% < target ${targetAcos}%, RPC $${rpc.toFixed(2)} → increase bid`;
        } else {
          reason = `ACoS ${kwAcos.toFixed(1)}% > target ${targetAcos}%, RPC $${rpc.toFixed(2)} → decrease bid`;
        }
      }

      // Apply caps
      const cappedBid = this.capBid(currentBid, optimalBid, config);
      const bidDelta = currentBid > 0 ? ((cappedBid - currentBid) / currentBid * 100) : 0;

      // Skip if change is negligible (< 2%)
      if (Math.abs(bidDelta) < 2) continue;

      recommendations.push({
        keywordId,
        campaignId: kw.campaign_id,
        adGroupId: kw.ad_group_id,
        campaignName: kw.campaign_name,
        keywordText: kw.targeting,
        matchType: kw.match_type,
        currentBid,
        optimalBid: +optimalBid.toFixed(2),
        cappedBid: +cappedBid.toFixed(2),
        bidDelta: +bidDelta.toFixed(1),
        clicks: kw.clicks,
        spend: kw.spend,
        sales: kw.sales,
        acos: kw.sales > 0 ? +(kw.spend / kw.sales * 100).toFixed(2) : 0,
        rpc: +rpc.toFixed(2),
        reason,
      });
    }

    // Sort by absolute bid delta descending (biggest changes first)
    recommendations.sort((a, b) => Math.abs(b.bidDelta) - Math.abs(a.bidDelta));

    console.log(`[BidOptimizer] ${recommendations.length} bid changes recommended`);
    return recommendations;
  }

  /**
   * Apply bid changes via Amazon Ads API.
   */
  async apply(recommendations: BidRecommendation[]): Promise<{ applied: number; errors: string[] }> {
    const client = await getAdsClient();
    let applied = 0;
    const errors: string[] = [];

    // Process in batches of 10 (API limit)
    for (let i = 0; i < recommendations.length; i += 10) {
      const batch = recommendations.slice(i, i + 10);

      try {
        const res = await client.put('/sp/keywords', {
          keywords: batch.map(r => ({
            keywordId: r.keywordId,
            bid: r.cappedBid,
          })),
        }, {
          headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json' },
        });

        // Count successes
        const items = res.data?.keywords || [];
        for (const item of items) {
          if (item.errors?.length) {
            errors.push(`${item.keywordId}: ${item.errors[0]?.errorType || 'unknown'}`);
          } else {
            applied++;
          }
        }
      } catch (err: any) {
        errors.push(`Batch ${Math.floor(i / 10) + 1}: ${err.message}`);
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    console.log(`[BidOptimizer] Applied ${applied}/${recommendations.length} bid changes, ${errors.length} errors`);

    // Log to bid_history table
    await this.logBidChanges(recommendations.filter((_, idx) => idx < applied));

    return { applied, errors };
  }

  // ── Private helpers ────────────────────────────────

  private capBid(currentBid: number, optimalBid: number, config: BidOptimizerConfig): number {
    // Max change per day
    const maxIncrease = currentBid * (1 + config.maxChangePercent / 100);
    const maxDecrease = currentBid * (1 - config.maxChangePercent / 100);
    let capped = Math.max(maxDecrease, Math.min(maxIncrease, optimalBid));

    // Absolute floor/ceiling
    capped = Math.max(config.minBid, Math.min(config.maxBid, capped));

    return +capped.toFixed(2);
  }

  private async getKeywordPerformance(lookbackDays: number): Promise<Array<{
    targeting: string;
    match_type: string;
    campaign_name: string;
    campaign_id: string;
    ad_group_id: string;
    clicks: number;
    spend: number;
    sales: number;
  }>> {
    const pool = getDataBridgePool();
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - lookbackDays + 1);

    const result = await pool.query(`
      SELECT
        targeting,
        match_type,
        campaign_name,
        campaign_id::text,
        ad_group_id::text,
        SUM(clicks)::int as clicks,
        SUM(spend)::numeric as spend,
        SUM(sales_7d)::numeric as sales
      FROM ads_targeting_report
      WHERE profile_id = $1
        AND report_date >= $2::date
        AND report_date <= $3::date
        AND clicks > 0
      GROUP BY targeting, match_type, campaign_name, campaign_id, ad_group_id
      HAVING SUM(clicks) >= $4
      ORDER BY SUM(spend) DESC
    `, [PROFILE_ID, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], 10]);

    return result.rows.map(r => ({
      targeting: r.targeting,
      match_type: r.match_type,
      campaign_name: r.campaign_name,
      campaign_id: r.campaign_id,
      ad_group_id: r.ad_group_id,
      clicks: parseInt(r.clicks) || 0,
      spend: parseFloat(r.spend) || 0,
      sales: parseFloat(r.sales) || 0,
    }));
  }

  private async getCurrentBids(): Promise<Map<string, { keywordId: string; bid: number }>> {
    const client = await getAdsClient();
    const map = new Map<string, { keywordId: string; bid: number }>();

    // List active keywords via SP Keywords API
    try {
      const res = await client.post('/sp/keywords/list', {
        stateFilter: { include: ['ENABLED', 'PAUSED'] },
        maxResults: 10000,
      }, {
        headers: {
          'Content-Type': 'application/vnd.spKeyword.v3+json',
          'Accept': 'application/vnd.spKeyword.v3+json',
        },
      });

      const keywords = res.data?.keywords || [];
      for (const kw of keywords) {
        const key = `${kw.campaignId}|${kw.adGroupId}|${kw.keywordText}|${matchTypeMap(kw.matchType)}`;
        map.set(key, { keywordId: kw.keywordId, bid: kw.bid || 0 });
      }
    } catch (err: any) {
      console.error('[BidOptimizer] Failed to list keywords:', err.message);
    }

    return map;
  }

  private async logBidChanges(changes: BidRecommendation[]): Promise<void> {
    if (!changes.length) return;

    // Create table if not exists
    await this.localPool.query(`
      CREATE TABLE IF NOT EXISTS bid_history (
        id SERIAL PRIMARY KEY,
        keyword_id VARCHAR(50),
        campaign_name VARCHAR(500),
        keyword_text VARCHAR(500),
        match_type VARCHAR(30),
        old_bid DECIMAL(10,2),
        new_bid DECIMAL(10,2),
        optimal_bid DECIMAL(10,2),
        bid_delta DECIMAL(10,2),
        clicks INT,
        spend DECIMAL(10,2),
        sales DECIMAL(10,2),
        acos DECIMAL(10,2),
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    for (const c of changes) {
      await this.localPool.query(`
        INSERT INTO bid_history (keyword_id, campaign_name, keyword_text, match_type,
          old_bid, new_bid, optimal_bid, bid_delta, clicks, spend, sales, acos, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        c.keywordId, c.campaignName, c.keywordText, c.matchType,
        c.currentBid, c.cappedBid, c.optimalBid, c.bidDelta,
        c.clicks, c.spend, c.sales, c.acos, c.reason,
      ]);
    }
  }
}

// Map Amazon API match types to DataBridge report match types
function matchTypeMap(apiMatchType: string): string {
  switch (apiMatchType) {
    case 'EXACT': return 'EXACT';
    case 'PHRASE': return 'PHRASE';
    case 'BROAD': return 'BROAD';
    default: return apiMatchType;
  }
}
