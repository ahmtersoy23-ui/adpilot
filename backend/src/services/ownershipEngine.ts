import { Pool } from 'pg';

/**
 * Ownership Engine Service
 * Calculates keyword ownership scores and assigns Hero/Support/LongTail/Exclude roles
 * Based on CLAUDE.md specification
 */

// Threshold settings from CLAUDE.md
export interface OwnershipThresholds {
  min_orders: number;
  min_clicks: number;
  min_spend: number;
  hero_score_ratio: number; // Support must have > this ratio of Hero's score
}

export const DEFAULT_THRESHOLDS: OwnershipThresholds = {
  min_orders: 5,
  min_clicks: 50,
  min_spend: 10,
  hero_score_ratio: 0.5, // 50%
};

export interface KeywordProductPerformance {
  keyword_id: number;
  keyword_text: string;
  product_id: number;
  asin: string;
  sku: string;
  product_group: string;
  category: string;
  total_sales: number;
  total_spend: number;
  clicks: number;
  orders: number;
  acos: number;
  cvr: number;
  ownership_score: number;
  meets_threshold: boolean;
}

export interface OwnershipAssignment {
  keyword_id: number;
  keyword_text: string;
  hero_product_id?: number;
  hero_asin?: string;
  hero_product_group?: string;
  hero_score?: number;
  support_products: Array<{
    product_id: number;
    asin: string;
    score: number;
  }>;
  long_tail_products: Array<{
    product_id: number;
    asin: string;
    score: number;
  }>;
  exclude_products: Array<{
    product_id: number;
    asin: string;
    reason: string;
  }>;
  is_contested: boolean;
  total_competitors: number;
}

export class OwnershipEngineService {
  constructor(private pool: Pool) {}

  /**
   * Calculate ownership score for a keyword-product pair
   * Formula: ownership_score = (total_sales × cvr) / (acos + 1)
   */
  calculateOwnershipScore(
    total_sales: number,
    cvr: number,
    acos: number
  ): number {
    if (total_sales === 0) return 0;

    // Ensure acos is never negative
    const safeAcos = Math.max(0, acos);

    // Calculate score
    const score = (total_sales * cvr) / (safeAcos + 1);

    return score;
  }

  /**
   * Check if keyword-product performance meets minimum thresholds
   */
  meetsThreshold(
    orders: number,
    clicks: number,
    spend: number,
    thresholds: OwnershipThresholds = DEFAULT_THRESHOLDS
  ): boolean {
    return (
      orders >= thresholds.min_orders &&
      clicks >= thresholds.min_clicks &&
      spend >= thresholds.min_spend
    );
  }

  /**
   * Get keyword-product performance aggregated across all campaigns
   */
  async getKeywordProductPerformance(
    snapshotId: number,
    thresholds: OwnershipThresholds = DEFAULT_THRESHOLDS
  ): Promise<KeywordProductPerformance[]> {
    console.log('\n📊 Calculating keyword-product performance...');

    const query = `
      WITH keyword_campaign_products AS (
        SELECT DISTINCT
          kcp.keyword_id,
          c.product_group,
          kcp.snapshot_id
        FROM keyword_campaign_performance kcp
        JOIN campaigns c ON kcp.campaign_id = c.id
        WHERE kcp.snapshot_id = $1
      )
      SELECT
        k.id as keyword_id,
        k.keyword_text,
        p.id as product_id,
        p.asin,
        p.sku,
        p.product_group,
        p.category,
        -- Aggregate keyword performance across all campaigns for this product group
        SUM(kcp.total_sales) as total_sales,
        SUM(kcp.spend) as total_spend,
        SUM(kcp.clicks) as clicks,
        SUM(kcp.orders) as orders,
        -- Calculate weighted average ACoS
        CASE
          WHEN SUM(kcp.total_sales) > 0
          THEN (SUM(kcp.spend) / SUM(kcp.total_sales) * 100)
          ELSE 0
        END as acos,
        -- Calculate CVR
        CASE
          WHEN SUM(kcp.clicks) > 0
          THEN (SUM(kcp.orders)::DECIMAL / SUM(kcp.clicks))
          ELSE 0
        END as cvr
      FROM keywords k
      JOIN keyword_campaign_products kcp_link ON k.id = kcp_link.keyword_id
      JOIN products p ON p.product_group = kcp_link.product_group
      JOIN keyword_campaign_performance kcp ON k.id = kcp.keyword_id
      JOIN campaigns c ON kcp.campaign_id = c.id AND c.product_group = p.product_group
      WHERE kcp.snapshot_id = $1
      GROUP BY k.id, k.keyword_text, p.id, p.asin, p.sku, p.product_group, p.category
      HAVING SUM(kcp.clicks) > 0 AND SUM(kcp.orders) > 0  -- Exclude zero-order combinations
      ORDER BY k.keyword_text, total_sales DESC
    `;

    const result = await this.pool.query(query, [snapshotId]);

    // Calculate ownership score and threshold check for each row
    const performances: KeywordProductPerformance[] = result.rows.map((row) => {
      const ownership_score = this.calculateOwnershipScore(
        parseFloat(row.total_sales),
        parseFloat(row.cvr),
        parseFloat(row.acos)
      );

      const meets_threshold = this.meetsThreshold(
        parseInt(row.orders),
        parseInt(row.clicks),
        parseFloat(row.total_spend),
        thresholds
      );

      return {
        keyword_id: row.keyword_id,
        keyword_text: row.keyword_text,
        product_id: row.product_id,
        asin: row.asin,
        sku: row.sku || '',
        product_group: row.product_group,
        category: row.category || 'Uncategorized',
        total_sales: parseFloat(row.total_sales),
        total_spend: parseFloat(row.total_spend),
        clicks: parseInt(row.clicks),
        orders: parseInt(row.orders),
        acos: parseFloat(row.acos),
        cvr: parseFloat(row.cvr),
        ownership_score,
        meets_threshold,
      };
    });

    console.log(`  ✅ Analyzed ${performances.length} keyword-product pairs`);

    return performances;
  }

