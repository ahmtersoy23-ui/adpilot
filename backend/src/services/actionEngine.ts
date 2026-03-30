import { Pool } from 'pg';
import { OwnershipAssignment } from './ownershipEngine';

/**
 * Action Generation Engine
 * Generates 5 types of optimization actions based on ownership assignments
 * Based on CLAUDE.md specification
 */

export interface ActionCriteria {
  // Campaign pause criteria
  pause_acos_threshold: number; // %
  pause_spend_threshold: number; // $
  pause_zero_sales_spend: number; // $

  // Negative keyword criteria
  negative_zero_sales_spend: number; // $

  // ASIN criteria
  asin_zero_sales_spend: number; // $
  asin_other_sku_ratio: number; // %
  asin_other_sku_spend: number; // $
}

export const DEFAULT_ACTION_CRITERIA: ActionCriteria = {
  pause_acos_threshold: 100, // 100%
  pause_spend_threshold: 30, // $30
  pause_zero_sales_spend: 15, // $15

  negative_zero_sales_spend: 5, // $5

  asin_zero_sales_spend: 10, // $10
  asin_other_sku_ratio: 90, // 90%
  asin_other_sku_spend: 50, // $50
};

export interface Action {
  action_type: 'campaign_pause' | 'bid_change' | 'negative_add' | 'asin_remove' | 'negative_asin_add';
  application_channel: 'bulk_sheet' | 'perpetua';
  priority: 'P1' | 'P2' | 'P3';
  target_campaign?: string;
  target_ad_group?: string;
  target_keyword?: string;
  target_asin?: string;
  current_value?: string;
  recommended_value?: string;
  estimated_monthly_savings?: number;
  reason: string;
}

export class ActionEngineService {
  constructor(private pool: Pool) {}

  /**
   * Determine action priority based on spend and performance
   */
  determinePriority(spend: number, acos: number): 'P1' | 'P2' | 'P3' {
    // P1: Urgent (spend > $200/60days OR ACoS > 100% OR zero sales + spend > $50)
    if (spend > 200 || acos > 100 || (acos === 0 && spend > 50)) {
      return 'P1';
    }

    // P2: High (spend > $50/60days OR ACoS > 50%)
    if (spend > 50 || acos > 50) {
      return 'P2';
    }

    // P3: Medium
    return 'P3';
  }

  /**
   * Generate Action Type 1: Negative Keyword Addition (→ Amazon Bulk Sheet)
   * Criteria:
   * - Keyword-campaign pair: sales = 0 AND spend ≥ $5
   * - Ownership: this keyword is another product's Hero → add negative exact
   */
  async generateNegativeKeywordActions(
    snapshotId: number,
    assignments: OwnershipAssignment[],
    criteria: ActionCriteria = DEFAULT_ACTION_CRITERIA
  ): Promise<Action[]> {
    console.log('\n🔍 Generating Negative Keyword actions...');

    const actions: Action[] = [];

    // Get zero-sale keyword-campaign pairs with spend > threshold
    const query = `
      SELECT
        k.keyword_text,
        c.campaign_name,
        c.ad_group_name,
        kcp.spend,
        kcp.total_sales,
        kcp.clicks
      FROM keyword_campaign_performance kcp
      JOIN keywords k ON kcp.keyword_id = k.id
      JOIN campaigns c ON kcp.campaign_id = c.id
      WHERE kcp.snapshot_id = $1
        AND kcp.total_sales = 0
        AND kcp.spend >= $2
      ORDER BY kcp.spend DESC
    `;

    const result = await this.pool.query(query, [
      snapshotId,
      criteria.negative_zero_sales_spend,
    ]);

    for (const row of result.rows) {
      const spend = parseFloat(row.spend);
      const estimatedMonthlySavings = (spend / 60) * 30; // Convert 60-day to monthly

      actions.push({
        action_type: 'negative_add',
        application_channel: 'bulk_sheet',
        priority: this.determinePriority(spend, 0),
        target_campaign: row.campaign_name,
        target_ad_group: row.ad_group_name,
        target_keyword: row.keyword_text,
        current_value: 'Active',
        recommended_value: 'Negative Exact',
        estimated_monthly_savings: estimatedMonthlySavings,
        reason: `Zero sales, $${spend.toFixed(2)} wasted spend`,
      });
    }

    // Also check ownership-based negatives (keyword is Hero for another product)
    for (const assignment of assignments) {
      if (!assignment.hero_product_id || assignment.exclude_products.length === 0) {
        continue;
      }

      // For each excluded product, find its campaigns and add negative
      for (const exclude of assignment.exclude_products) {
        const campaignQuery = `
          SELECT DISTINCT
            c.campaign_name,
            c.ad_group_name,
            kcp.spend
          FROM keyword_campaign_performance kcp
          JOIN campaigns c ON kcp.campaign_id = c.id
          JOIN asin_campaign_performance acp ON acp.campaign_id = c.id AND acp.snapshot_id = kcp.snapshot_id
          WHERE kcp.snapshot_id = $1
            AND kcp.keyword_id = $2
            AND acp.product_id = $3
            AND kcp.spend > 0
        `;

        const campaignResult = await this.pool.query(campaignQuery, [
          snapshotId,
          assignment.keyword_id,
          exclude.product_id,
        ]);

        for (const campaign of campaignResult.rows) {
          const spend = parseFloat(campaign.spend);
          const estimatedMonthlySavings = (spend / 60) * 30;

          actions.push({
            action_type: 'negative_add',
            application_channel: 'bulk_sheet',
            priority: this.determinePriority(spend, 0),
            target_campaign: campaign.campaign_name,
            target_ad_group: campaign.ad_group_name,
            target_keyword: assignment.keyword_text,
            current_value: 'Active',
            recommended_value: 'Negative Exact',
            estimated_monthly_savings: estimatedMonthlySavings,
            reason: `Keyword owned by ${assignment.hero_product_group} (Hero)`,
          });
        }
      }
    }

    console.log(`  ✅ Generated ${actions.length} negative keyword actions`);

    return actions;
  }

