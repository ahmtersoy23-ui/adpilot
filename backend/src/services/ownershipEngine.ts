import { Pool } from 'pg';

/**
 * Ownership Engine Service — SQL-heavy version
 *
 * All heavy computation (keyword × product cross join, score calculation,
 * role assignment) is done in PostgreSQL. Only the final ~6K assignment
 * rows come to JS. This prevents OOM on large datasets.
 *
 * Score formula: ownership_score = (total_sales × cvr) / (acos + 1)
 * Roles: Hero (top scorer meeting threshold), Support (>50% of hero score),
 *        LongTail (meets threshold but low score), Exclude/Contested (below threshold)
 */

export interface OwnershipThresholds {
  min_orders: number;
  min_clicks: number;
  min_spend: number;
  hero_score_ratio: number;
}

export const DEFAULT_THRESHOLDS: OwnershipThresholds = {
  min_orders: 5,
  min_clicks: 50,
  min_spend: 10,
  hero_score_ratio: 0.5,
};

export interface OwnershipAssignment {
  keyword_id: number;
  keyword_text: string;
  hero_product_id?: number;
  hero_asin?: string;
  hero_product_group?: string;
  hero_score?: number;
  support_products: Array<{ product_id: number; asin: string; score: number }>;
  long_tail_products: Array<{ product_id: number; asin: string; score: number }>;
  exclude_products: Array<{ product_id: number; asin: string; reason: string }>;
  is_contested: boolean;
  total_competitors: number;
}

/**
 * SQL query that computes keyword-product performance, ownership scores,
 * and role assignments entirely in PostgreSQL.
 *
 * Returns one row per keyword-product pair with:
 *   keyword_id, keyword_text, product_id, asin, product_group, category,
 *   ownership_score, meets_threshold, role, hero_score (for the keyword)
 */
const OWNERSHIP_SQL = `
WITH perf AS (
  -- Step 1: Aggregate keyword × product_group performance
  SELECT
    k.id AS keyword_id,
    k.keyword_text,
    p.id AS product_id,
    p.asin,
    p.product_group,
    p.category,
    SUM(kcp.total_sales)::numeric AS total_sales,
    SUM(kcp.spend)::numeric AS total_spend,
    SUM(kcp.clicks)::int AS clicks,
    SUM(kcp.orders)::int AS orders,
    CASE WHEN SUM(kcp.total_sales) > 0
      THEN (SUM(kcp.spend) / SUM(kcp.total_sales) * 100)
      ELSE 0
    END AS acos,
    CASE WHEN SUM(kcp.clicks) > 0
      THEN (SUM(kcp.orders)::numeric / SUM(kcp.clicks))
      ELSE 0
    END AS cvr
  FROM keywords k
  JOIN keyword_campaign_performance kcp ON k.id = kcp.keyword_id
  JOIN campaigns c ON kcp.campaign_id = c.id
  JOIN products p ON p.product_group = c.product_group
  WHERE kcp.snapshot_id = $1
  GROUP BY k.id, k.keyword_text, p.id, p.asin, p.product_group, p.category
  HAVING SUM(kcp.clicks) > 0 AND SUM(kcp.orders) > 0
),
scored AS (
  -- Step 2: Calculate ownership score and threshold
  SELECT *,
    CASE WHEN total_sales > 0
      THEN (total_sales * cvr) / (GREATEST(acos, 0) + 1)
      ELSE 0
    END AS ownership_score,
    (orders >= $2 AND clicks >= $3 AND total_spend >= $4) AS meets_threshold
  FROM perf
),
ranked AS (
  -- Step 3: Rank products per keyword (by score desc)
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY keyword_id ORDER BY ownership_score DESC) AS rank,
    COUNT(*) OVER (PARTITION BY keyword_id) AS total_competitors,
    MAX(CASE WHEN (orders >= $2 AND clicks >= $3 AND total_spend >= $4)
      THEN ownership_score ELSE 0 END)
      OVER (PARTITION BY keyword_id) AS hero_score
  FROM scored
),
assigned AS (
  -- Step 4: Assign roles
  SELECT *,
    CASE
      -- No qualified product for this keyword → contested
      WHEN hero_score = 0 THEN 'contested'
      -- Top scorer that meets threshold and has sales → hero
      WHEN rank = 1 AND meets_threshold AND total_sales > 0 THEN 'hero'
      -- Meets threshold, score > 50% of hero → support
      WHEN meets_threshold AND ownership_score > (hero_score * $5) THEN 'support'
      -- Meets threshold but low score → long_tail
      WHEN meets_threshold THEN 'long_tail'
      -- Below threshold → exclude
      ELSE 'exclude'
    END AS role
  FROM ranked
)
SELECT
  keyword_id, keyword_text,
  product_id, asin, product_group, category,
  ownership_score::float, meets_threshold,
  total_competitors::int, hero_score::float,
  role
FROM assigned
ORDER BY keyword_id, rank
`;

export class OwnershipEngineService {
  constructor(private pool: Pool) {}

