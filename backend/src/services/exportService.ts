import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Export Service for Bulk Sheets and Perpetua Checklists
 * Based on CLAUDE.md specification
 */

export class ExportService {
  constructor(private pool: Pool) {}

  /**
   * Export Amazon Bulk Sheet for Negative Keywords and Negative ASIN Targeting
   * Format: Amazon Ads Console compatible xlsx (updated to match real Amazon format)
   * Includes separate Reference sheet for Priority/Savings/Reason
   */
  async exportBulkSheet(snapshotId: number, outputPath?: string): Promise<string> {
    console.log('\n📋 Generating Amazon Bulk Sheet...');

    // Get bulk sheet actions (negative_add and negative_asin_add)
    const query = `
      SELECT
        a.id as action_id,
        a.action_type,
        a.target_campaign,
        a.target_ad_group,
        a.target_keyword,
        a.target_asin,
        a.priority,
        a.estimated_monthly_savings,
        a.reason,
        a.status
      FROM actions a
      WHERE a.snapshot_id = $1
        AND a.application_channel = 'bulk_sheet'
        AND a.status = 'pending'
      ORDER BY a.priority, a.estimated_monthly_savings DESC
    `;

    const result = await this.pool.query(query, [snapshotId]);

    if (result.rows.length === 0) {
      console.log('  ⚠️  No bulk sheet actions found');
      return '';
    }

    // Prepare Amazon-compatible bulk sheet data
    const bulkSheetData: any[] = [];
    const referenceData: any[] = [];
    let rowIndex = 1;

    for (const row of result.rows) {
      if (row.action_type === 'negative_add') {
        // Negative Keyword - Amazon Bulk Sheet Format
        bulkSheetData.push({
          'Product': 'Sponsored Products',
          'Entity': 'Keyword',
          'Operation': 'create',
          'Campaign Name': row.target_campaign,
          'Ad Group Name': row.target_ad_group || '',
          'Keyword Text': row.target_keyword,
          'Match Type': 'negativeExact',
          'State': 'enabled',
        });

        // Reference data
        referenceData.push({
          'Row #': rowIndex,
          'Campaign': row.target_campaign,
          'Keyword/ASIN': row.target_keyword,
          'Priority': row.priority,
          'Est. Monthly Savings': `$${(parseFloat(row.estimated_monthly_savings) || 0).toFixed(2)}`,
          'Reason': row.reason,
        });
      } else if (row.action_type === 'negative_asin_add') {
        // Negative ASIN Targeting - Amazon Bulk Sheet Format
        bulkSheetData.push({
          'Product': 'Sponsored Products',
          'Entity': 'Product Targeting',
          'Operation': 'create',
          'Campaign Name': row.target_campaign,
          'Ad Group Name': row.target_ad_group || '',
          'Targeting Expression': `asin="${row.target_asin}"`,
          'Match Type': 'negativeTargeting',
          'State': 'enabled',
        });

        // Reference data
        referenceData.push({
          'Row #': rowIndex,
          'Campaign': row.target_campaign,
          'Keyword/ASIN': row.target_asin,
          'Priority': row.priority,
          'Est. Monthly Savings': `$${(parseFloat(row.estimated_monthly_savings) || 0).toFixed(2)}`,
          'Reason': row.reason,
        });
      }
      rowIndex++;
    }

    // Create workbook with two sheets
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Amazon-compatible bulk sheet
    const bulkSheet = XLSX.utils.json_to_sheet(bulkSheetData);
    XLSX.utils.book_append_sheet(workbook, bulkSheet, 'Bulk Upload');

    // Sheet 2: Reference data for internal use
    const refSheet = XLSX.utils.json_to_sheet(referenceData);
    XLSX.utils.book_append_sheet(workbook, refSheet, 'Reference');

    // Determine output path
    if (!outputPath) {
      const exportDir = path.join(__dirname, '../../exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      outputPath = path.join(
        exportDir,
        `bulk_sheet_snapshot_${snapshotId}_${Date.now()}.xlsx`
      );
    }

    // Write file
    XLSX.writeFile(workbook, outputPath);

    console.log(`  ✅ Bulk sheet exported: ${outputPath}`);
    console.log(`     Total rows: ${bulkSheetData.length}`);
    console.log(`     P1: ${referenceData.filter((r) => r.Priority === 'P1').length}`);
    console.log(`     P2: ${referenceData.filter((r) => r.Priority === 'P2').length}`);
    console.log(`     P3: ${referenceData.filter((r) => r.Priority === 'P3').length}`);

    return outputPath;
  }