  /**
   * Generate Action Type 2: Campaign Pause (→ Perpetua Dashboard)
   * Criteria:
   * - ACoS > 50% AND spend > $30
   * - Sales = 0 AND spend > $15
   * - ACoS > 100%
   */
  async generateCampaignPauseActions(
    snapshotId: number,
    criteria: ActionCriteria = DEFAULT_ACTION_CRITERIA
  ): Promise<Action[]> {
    console.log('\n⏸️  Generating Campaign Pause actions...');

    const query = `
      SELECT
        c.campaign_name,
        c.product_group,
        SUM(kcp.spend) as total_spend,
        SUM(kcp.total_sales) as total_sales,
        SUM(kcp.orders) as total_orders,
        CASE
          WHEN SUM(kcp.total_sales) > 0
          THEN (SUM(kcp.spend) / SUM(kcp.total_sales) * 100)
          ELSE 0
        END as acos
      FROM campaigns c
      JOIN keyword_campaign_performance kcp ON c.id = kcp.campaign_id
      WHERE kcp.snapshot_id = $1
      GROUP BY c.campaign_name, c.product_group
      HAVING
        (
          (SUM(kcp.total_sales) = 0 AND SUM(kcp.spend) > $2)
          OR
          (SUM(kcp.total_sales) > 0 AND SUM(kcp.spend) / SUM(kcp.total_sales) * 100 > $3 AND SUM(kcp.spend) > $4)
          OR
          (SUM(kcp.total_sales) > 0 AND SUM(kcp.spend) / SUM(kcp.total_sales) * 100 > 100)
        )
      ORDER BY acos DESC, total_spend DESC
    `;

    const result = await this.pool.query(query, [
      snapshotId,
      criteria.pause_zero_sales_spend,
      criteria.pause_acos_threshold / 2, // 50%
      criteria.pause_spend_threshold,
    ]);

    const actions: Action[] = result.rows.map((row) => {
      const spend = parseFloat(row.total_spend);
      const sales = parseFloat(row.total_sales);
      const acos = parseFloat(row.acos);
      const estimatedMonthlySavings = (spend / 60) * 30;

      let reason = '';
      if (sales === 0) {
        reason = `Zero sales, $${spend.toFixed(2)} wasted`;
      } else if (acos > 100) {
        reason = `ACoS ${acos.toFixed(1)}% (critical), losing money`;
      } else {
        reason = `ACoS ${acos.toFixed(1)}% (high), $${spend.toFixed(2)} spend`;
      }

      return {
        action_type: 'campaign_pause',
        application_channel: 'perpetua',
        priority: this.determinePriority(spend, acos),
        target_campaign: row.campaign_name,
        current_value: `ACoS ${acos.toFixed(1)}%`,
        recommended_value: 'Pause Goal',
        estimated_monthly_savings: estimatedMonthlySavings,
        reason: `Perpetua → Goals → ${row.product_group} → Pause. ${reason}`,
      };
    });

    console.log(`  ✅ Generated ${actions.length} campaign pause actions`);

    return actions;
  }