  /**
   * Main method: Calculate and assign ownership for a snapshot.
   * All heavy lifting in SQL — JS only structures the result.
   */
  async processOwnership(
    snapshotId: number,
    thresholds: OwnershipThresholds = DEFAULT_THRESHOLDS,
  ): Promise<OwnershipAssignment[]> {
    console.log('\n🚀 Starting Ownership Engine (SQL-heavy)...\n');
    console.log(`Snapshot ID: ${snapshotId}`);
    console.log(`Thresholds:`, thresholds);

    // Single SQL query does all computation
    console.log('\n📊 Running ownership SQL...');
    const result = await this.pool.query(OWNERSHIP_SQL, [
      snapshotId,
      thresholds.min_orders,
      thresholds.min_clicks,
      thresholds.min_spend,
      thresholds.hero_score_ratio,
    ]);

    console.log(`  ✅ SQL returned ${result.rows.length} keyword-product pairs`);

    // Group rows into assignments (one per keyword)
    const assignments = this.buildAssignments(result.rows);

    console.log(`\n🎯 ${assignments.length} keywords processed`);
    console.log(`   - With Hero: ${assignments.filter(a => a.hero_product_id).length}`);
    console.log(`   - Contested: ${assignments.filter(a => a.is_contested).length}`);

    // Save to DB
    await this.saveOwnershipAssignments(snapshotId, assignments);

    console.log('\n✨ Ownership Engine complete!\n');
    return assignments;
  }

  /**
   * Group flat SQL rows into OwnershipAssignment objects.
   */
  private buildAssignments(rows: any[]): OwnershipAssignment[] {
    const map = new Map<number, OwnershipAssignment>();

    for (const r of rows) {
      const kwId = r.keyword_id;

      if (!map.has(kwId)) {
        map.set(kwId, {
          keyword_id: kwId,
          keyword_text: r.keyword_text,
          support_products: [],
          long_tail_products: [],
          exclude_products: [],
          is_contested: false,
          total_competitors: r.total_competitors,
        });
      }

      const a = map.get(kwId)!;
      const score = parseFloat(r.ownership_score) || 0;

      switch (r.role) {
        case 'hero':
          a.hero_product_id = r.product_id;
          a.hero_asin = r.asin;
          a.hero_product_group = r.product_group;
          a.hero_score = score;
          break;
        case 'support':
          a.support_products.push({ product_id: r.product_id, asin: r.asin, score });
          break;
        case 'long_tail':
          a.long_tail_products.push({ product_id: r.product_id, asin: r.asin, score });
          break;
        case 'exclude':
          a.exclude_products.push({ product_id: r.product_id, asin: r.asin, reason: 'Below threshold' });
          break;
        case 'contested':
          a.is_contested = true;
          a.exclude_products.push({ product_id: r.product_id, asin: r.asin, reason: 'No qualified hero' });
          break;
      }
    }

    return Array.from(map.values());
  }

  /**
   * Batch-save ownership assignments to database.
   */
  private async saveOwnershipAssignments(
    snapshotId: number,
    assignments: OwnershipAssignment[],
  ): Promise<void> {
    console.log('\n💾 Saving ownership assignments...');

    // Build bulk values for keyword_product_roles
    const roleValues: any[][] = [];

    for (const a of assignments) {
      if (a.hero_product_id && a.hero_score) {
        roleValues.push([a.keyword_id, a.hero_product_id, 'hero', a.hero_score, snapshotId]);
      }
      for (const s of a.support_products) {
        roleValues.push([a.keyword_id, s.product_id, 'support', s.score, snapshotId]);
      }
      for (const l of a.long_tail_products) {
        roleValues.push([a.keyword_id, l.product_id, 'long_tail', l.score, snapshotId]);
      }
      for (const e of a.exclude_products) {
        const role = a.is_contested ? 'contested' : 'exclude';
        roleValues.push([a.keyword_id, e.product_id, role, 0, snapshotId]);
      }
    }

    // Batch insert roles (500 per batch)
    const BATCH = 500;
    for (let i = 0; i < roleValues.length; i += BATCH) {
      const batch = roleValues.slice(i, i + BATCH);
      const placeholders: string[] = [];
      const values: any[] = [];

      batch.forEach((row, j) => {
        const offset = j * 5;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
        values.push(...row);
      });

      await this.pool.query(
        `INSERT INTO keyword_product_roles (keyword_id, product_id, role, ownership_score, snapshot_id)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (keyword_id, product_id, snapshot_id) DO NOTHING`,
        values,
      );
    }

    // Batch upsert keyword_ownership (hero assignments only)
    const heroes = assignments.filter(a => a.hero_product_id && a.hero_score);
    for (let i = 0; i < heroes.length; i += BATCH) {
      const batch = heroes.slice(i, i + BATCH);
      const placeholders: string[] = [];
      const values: any[] = [];

      batch.forEach((a, j) => {
        const offset = j * 3;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'auto', NOW())`);
        values.push(a.keyword_id, a.hero_product_id, a.hero_score);
      });

      await this.pool.query(
        `INSERT INTO keyword_ownership (keyword_id, hero_product_id, ownership_score, status, last_calculated)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (keyword_id)
         DO UPDATE SET hero_product_id = EXCLUDED.hero_product_id,
           ownership_score = EXCLUDED.ownership_score, last_calculated = NOW()`,
        values,
      );
    }

    const heroCount = heroes.length;
    const supportCount = assignments.reduce((s, a) => s + a.support_products.length, 0);
    const longTailCount = assignments.reduce((s, a) => s + a.long_tail_products.length, 0);
    const excludeCount = assignments.reduce((s, a) => s + a.exclude_products.length, 0);

    console.log(`  ✅ Saved: ${heroCount} hero, ${supportCount} support, ${longTailCount} long_tail, ${excludeCount} exclude`);
    console.log(`  ✅ Total roles: ${roleValues.length}`);
  }
}