  /**
   * Assign ownership roles for all keywords
   */
  async assignOwnershipRoles(
    snapshotId: number,
    thresholds: OwnershipThresholds = DEFAULT_THRESHOLDS
  ): Promise<OwnershipAssignment[]> {
    console.log('\n🎯 Assigning ownership roles...');

    // Get all keyword-product performances
    const performances = await this.getKeywordProductPerformance(
      snapshotId,
      thresholds
    );

    // Group by keyword
    const keywordMap = new Map<number, KeywordProductPerformance[]>();

    performances.forEach((perf) => {
      if (!keywordMap.has(perf.keyword_id)) {
        keywordMap.set(perf.keyword_id, []);
      }
      keywordMap.get(perf.keyword_id)!.push(perf);
    });

    const assignments: OwnershipAssignment[] = [];

    // Process each keyword
    for (const [keywordId, products] of keywordMap.entries()) {
      // Sort by ownership score descending
      products.sort((a, b) => b.ownership_score - a.ownership_score);

      const keyword_text = products[0].keyword_text;

      // Find products that meet threshold
      const qualifiedProducts = products.filter((p) => p.meets_threshold);

      let assignment: OwnershipAssignment = {
        keyword_id: keywordId,
        keyword_text,
        support_products: [],
        long_tail_products: [],
        exclude_products: [],
        is_contested: false,
        total_competitors: products.length,
      };

      if (qualifiedProducts.length === 0) {
        // No product meets threshold → keyword is CONTESTED
        assignment.is_contested = true;

        // All products go to exclude with reason
        assignment.exclude_products = products.map((p) => ({
          product_id: p.product_id,
          asin: p.asin,
          reason: 'Below threshold',
        }));
      } else {
        // At least one product meets threshold
        const hero = qualifiedProducts[0];

        assignment.hero_product_id = hero.product_id;
        assignment.hero_asin = hero.asin;
        assignment.hero_product_group = hero.product_group;
        assignment.hero_score = hero.ownership_score;

        const heroScoreThreshold = hero.ownership_score * thresholds.hero_score_ratio;

        // Assign roles to other products
        for (let i = 1; i < products.length; i++) {
          const product = products[i];

          if (!product.meets_threshold) {
            // Doesn't meet threshold → EXCLUDE
            assignment.exclude_products.push({
              product_id: product.product_id,
              asin: product.asin,
              reason: 'Below threshold',
            });
          } else if (product.ownership_score > heroScoreThreshold) {
            // Meets threshold AND score > 50% of Hero → SUPPORT
            assignment.support_products.push({
              product_id: product.product_id,
              asin: product.asin,
              score: product.ownership_score,
            });
          } else {
            // Meets threshold but low score → LONG TAIL
            assignment.long_tail_products.push({
              product_id: product.product_id,
              asin: product.asin,
              score: product.ownership_score,
            });
          }
        }

        // If hero has zero sales, mark as exclude as well
        if (hero.total_sales === 0) {
          assignment.exclude_products.push({
            product_id: hero.product_id,
            asin: hero.asin,
            reason: 'Zero sales',
          });
          assignment.hero_product_id = undefined;
          assignment.hero_asin = undefined;
          assignment.hero_product_group = undefined;
          assignment.hero_score = undefined;
          assignment.is_contested = true;
        }
      }

      assignments.push(assignment);
    }

    console.log(`  ✅ Processed ${assignments.length} keywords`);
    console.log(`     - Contested keywords: ${assignments.filter((a) => a.is_contested).length}`);
    console.log(`     - Keywords with Hero: ${assignments.filter((a) => a.hero_product_id).length}`);

    return assignments;
  }