  /**
   * Generate Action Type 3: Bid/ACoS Target Change (→ Perpetua Dashboard)
   * Identifies campaigns with ACoS above target and recommends Perpetua ACoS target adjustments
   */
  async generateBidChangeActions(
    snapshotId: number,
    assignments: OwnershipAssignment[]
  ): Promise<Action[]> {
    console.log('\n💰 Generating Bid/ACoS Change actions...');

    const actions: Action[] = [];

    // Get target ACoS settings
    const settingsResult = await this.pool.query(`
      SELECT value FROM settings WHERE key = 'target_acos'
    `);

    if (settingsResult.rows.length === 0) {
      console.log('  ⚠️  No target ACoS settings found, skipping');
      return actions;
    }

    const targetAcosSettings = settingsResult.rows[0].value;
    const defaultTargetAcos = targetAcosSettings.default || 25;
    const categoryTargets = targetAcosSettings.by_category || {};

    // Get campaign performance with current ACoS
    const campaignQuery = `
      SELECT
        c.campaign_name,
        c.ad_group_name,
        p.category,
        SUM(kcp.spend)::numeric(10,2) as total_spend,
        SUM(kcp.total_sales)::numeric(10,2) as total_sales,
        CASE
          WHEN SUM(kcp.total_sales) > 0
          THEN (SUM(kcp.spend) / SUM(kcp.total_sales) * 100)::numeric(10,2)
          ELSE 0
        END as current_acos
      FROM campaigns c
      JOIN keyword_campaign_performance kcp ON c.id = kcp.campaign_id
      JOIN keywords k ON kcp.keyword_id = k.id
      LEFT JOIN keyword_ownership ko ON k.id = ko.keyword_id
      LEFT JOIN products p ON ko.hero_product_id = p.id
      WHERE kcp.snapshot_id = $1
        AND c.campaign_name ILIKE '%perpetua%'  -- Focus on Perpetua campaigns
      GROUP BY c.campaign_name, c.ad_group_name, p.category
      HAVING SUM(kcp.spend) > 20  -- Only campaigns with meaningful spend
        AND SUM(kcp.total_sales) > 0  -- Must have sales to calculate ACoS
      ORDER BY (SUM(kcp.spend) / SUM(kcp.total_sales)) DESC
    `;

    const campaignResult = await this.pool.query(campaignQuery, [snapshotId]);

    console.log(`  Found ${campaignResult.rows.length} Perpetua campaigns with performance data`);

    for (const row of campaignResult.rows) {
      const currentAcos = parseFloat(row.current_acos);
      const category = row.category;

      // Determine target ACoS for this campaign's category
      const targetAcos = (category && categoryTargets[category])
        ? categoryTargets[category]
        : defaultTargetAcos;

      // If current ACoS is significantly above target, suggest adjustment
      const acosExcess = currentAcos - targetAcos;

      if (acosExcess > 5) {  // At least 5% over target
        // Calculate estimated monthly savings
        // If we reduce ACoS from current to target, we save the excess spend
        const monthlySpend = parseFloat(row.total_spend);
        const estimatedMonthlySavings = monthlySpend * (acosExcess / 100);

        // Determine priority based on excess and spend
        let priority: 'P1' | 'P2' | 'P3' = 'P3';
        if (acosExcess > 30 && monthlySpend > 100) {
          priority = 'P1';
        } else if (acosExcess > 15 && monthlySpend > 50) {
          priority = 'P2';
        }

        actions.push({
          action_type: 'bid_change',
          application_channel: 'perpetua',
          priority,
          target_campaign: row.campaign_name,
          target_ad_group: row.ad_group_name,
          current_value: `${currentAcos.toFixed(1)}%`,
          recommended_value: `${targetAcos}%`,
          estimated_monthly_savings: estimatedMonthlySavings,
          reason: category
            ? `Campaign ACoS (${currentAcos.toFixed(1)}%) is ${acosExcess.toFixed(1)}% above target for ${category} category (${targetAcos}%). Reducing Perpetua ACoS target will lower spend and improve profitability.`
            : `Campaign ACoS (${currentAcos.toFixed(1)}%) is ${acosExcess.toFixed(1)}% above default target (${targetAcos}%). Reducing Perpetua ACoS target will lower spend and improve profitability.`,
        });
      }
    }

    console.log(`  Generated ${actions.length} bid/ACoS change actions`);
    console.log(`     P1: ${actions.filter((a) => a.priority === 'P1').length}`);
    console.log(`     P2: ${actions.filter((a) => a.priority === 'P2').length}`);
    console.log(`     P3: ${actions.filter((a) => a.priority === 'P3').length}`);

    return actions;
  }

