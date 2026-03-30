import { Pool } from 'pg';
import {
  ParsedReports,
  Snapshot,
  Product,
  Campaign,
  Keyword,
} from '../types';
import {
  extractProductGroup,
  determineCategory,
  extractCampaignType,
  isAsinTarget,
  isAggregatedTerm,
  parseDate,
} from '../utils/productGroup';

export class DataInsertionService {
  constructor(private pool: Pool) {}

  /**
   * Create a new snapshot record
   */
  async createSnapshot(periodStart: Date, periodEnd: Date, reports: ParsedReports): Promise<number> {
    console.log('📊 Creating snapshot...');

    // Calculate totals
    const totalSpend = reports.searchTermReport.reduce((sum, row) => sum + row.Spend, 0);
    const totalSales = reports.searchTermReport.reduce((sum, row) => sum + row['7 Day Total Sales'], 0);

    const result = await this.pool.query(
      `
      INSERT INTO snapshots (
        period_start, period_end, marketplace,
        search_term_rows, targeting_rows, advertised_product_rows,
        total_spend, total_sales
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        periodStart,
        periodEnd,
        'US',
        reports.searchTermReport.length,
        reports.targetingReport.length,
        reports.advertisedProductReport.length,
        totalSpend,
        totalSales,
      ]
    );

    const snapshotId = result.rows[0].id;
    console.log(`  ✅ Snapshot created: ID ${snapshotId}`);
    console.log(`     Period: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`);
    console.log(`     Total Spend: $${totalSpend.toFixed(2)}`);
    console.log(`     Total Sales: $${totalSales.toFixed(2)}`);
    console.log(`     ACoS: ${totalSales > 0 ? ((totalSpend / totalSales) * 100).toFixed(2) : 0}%`);

    return snapshotId;
  }

  /**
   * Upsert product (ASIN + SKU)
   */
  async upsertProduct(asin: string, sku: string, productGroup: string): Promise<number> {
    const category = determineCategory(productGroup);

    const result = await this.pool.query(
      `
      INSERT INTO products (asin, sku, product_group, category, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (asin, sku)
      DO UPDATE SET
        product_group = EXCLUDED.product_group,
        category = EXCLUDED.category,
        updated_at = NOW()
      RETURNING id
      `,
      [asin, sku || null, productGroup, category]
    );

    return result.rows[0].id;
  }

  /**
   * Upsert campaign
   */
  async upsertCampaign(campaignName: string, adGroupName: string, portfolioName?: string): Promise<number> {
    const productGroup = extractProductGroup(campaignName);
    const campaignType = extractCampaignType(campaignName);

    const result = await this.pool.query(
      `
      INSERT INTO campaigns (campaign_name, ad_group_name, product_group, campaign_type, portfolio_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (campaign_name)
      DO UPDATE SET
        ad_group_name = EXCLUDED.ad_group_name,
        product_group = EXCLUDED.product_group,
        campaign_type = EXCLUDED.campaign_type,
        portfolio_name = EXCLUDED.portfolio_name
      RETURNING id
      `,
      [campaignName, adGroupName, productGroup, campaignType, portfolioName || null]
    );

    return result.rows[0].id;
  }

  /**
   * Upsert keyword
   */
  async upsertKeyword(keywordText: string, firstSeenDate?: Date): Promise<number> {
    const keywordType = isAsinTarget(keywordText) ? 'asin_target' : 'search_term';

    const result = await this.pool.query(
      `
      INSERT INTO keywords (keyword_text, keyword_type, first_seen_date)
      VALUES ($1, $2, $3)
      ON CONFLICT (keyword_text)
      DO UPDATE SET keyword_text = EXCLUDED.keyword_text
      RETURNING id
      `,
      [keywordText, keywordType, firstSeenDate || new Date()]
    );

    return result.rows[0].id;
  }

  /**
   * Insert Search Term Report data
   */
  async insertSearchTermData(snapshotId: number, reports: ParsedReports): Promise<void> {
    console.log('\n📥 Inserting Search Term Report data...');

    let inserted = 0;
    let skipped = 0;

    for (const row of reports.searchTermReport) {
      // Skip aggregated rows (Customer Search Term = '*')
      if (isAggregatedTerm(row['Customer Search Term'])) {
        skipped++;
        continue;
      }

      try {
        // Upsert campaign
        const campaignId = await this.upsertCampaign(
          row['Campaign Name'],
          row['Ad Group Name'],
          row['Portfolio name']
        );

        // Upsert keyword
        const keywordId = await this.upsertKeyword(
          row['Customer Search Term'],
          parseDate(row['Start Date'])
        );

        // Calculate derived metrics
        const cvr = row.Clicks > 0 ? row['7 Day Total Orders (#)'] / row.Clicks : 0;

        // Insert performance data
        await this.pool.query(
          `
          INSERT INTO keyword_campaign_performance (
            snapshot_id, keyword_id, campaign_id, match_type,
            impressions, clicks, spend, total_sales, adv_sales, other_sales,
            orders, adv_units, other_units, ctr, cpc, acos, cvr
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          `,
          [
            snapshotId,
            keywordId,
            campaignId,
            row['Match Type'],
            row.Impressions,
            row.Clicks,
            row.Spend,
            row['7 Day Total Sales'],
            row['7 Day Advertised SKU Sales'],
            row['7 Day Other SKU Sales'],
            row['7 Day Total Orders (#)'],
            row['7 Day Advertised SKU Units (#)'],
            row['7 Day Other SKU Units (#)'],
            row['Click-Thru Rate (CTR)'],
            row['Cost Per Click (CPC)'],
            row['Total Advertising Cost of Sales (ACOS)'],
            cvr,
          ]
        );

        inserted++;
      } catch (error) {
        console.error(`  ❌ Error inserting row:`, error);
      }
    }

    console.log(`  ✅ Inserted ${inserted} rows, skipped ${skipped} aggregated rows`);
  }

  /**
   * Insert Targeting Report data
   */
  async insertTargetingData(snapshotId: number, reports: ParsedReports): Promise<void> {
    console.log('\n📥 Inserting Targeting Report data...');

    let inserted = 0;

    for (const row of reports.targetingReport) {
      try {
        // Upsert campaign
        const campaignId = await this.upsertCampaign(
          row['Campaign Name'],
          row['Ad Group Name'],
          row['Portfolio name']
        );

        // Insert targeting performance
        await this.pool.query(
          `
          INSERT INTO campaign_targeting_performance (
            snapshot_id, campaign_id, targeting_text, match_type,
            top_of_search_share, impressions, clicks, spend,
            total_sales, adv_sales, other_sales, orders, adv_units, other_units
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            snapshotId,
            campaignId,
            row.Targeting,
            row['Match Type'],
            row['Top-of-search Impression Share'],
            row.Impressions,
            row.Clicks,
            row.Spend,
            row['7 Day Total Sales'],
            row['7 Day Advertised SKU Sales'],
            row['7 Day Other SKU Sales'],
            row['7 Day Total Orders (#)'],
            row['7 Day Advertised SKU Units (#)'],
            row['7 Day Other SKU Units (#)'],
          ]
        );

        inserted++;
      } catch (error) {
        console.error(`  ❌ Error inserting targeting row:`, error);
      }
    }

    console.log(`  ✅ Inserted ${inserted} targeting rows`);
  }

  /**
   * Insert Advertised Product Report data
   */
  async insertAdvertisedProductData(snapshotId: number, reports: ParsedReports): Promise<void> {
    console.log('\n📥 Inserting Advertised Product Report data...');

    let inserted = 0;

    for (const row of reports.advertisedProductReport) {
      try {
        // Extract product group from campaign name
        const productGroup = extractProductGroup(row['Campaign Name']);

        // Upsert product
        const productId = await this.upsertProduct(
          row['Advertised ASIN'],
          row['Advertised SKU'],
          productGroup
        );

        // Upsert campaign
        const campaignId = await this.upsertCampaign(
          row['Campaign Name'],
          row['Ad Group Name'],
          row['Portfolio name']
        );

        // Insert or update ASIN campaign performance (aggregate if duplicate rows exist)
        await this.pool.query(
          `
          INSERT INTO asin_campaign_performance (
            snapshot_id, product_id, campaign_id,
            impressions, clicks, spend, total_sales, adv_sales, other_sales,
            orders, adv_units, other_units
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (snapshot_id, product_id, campaign_id)
          DO UPDATE SET
            impressions = asin_campaign_performance.impressions + EXCLUDED.impressions,
            clicks = asin_campaign_performance.clicks + EXCLUDED.clicks,
            spend = asin_campaign_performance.spend + EXCLUDED.spend,
            total_sales = asin_campaign_performance.total_sales + EXCLUDED.total_sales,
            adv_sales = asin_campaign_performance.adv_sales + EXCLUDED.adv_sales,
            other_sales = asin_campaign_performance.other_sales + EXCLUDED.other_sales,
            orders = asin_campaign_performance.orders + EXCLUDED.orders,
            adv_units = asin_campaign_performance.adv_units + EXCLUDED.adv_units,
            other_units = asin_campaign_performance.other_units + EXCLUDED.other_units
          `,
          [
            snapshotId,
            productId,
            campaignId,
            row.Impressions,
            row.Clicks,
            row.Spend,
            row['7 Day Total Sales'],
            row['7 Day Advertised SKU Sales'],
            row['7 Day Other SKU Sales'],
            row['7 Day Total Orders (#)'],
            row['7 Day Advertised SKU Units (#)'],
            row['7 Day Other SKU Units (#)'],
          ]
        );

        inserted++;
      } catch (error) {
        console.error(`  ❌ Error inserting product row:`, error);
      }
    }

    console.log(`  ✅ Inserted ${inserted} product rows`);
  }

  /**
   * Insert Purchased Product Report data
   */
  async insertPurchasedProductData(snapshotId: number, reports: ParsedReports): Promise<void> {
    if (!reports.purchasedProductReport || reports.purchasedProductReport.length === 0) {
      console.log('\n⏭️  No Purchased Product Report data to insert, skipping...');
      return;
    }

    console.log('\n📥 Inserting Purchased Product Report data...');

    let inserted = 0;
    let skipped = 0;

    for (const row of reports.purchasedProductReport) {
      try {
        // Skip if Purchased ASIN is missing or same as Advertised ASIN (not "other" SKU)
        if (!row['Purchased ASIN'] || row['Purchased ASIN'] === row['Advertised ASIN']) {
          skipped++;
          continue;
        }

        // Extract product group from campaign name
        const productGroup = extractProductGroup(row['Campaign Name']);

        // Upsert advertised product
        const advertisedProductId = await this.upsertProduct(
          row['Advertised ASIN'],
          row['Advertised SKU'],
          productGroup
        );

        // Upsert purchased product (we may not have SKU, so use ASIN as fallback)
        const purchasedProductId = await this.upsertProduct(
          row['Purchased ASIN'],
          '', // We don't have purchased SKU in this report
          productGroup // Assume same product group for now
        );

        // Upsert campaign
        const campaignId = await this.upsertCampaign(
          row['Campaign Name'],
          row['Ad Group Name'],
          row['Portfolio name']
        );

        // Insert purchased product performance
        await this.pool.query(
          `
          INSERT INTO purchased_product_performance (
            snapshot_id, campaign_id, advertised_product_id, purchased_product_id,
            targeting, match_type, other_sku_units, other_sku_orders, other_sku_sales
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (snapshot_id, campaign_id, advertised_product_id, purchased_product_id, targeting)
          DO UPDATE SET
            other_sku_units = purchased_product_performance.other_sku_units + EXCLUDED.other_sku_units,
            other_sku_orders = purchased_product_performance.other_sku_orders + EXCLUDED.other_sku_orders,
            other_sku_sales = purchased_product_performance.other_sku_sales + EXCLUDED.other_sku_sales
          `,
          [
            snapshotId,
            campaignId,
            advertisedProductId,
            purchasedProductId,
            row.Targeting,
            row['Match Type'],
            row['7 Day Other SKU Units (#)'],
            row['7 Day Other SKU Orders (#)'],
            row['7 Day Other SKU Sales'],
          ]
        );

        inserted++;
      } catch (error) {
        console.error(`  ❌ Error inserting purchased product row:`, error);
      }
    }

    console.log(`  ✅ Inserted ${inserted} rows, skipped ${skipped} rows`);
  }

  /**
   * Main method: Process all reports and insert into database
   */
  async processReports(
    reports: ParsedReports,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    console.log('\n🚀 Starting data insertion process...\n');

    // Create snapshot
    const snapshotId = await this.createSnapshot(periodStart, periodEnd, reports);

    // Insert all data
    await this.insertSearchTermData(snapshotId, reports);
    await this.insertTargetingData(snapshotId, reports);
    await this.insertAdvertisedProductData(snapshotId, reports);
    await this.insertPurchasedProductData(snapshotId, reports);

    console.log('\n✨ Data insertion complete!\n');

    return snapshotId;
  }
}