  /**
   * Save ownership assignments to database
   */
  async saveOwnershipAssignments(
    snapshotId: number,
    assignments: OwnershipAssignment[]
  ): Promise<void> {
    console.log('\n💾 Saving ownership assignments...');

    let heroCount = 0;
    let supportCount = 0;
    let longTailCount = 0;
    let excludeCount = 0;

    for (const assignment of assignments) {
      // Save Hero to keyword_ownership table
      if (assignment.hero_product_id && assignment.hero_score) {
        await this.pool.query(
          `
          INSERT INTO keyword_ownership (
            keyword_id, hero_product_id, ownership_score, status, last_calculated
          ) VALUES ($1, $2, $3, 'auto', NOW())
          ON CONFLICT (keyword_id)
          DO UPDATE SET
            hero_product_id = EXCLUDED.hero_product_id,
            ownership_score = EXCLUDED.ownership_score,
            last_calculated = NOW()
          `,
          [assignment.keyword_id, assignment.hero_product_id, assignment.hero_score]
        );
        heroCount++;

        // Save Hero role
        await this.pool.query(
          `
          INSERT INTO keyword_product_roles (
            keyword_id, product_id, role, ownership_score, snapshot_id
          ) VALUES ($1, $2, 'hero', $3, $4)
          ON CONFLICT (keyword_id, product_id, snapshot_id) DO NOTHING
          `,
          [
            assignment.keyword_id,
            assignment.hero_product_id,
            assignment.hero_score,
            snapshotId,
          ]
        );
      }

      // Save Support products
      for (const support of assignment.support_products) {
        await this.pool.query(
          `
          INSERT INTO keyword_product_roles (
            keyword_id, product_id, role, ownership_score, snapshot_id
          ) VALUES ($1, $2, 'support', $3, $4)
          ON CONFLICT (keyword_id, product_id, snapshot_id) DO NOTHING
          `,
          [assignment.keyword_id, support.product_id, support.score, snapshotId]
        );
        supportCount++;
      }

      // Save Long Tail products
      for (const longTail of assignment.long_tail_products) {
        await this.pool.query(
          `
          INSERT INTO keyword_product_roles (
            keyword_id, product_id, role, ownership_score, snapshot_id
          ) VALUES ($1, $2, 'long_tail', $3, $4)
          ON CONFLICT (keyword_id, product_id, snapshot_id) DO NOTHING
          `,
          [assignment.keyword_id, longTail.product_id, longTail.score, snapshotId]
        );
        longTailCount++;
      }

      // Save Exclude products
      for (const exclude of assignment.exclude_products) {
        const role = assignment.is_contested ? 'contested' : 'exclude';
        await this.pool.query(
          `
          INSERT INTO keyword_product_roles (
            keyword_id, product_id, role, ownership_score, snapshot_id
          ) VALUES ($1, $2, $3, 0, $4)
          ON CONFLICT (keyword_id, product_id, snapshot_id) DO NOTHING
          `,
          [assignment.keyword_id, exclude.product_id, role, snapshotId]
        );
        excludeCount++;
      }
    }

    console.log(`  ✅ Saved ownership assignments:`);
    console.log(`     - Hero: ${heroCount}`);
    console.log(`     - Support: ${supportCount}`);
    console.log(`     - Long Tail: ${longTailCount}`);
    console.log(`     - Exclude: ${excludeCount}`);
  }

  /**
   * Main method: Calculate and assign ownership for a snapshot
   */
  async processOwnership(
    snapshotId: number,
    thresholds: OwnershipThresholds = DEFAULT_THRESHOLDS
  ): Promise<OwnershipAssignment[]> {
    console.log('\n🚀 Starting Ownership Engine...\n');
    console.log(`Snapshot ID: ${snapshotId}`);
    console.log(`Thresholds:`, thresholds);

    // Assign ownership roles
    const assignments = await this.assignOwnershipRoles(snapshotId, thresholds);

    // Save to database
    await this.saveOwnershipAssignments(snapshotId, assignments);

    console.log('\n✨ Ownership Engine complete!\n');

    return assignments;
  }
}