  /**
   * Generate Action Type 4: ASIN Remove (→ Perpetua Dashboard)
   * Criteria:
   * - ASIN's sales = 0 AND spend > $10
   * - ASIN's Other SKU > 90% AND spend > $50
   */
  async generateAsinRemoveActions(
    snapshotId: number,
    criteria: ActionCriteria = DEFAULT_ACTION_CRITERIA
  ): Promise<Action[]> {
    console.log('\n🗑️  Generating ASIN Remove actions...');

    const query = `
      SELECT
        p.asin,
        p.sku,
        p.product_group,
        c.campaign_name,
        SUM(acp.spend) as total_spend,
        SUM(acp.total_sales) as total_sales,
        SUM(acp.adv_sales) as adv_sales,
        SUM(acp.other_sales) as other_sales,
        CASE
          WHEN SUM(acp.total_sales) > 0
          THEN (SUM(acp.other_sales) / SUM(acp.total_sales) * 100)
          ELSE 0
        END as other_sku_ratio
      FROM products p
      JOIN asin_campaign_performance acp ON p.id = acp.product_id
      JOIN campaigns c ON acp.campaign_id = c.id
      WHERE acp.snapshot_id = $1
      GROUP BY p.asin, p.sku, p.product_group, c.campaign_name
      HAVING
        (SUM(acp.total_sales) = 0 AND SUM(acp.spend) > $2)
        OR
        (SUM(acp.total_sales) > 0 AND SUM(acp.other_sales) / SUM(acp.total_sales) * 100 > $3 AND SUM(acp.spend) > $4)
      ORDER BY total_spend DESC
    `;

    const result = await this.pool.query(query, [
      snapshotId,
      criteria.asin_zero_sales_spend,
      criteria.asin_other_sku_ratio,
      criteria.asin_other_sku_spend,
    ]);

    const actions: Action[] = result.rows.map((row) => {
      const spend = parseFloat(row.total_spend);
      const sales = parseFloat(row.total_sales);
      const otherRatio = parseFloat(row.other_sku_ratio);
      const estimatedMonthlySavings = (spend / 60) * 30;

      let reason = '';
      if (sales === 0) {
        reason = `Zero sales for this ASIN, $${spend.toFixed(2)} wasted`;
      } else {
        reason = `${otherRatio.toFixed(1)}% Other SKU (wrong ASIN advertised)`;
      }

      return {
        action_type: 'asin_remove',
        application_channel: 'perpetua',
        priority: this.determinePriority(spend, sales > 0 ? (spend / sales) * 100 : 0),
        target_campaign: row.campaign_name,
        target_asin: row.asin,
        current_value: `In campaign`,
        recommended_value: 'Remove from goal',
        estimated_monthly_savings: estimatedMonthlySavings,
        reason: `Perpetua → Goals → ${row.product_group} → Products → ${row.asin} remove. ${reason}`,
      };
    });

    console.log(`  ✅ Generated ${actions.length} ASIN remove actions`);

    return actions;
  }

  /**
   * Generate Action Type 5: Negative ASIN Targeting (→ Amazon Bulk Sheet)
   * For Product Targeting campaigns
   */
  async generateNegativeAsinActions(
    snapshotId: number,
    criteria: ActionCriteria = DEFAULT_ACTION_CRITERIA
  ): Promise<Action[]> {
    console.log('\n🎯 Generating Negative ASIN Targeting actions...');

    // Find ASIN targets (keywords that are ASINs) with zero sales
    const query = `
      SELECT
        k.keyword_text as target_asin,
        c.campaign_name,
        c.ad_group_name,
        kcp.spend,
        kcp.total_sales
      FROM keyword_campaign_performance kcp
      JOIN keywords k ON kcp.keyword_id = k.id
      JOIN campaigns c ON kcp.campaign_id = c.id
      WHERE kcp.snapshot_id = $1
        AND k.keyword_type = 'asin_target'
        AND kcp.total_sales = 0
        AND kcp.spend >= $2
      ORDER BY kcp.spend DESC
    `;

    const result = await this.pool.query(query, [
      snapshotId,
      criteria.negative_zero_sales_spend,
    ]);

    const actions: Action[] = result.rows.map((row) => {
      const spend = parseFloat(row.spend);
      const estimatedMonthlySavings = (spend / 60) * 30;

      return {
        action_type: 'negative_asin_add',
        application_channel: 'bulk_sheet',
        priority: this.determinePriority(spend, 0),
        target_campaign: row.campaign_name,
        target_ad_group: row.ad_group_name,
        target_asin: row.target_asin,
        current_value: 'Active targeting',
        recommended_value: 'Negative ASIN',
        estimated_monthly_savings: estimatedMonthlySavings,
        reason: `ASIN targeting with zero sales, $${spend.toFixed(2)} waste`,
      };
    });

    console.log(`  ✅ Generated ${actions.length} negative ASIN actions`);

    return actions;
  }