  /**
   * Export Perpetua Checklist for manual actions in Perpetua Dashboard
   * Format: Human-readable xlsx with step-by-step instructions
   */
  async exportPerpetuaChecklist(snapshotId: number, outputPath?: string): Promise<string> {
    console.log('\n📋 Generating Perpetua Checklist...');

    // Get Perpetua actions (campaign_pause, bid_change, asin_remove)
    const query = `
      SELECT
        action_type,
        target_campaign,
        target_asin,
        current_value,
        recommended_value,
        priority,
        estimated_monthly_savings,
        reason,
        status
      FROM actions
      WHERE snapshot_id = $1
        AND application_channel = 'perpetua'
        AND status = 'pending'
      ORDER BY priority, estimated_monthly_savings DESC
    `;

    const result = await this.pool.query(query, [snapshotId]);

    if (result.rows.length === 0) {
      console.log('  ⚠️  No Perpetua actions found');
      return '';
    }

    // Prepare checklist data
    const checklistData: any[] = result.rows.map((row, index) => {
      let actionDescription = '';
      let perpetuaPath = '';

      if (row.action_type === 'campaign_pause') {
        actionDescription = 'Pause Goal';
        perpetuaPath = `Perpetua → Goals → Find goal → Pause`;
      } else if (row.action_type === 'bid_change') {
        actionDescription = 'Change ACoS Target';
        perpetuaPath = `Perpetua → Goals → Find goal → Target ACoS: ${row.recommended_value}`;
      } else if (row.action_type === 'asin_remove') {
        actionDescription = 'Remove ASIN from Goal';
        perpetuaPath = `Perpetua → Goals → Find goal → Products → Remove ${row.target_asin}`;
      }

      return {
        '#': index + 1,
        'Priority': row.priority,
        'Action': actionDescription,
        'Target Campaign': row.target_campaign,
        'Target ASIN': row.target_asin || '-',
        'Current Value': row.current_value,
        'Recommended Value': row.recommended_value,
        'Est. Monthly Savings': `$${(parseFloat(row.estimated_monthly_savings) || 0).toFixed(2)}`,
        'Perpetua Path': perpetuaPath,
        'Reason': row.reason,
        'Status': '[ ] Not Done',
      };
    });

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(checklistData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Perpetua Checklist');

    // Determine output path
    if (!outputPath) {
      const exportDir = path.join(__dirname, '../../exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      outputPath = path.join(
        exportDir,
        `perpetua_checklist_snapshot_${snapshotId}_${Date.now()}.xlsx`
      );
    }

    // Write file
    XLSX.writeFile(workbook, outputPath);

    console.log(`  ✅ Perpetua checklist exported: ${outputPath}`);
    console.log(`     Total actions: ${checklistData.length}`);
    console.log(`     P1: ${checklistData.filter((r) => r.Priority === 'P1').length}`);
    console.log(`     P2: ${checklistData.filter((r) => r.Priority === 'P2').length}`);
    console.log(`     P3: ${checklistData.filter((r) => r.Priority === 'P3').length}`);

    const totalSavings = result.rows.reduce(
      (sum, r) => sum + (parseFloat(r.estimated_monthly_savings) || 0),
      0
    );
    console.log(`     Total Est. Savings: $${totalSavings.toFixed(2)}/month`);

    return outputPath;
  }

  /**
   * Export Ownership Matrix for reference
   */
  async exportOwnershipMatrix(snapshotId: number, outputPath?: string): Promise<string> {
    console.log('\n📋 Generating Ownership Matrix...');

    const query = `
      SELECT
        k.keyword_text,
        p.asin as hero_asin,
        p.product_group as hero_product_group,
        p.category as hero_category,
        ko.ownership_score as hero_score,
        ko.status as ownership_status,
        -- Count support products
        (
          SELECT COUNT(*)
          FROM keyword_product_roles kpr
          WHERE kpr.keyword_id = k.id
            AND kpr.role = 'support'
            AND kpr.snapshot_id = $1
        ) as support_count,
        -- Count competitors
        (
          SELECT COUNT(*)
          FROM keyword_product_roles kpr
          WHERE kpr.keyword_id = k.id
            AND kpr.snapshot_id = $1
        ) as total_competitors,
        -- Check if contested
        CASE
          WHEN ko.hero_product_id IS NULL
          THEN 'Yes'
          ELSE 'No'
        END as contested
      FROM keywords k
      LEFT JOIN keyword_ownership ko ON k.id = ko.keyword_id
      LEFT JOIN products p ON ko.hero_product_id = p.id
      WHERE EXISTS (
        SELECT 1 FROM keyword_campaign_performance kcp
        WHERE kcp.keyword_id = k.id AND kcp.snapshot_id = $1
      )
      ORDER BY hero_score DESC NULLS LAST, k.keyword_text
    `;

    const result = await this.pool.query(query, [snapshotId]);

    const matrixData = result.rows.map((row) => ({
      'Keyword': row.keyword_text,
      'Hero ASIN': row.hero_asin || '-',
      'Hero Product Group': row.hero_product_group || '-',
      'Category': row.hero_category || '-',
      'Hero Score': row.hero_score ? row.hero_score.toFixed(2) : '0',
      'Support Count': row.support_count,
      'Total Competitors': row.total_competitors,
      'Contested': row.contested,
      'Status': row.ownership_status || 'unassigned',
    }));

    const worksheet = XLSX.utils.json_to_sheet(matrixData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ownership Matrix');

    if (!outputPath) {
      const exportDir = path.join(__dirname, '../../exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      outputPath = path.join(
        exportDir,
        `ownership_matrix_snapshot_${snapshotId}_${Date.now()}.xlsx`
      );
    }

    XLSX.writeFile(workbook, outputPath);

    console.log(`  ✅ Ownership matrix exported: ${outputPath}`);
    console.log(`     Total keywords: ${matrixData.length}`);
    console.log(`     With Hero: ${matrixData.filter((r) => r['Hero ASIN'] !== '-').length}`);
    console.log(`     Contested: ${matrixData.filter((r) => r.Contested === 'Yes').length}`);

    return outputPath;
  }

  /**
   * Export ASIN Performance data
   * Format: Excel with performance metrics
   */
  async exportAsinPerformance(snapshotId: number, outputPath?: string): Promise<string> {
    console.log('\n📋 Generating ASIN Performance Report...');

    const query = `
      SELECT
        p.asin,
        p.sku,
        p.product_group,
        p.category,
        p.title,
        SUM(acp.impressions)::int as impressions,
        SUM(acp.clicks)::int as clicks,
        SUM(acp.spend)::numeric(10,2) as spend,
        SUM(acp.total_sales)::numeric(10,2) as total_sales,
        SUM(acp.orders)::int as orders,
        CASE
          WHEN SUM(acp.impressions) > 0
          THEN (SUM(acp.clicks)::numeric / SUM(acp.impressions) * 100)::numeric(10,2)
          ELSE 0
        END as ctr,
        CASE
          WHEN SUM(acp.clicks) > 0
          THEN (SUM(acp.spend) / SUM(acp.clicks))::numeric(10,2)
          ELSE 0
        END as cpc,
        CASE
          WHEN SUM(acp.total_sales) > 0
          THEN (SUM(acp.spend) / SUM(acp.total_sales) * 100)::numeric(10,2)
          ELSE 0
        END as acos,
        CASE
          WHEN SUM(acp.impressions) > 0
          THEN (SUM(acp.orders)::numeric / SUM(acp.impressions) * 100)::numeric(10,4)
          ELSE 0
        END as conversion_rate
      FROM products p
      JOIN asin_campaign_performance acp ON p.id = acp.product_id
      WHERE acp.snapshot_id = $1
      GROUP BY p.id, p.asin, p.sku, p.product_group, p.category, p.title
      ORDER BY spend DESC
    `;

    const result = await this.pool.query(query, [snapshotId]);

    if (result.rows.length === 0) {
      console.log('  ⚠️  No ASIN performance data found');
      return '';
    }

    const asinData = result.rows.map((row) => ({
      'ASIN': row.asin,
      'SKU': row.sku || '-',
      'Product Group': row.product_group,
      'Category': row.category || '-',
      'Title': row.title || '-',
      'Impressions': row.impressions,
      'Clicks': row.clicks,
      'CTR (%)': parseFloat(row.ctr).toFixed(2),
      'CPC ($)': parseFloat(row.cpc).toFixed(2),
      'Spend ($)': parseFloat(row.spend).toFixed(2),
      'Sales ($)': parseFloat(row.total_sales).toFixed(2),
      'ACoS (%)': parseFloat(row.acos).toFixed(2),
      'Orders': row.orders,
      'Conversion Rate (%)': parseFloat(row.conversion_rate).toFixed(2),
    }));

    const worksheet = XLSX.utils.json_to_sheet(asinData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ASIN Performance');

    if (!outputPath) {
      const exportDir = path.join(__dirname, '../../exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      outputPath = path.join(
        exportDir,
        `asin_performance_snapshot_${snapshotId}_${Date.now()}.xlsx`
      );
    }

    XLSX.writeFile(workbook, outputPath);

    console.log(`  ✅ ASIN performance exported: ${outputPath}`);
    console.log(`     Total ASINs: ${asinData.length}`);

    return outputPath;
  }

  /**
   * Export Keyword Performance data
   * Format: Excel with performance metrics
   */
  async exportKeywordPerformance(snapshotId: number, outputPath?: string): Promise<string> {
    console.log('\n📋 Generating Keyword Performance Report...');

    const query = `
      SELECT
        k.keyword_text,
        k.keyword_type,
        SUM(kcp.impressions)::int as impressions,
        SUM(kcp.clicks)::int as clicks,
        SUM(kcp.spend)::numeric(10,2) as spend,
        SUM(kcp.total_sales)::numeric(10,2) as total_sales,
        SUM(kcp.orders)::int as orders,
        CASE
          WHEN SUM(kcp.impressions) > 0
          THEN (SUM(kcp.clicks)::numeric / SUM(kcp.impressions) * 100)::numeric(10,2)
          ELSE 0
        END as ctr,
        CASE
          WHEN SUM(kcp.clicks) > 0
          THEN (SUM(kcp.spend) / SUM(kcp.clicks))::numeric(10,2)
          ELSE 0
        END as cpc,
        CASE
          WHEN SUM(kcp.total_sales) > 0
          THEN (SUM(kcp.spend) / SUM(kcp.total_sales) * 100)::numeric(10,2)
          ELSE 0
        END as acos,
        CASE
          WHEN SUM(kcp.impressions) > 0
          THEN (SUM(kcp.orders)::numeric / SUM(kcp.impressions) * 100)::numeric(10,4)
          ELSE 0
        END as conversion_rate,
        COUNT(DISTINCT kcp.campaign_id)::int as campaign_count
      FROM keywords k
      JOIN keyword_campaign_performance kcp ON k.id = kcp.keyword_id
      WHERE kcp.snapshot_id = $1
      GROUP BY k.id, k.keyword_text, k.keyword_type
      ORDER BY spend DESC
    `;

    const result = await this.pool.query(query, [snapshotId]);

    if (result.rows.length === 0) {
      console.log('  ⚠️  No keyword performance data found');
      return '';
    }

    const keywordData = result.rows.map((row) => ({
      'Keyword': row.keyword_text,
      'Type': row.keyword_type || '-',
      'Campaigns': row.campaign_count,
      'Impressions': row.impressions,
      'Clicks': row.clicks,
      'CTR (%)': parseFloat(row.ctr).toFixed(2),
      'CPC ($)': parseFloat(row.cpc).toFixed(2),
      'Spend ($)': parseFloat(row.spend).toFixed(2),
      'Sales ($)': parseFloat(row.total_sales).toFixed(2),
      'ACoS (%)': parseFloat(row.acos).toFixed(2),
      'Orders': row.orders,
      'Conversion Rate (%)': parseFloat(row.conversion_rate).toFixed(2),
    }));

    const worksheet = XLSX.utils.json_to_sheet(keywordData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Keyword Performance');

    if (!outputPath) {
      const exportDir = path.join(__dirname, '../../exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      outputPath = path.join(
        exportDir,
        `keyword_performance_snapshot_${snapshotId}_${Date.now()}.xlsx`
      );
    }

    XLSX.writeFile(workbook, outputPath);

    console.log(`  ✅ Keyword performance exported: ${outputPath}`);
    console.log(`     Total keywords: ${keywordData.length}`);

    return outputPath;
  }
}