  /**
   * Deduplicate actions by unique combination
   */
  deduplicateActions(actions: Action[]): Action[] {
    const seen = new Map<string, Action>();

    for (const action of actions) {
      // Create unique key from action type and targets
      const key = JSON.stringify([
        action.action_type,
        action.target_keyword || '',
        action.target_campaign || '',
        action.target_ad_group || '',
        action.target_asin || '',
      ]);

      // Keep only the first occurrence (or highest savings if you prefer)
      if (!seen.has(key)) {
        seen.set(key, action);
      } else {
        // Optionally: keep the one with higher savings
        const existing = seen.get(key)!;
        if ((action.estimated_monthly_savings || 0) > (existing.estimated_monthly_savings || 0)) {
          seen.set(key, action);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Save actions to database and return deduplicated actions
   */
  async saveActions(snapshotId: number, actions: Action[]): Promise<Action[]> {
    console.log('\n💾 Saving actions to database...');

    // Deduplicate actions before saving
    const uniqueActions = this.deduplicateActions(actions);
    const duplicatesRemoved = actions.length - uniqueActions.length;

    if (duplicatesRemoved > 0) {
      console.log(`  ⚠️  Removed ${duplicatesRemoved} duplicate actions`);
    }

    for (const action of uniqueActions) {
      await this.pool.query(
        `
        INSERT INTO actions (
          snapshot_id, action_type, application_channel, priority,
          target_campaign, target_ad_group, target_keyword, target_asin,
          current_value, recommended_value, estimated_monthly_savings, reason, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
        `,
        [
          snapshotId,
          action.action_type,
          action.application_channel,
          action.priority,
          action.target_campaign,
          action.target_ad_group,
          action.target_keyword,
          action.target_asin,
          action.current_value,
          action.recommended_value,
          action.estimated_monthly_savings,
          action.reason,
        ]
      );
    }

    console.log(`  ✅ Saved ${uniqueActions.length} actions`);

    return uniqueActions;
  }

  /**
   * Main method: Generate all actions for a snapshot
   */
  async generateAllActions(
    snapshotId: number,
    assignments: OwnershipAssignment[],
    criteria: ActionCriteria = DEFAULT_ACTION_CRITERIA
  ): Promise<Action[]> {
    console.log('\n🚀 Starting Action Generation Engine...\n');

    const allActions: Action[] = [];

    // Generate all 5 types of actions
    const negativeKeywords = await this.generateNegativeKeywordActions(
      snapshotId,
      assignments,
      criteria
    );
    allActions.push(...negativeKeywords);

    const campaignPauses = await this.generateCampaignPauseActions(snapshotId, criteria);
    allActions.push(...campaignPauses);

    const bidChanges = await this.generateBidChangeActions(snapshotId, assignments);
    allActions.push(...bidChanges);

    const asinRemoves = await this.generateAsinRemoveActions(snapshotId, criteria);
    allActions.push(...asinRemoves);

    const negativeAsins = await this.generateNegativeAsinActions(snapshotId, criteria);
    allActions.push(...negativeAsins);

    // Save to database (returns deduplicated actions)
    const savedActions = await this.saveActions(snapshotId, allActions);

    // Summary (use deduplicated actions for accurate counts)
    console.log('\n✨ Action Generation complete!\n');
    console.log(`Total actions: ${savedActions.length}`);
    console.log(`  - Bulk Sheet (Amazon Console): ${savedActions.filter((a) => a.application_channel === 'bulk_sheet').length}`);
    console.log(`  - Perpetua Dashboard: ${savedActions.filter((a) => a.application_channel === 'perpetua').length}`);
    console.log(`\nBy priority:`);
    console.log(`  - P1 (Urgent): ${savedActions.filter((a) => a.priority === 'P1').length}`);
    console.log(`  - P2 (High): ${savedActions.filter((a) => a.priority === 'P2').length}`);
    console.log(`  - P3 (Medium): ${savedActions.filter((a) => a.priority === 'P3').length}`);

    const totalSavings = savedActions.reduce((sum, a) => sum + (a.estimated_monthly_savings || 0), 0);
    console.log(`\nEstimated monthly savings: $${totalSavings.toFixed(2)}\n`);

    return savedActions;
  }
}
