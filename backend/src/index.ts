import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as path from 'path';
import multer from 'multer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pool } from './db/connection';
import { ExportService } from './services/exportService';
import { startScheduler, getCronStatus, runDailySync } from './services/scheduler';
import { DashboardService, Period } from './services/dashboardService';
import { AdsExecutor } from './services/adsExecutor';
import { BidOptimizer } from './services/bidOptimizer';
import { OwnershipService, OwnershipPeriod } from './services/ownershipService';

const execAsync = promisify(exec);

dotenv.config();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Get latest snapshot
app.get('/api/snapshots/latest', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM v_latest_snapshot');
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching latest snapshot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all snapshots
app.get('/api/snapshots', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        period_start,
        period_end,
        marketplace,
        total_spend,
        total_sales,
        CASE WHEN total_sales > 0 THEN (total_spend / total_sales * 100) ELSE NULL END as acos,
        search_term_rows,
        targeting_rows,
        advertised_product_rows,
        upload_date
      FROM snapshots
      ORDER BY upload_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get database statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [products, campaigns, keywords, snapshots, latestSnapshot] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM products'),
      pool.query('SELECT COUNT(*) FROM campaigns'),
      pool.query('SELECT COUNT(*) FROM keywords'),
      pool.query('SELECT COUNT(*) FROM snapshots'),
      pool.query('SELECT * FROM v_latest_snapshot'),
    ]);

    // Calculate Other SKU ratio from latest snapshot
    let otherSkuRatio = null;
    if (latestSnapshot.rows.length > 0) {
      const snapshotId = latestSnapshot.rows[0].id;
      const otherSkuResult = await pool.query(`
        SELECT
          SUM(kcp.adv_sales)::numeric(10,2) as total_adv_sales,
          SUM(kcp.other_sales)::numeric(10,2) as total_other_sales,
          CASE
            WHEN SUM(kcp.adv_sales + kcp.other_sales) > 0
            THEN (SUM(kcp.other_sales) / SUM(kcp.adv_sales + kcp.other_sales) * 100)::numeric(10,2)
            ELSE 0
          END as other_sku_percentage
        FROM keyword_campaign_performance kcp
        WHERE kcp.snapshot_id = $1
      `, [snapshotId]);

      if (otherSkuResult.rows.length > 0) {
        otherSkuRatio = {
          advSales: parseFloat(otherSkuResult.rows[0].total_adv_sales || 0),
          otherSales: parseFloat(otherSkuResult.rows[0].total_other_sales || 0),
          percentage: parseFloat(otherSkuResult.rows[0].other_sku_percentage || 0),
        };
      }
    }

    res.json({
      products: parseInt(products.rows[0].count),
      campaigns: parseInt(campaigns.rows[0].count),
      keywords: parseInt(keywords.rows[0].count),
      snapshots: parseInt(snapshots.rows[0].count),
      otherSkuRatio,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get actions for a snapshot
app.get('/api/snapshots/:id/actions', async (req, res) => {
  try {
    const { id } = req.params;
    const { channel, priority, type } = req.query;

    let query = `
      SELECT
        id,
        action_type,
        application_channel,
        priority,
        target_campaign,
        target_ad_group,
        target_keyword,
        target_asin,
        current_value,
        recommended_value,
        estimated_monthly_savings,
        reason,
        status,
        created_at
      FROM actions
      WHERE snapshot_id = $1
    `;

    const params = [id];
    let paramIndex = 2;

    if (channel) {
      query += ` AND application_channel = $${paramIndex}`;
      params.push(channel as string);
      paramIndex++;
    }

    if (priority) {
      query += ` AND priority = $${paramIndex}`;
      params.push(priority as string);
      paramIndex++;
    }

    if (type) {
      query += ` AND action_type = $${paramIndex}`;
      params.push(type as string);
      paramIndex++;
    }

    query += ' ORDER BY priority, estimated_monthly_savings DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get action summary for a snapshot
app.get('/api/snapshots/:id/actions/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const { groupBy } = req.query;

    let query = '';

    if (groupBy === 'priority') {
      // Group by priority only for priority distribution
      query = `
        SELECT
          priority,
          'all' as action_type,
          'all' as application_channel,
          COUNT(*) as count,
          SUM(estimated_monthly_savings)::numeric(10,2) as total_savings
        FROM actions
        WHERE snapshot_id = $1
        GROUP BY priority
        ORDER BY priority
      `;
    } else {
      // Default: Group by action_type only for action type chart
      query = `
        SELECT
          action_type,
          'all' as application_channel,
          'all' as priority,
          COUNT(*) as count,
          SUM(estimated_monthly_savings)::numeric(10,2) as total_savings
        FROM actions
        WHERE snapshot_id = $1
        GROUP BY action_type
        ORDER BY action_type
      `;
    }

    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching action summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update action status
app.patch('/api/actions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['pending', 'applied', 'skipped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: pending, applied, skipped' });
    }

    const result = await pool.query(
      `UPDATE actions
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating action status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk update action status
app.patch('/api/actions/bulk-status', async (req, res) => {
  try {
    const { ids, status } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    const validStatuses = ['pending', 'applied', 'skipped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: pending, applied, skipped' });
    }

    const result = await pool.query(
      `UPDATE actions
       SET status = $1
       WHERE id = ANY($2::int[])
       RETURNING id`,
      [status, ids]
    );

    res.json({
      success: true,
      updatedCount: result.rows.length,
      ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error bulk updating action status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ownership matrix for a snapshot
app.get('/api/snapshots/:id/ownership', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await pool.query(`
      SELECT
        k.id,
        k.keyword_text,
        p.asin as hero_asin,
        p.product_group as hero_product_group,
        p.category,
        ko.ownership_score,
        (
          SELECT COUNT(*)
          FROM keyword_product_roles kpr
          WHERE kpr.keyword_id = k.id
            AND kpr.role = 'support'
            AND kpr.snapshot_id = $1
        ) as support_count,
        (
          SELECT COUNT(*)
          FROM keyword_product_roles kpr
          WHERE kpr.keyword_id = k.id
            AND kpr.snapshot_id = $1
        ) as total_competitors,
        CASE WHEN ko.hero_product_id IS NULL THEN true ELSE false END as is_contested
      FROM keywords k
      LEFT JOIN keyword_ownership ko ON k.id = ko.keyword_id
      LEFT JOIN products p ON ko.hero_product_id = p.id
      WHERE EXISTS (
        SELECT 1 FROM keyword_campaign_performance kcp
        WHERE kcp.keyword_id = k.id AND kcp.snapshot_id = $1
      )
      ORDER BY ko.ownership_score DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT k.id) as total
      FROM keywords k
      WHERE EXISTS (
        SELECT 1 FROM keyword_campaign_performance kcp
        WHERE kcp.keyword_id = k.id AND kcp.snapshot_id = $1
      )
    `, [id]);

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching ownership matrix:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category performance for a snapshot
app.get('/api/snapshots/:id/categories', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p.category,
        COUNT(DISTINCT p.id) as asin_count,
        COUNT(DISTINCT p.product_group) as product_groups,
        SUM(acp.spend)::numeric(10,2) as total_spend,
        SUM(acp.total_sales)::numeric(10,2) as total_sales,
        CASE
          WHEN SUM(acp.total_sales) > 0
          THEN (SUM(acp.spend) / SUM(acp.total_sales) * 100)::numeric(10,2)
          ELSE 0
        END as acos
      FROM products p
      JOIN asin_campaign_performance acp ON p.id = acp.product_id
      WHERE acp.snapshot_id = $1
        AND p.category IS NOT NULL
      GROUP BY p.category
      ORDER BY total_spend DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching category performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category summary for a snapshot
app.get('/api/snapshots/:id/category-summary', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        COALESCE(p.category, 'Uncategorized') as category,
        COUNT(DISTINCT p.id) as product_count,
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
      GROUP BY p.category
      ORDER BY spend DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching category summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Other SKU analysis for a snapshot (by campaign)
app.get('/api/snapshots/:id/other-sku-analysis', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        c.campaign_name,
        COALESCE(
          (SELECT DISTINCT product_group
           FROM products p2
           JOIN asin_campaign_performance acp2 ON p2.id = acp2.product_id
           WHERE acp2.campaign_id = c.id AND acp2.snapshot_id = $1
           LIMIT 1),
          'Unknown'
        ) as product_group,
        SUM(kcp.spend)::numeric(10,2) as spend,
        SUM(kcp.adv_sales)::numeric(10,2) as adv_sales,
        SUM(kcp.other_sales)::numeric(10,2) as other_sales,
        SUM(kcp.adv_sales + kcp.other_sales)::numeric(10,2) as total_sales,
        CASE
          WHEN SUM(kcp.adv_sales + kcp.other_sales) > 0
          THEN (SUM(kcp.other_sales) / SUM(kcp.adv_sales + kcp.other_sales) * 100)::numeric(10,2)
          ELSE 0
        END as other_sku_percentage
      FROM campaigns c
      JOIN keyword_campaign_performance kcp ON c.id = kcp.campaign_id
      WHERE kcp.snapshot_id = $1
      GROUP BY c.id, c.campaign_name
      HAVING SUM(kcp.adv_sales + kcp.other_sales) > 0
      ORDER BY other_sku_percentage DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching Other SKU analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Other SKU analysis by ASIN (which advertised ASINs cause other SKU sales)
app.get('/api/snapshots/:id/other-sku-analysis-by-asin', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p.asin,
        p.sku as product_id,
        p.product_group,
        p.category,
        c.campaign_name,
        acp.spend::numeric(10,2) as spend,
        acp.adv_sales::numeric(10,2) as adv_sales,
        acp.other_sales::numeric(10,2) as other_sales,
        (acp.adv_sales + acp.other_sales)::numeric(10,2) as total_sales,
        CASE
          WHEN (acp.adv_sales + acp.other_sales) > 0
          THEN (acp.other_sales / (acp.adv_sales + acp.other_sales) * 100)::numeric(10,2)
          ELSE 0
        END as other_sku_percentage
      FROM asin_campaign_performance acp
      JOIN products p ON acp.product_id = p.id
      JOIN campaigns c ON acp.campaign_id = c.id
      WHERE acp.snapshot_id = $1
        AND (acp.adv_sales + acp.other_sales) > 0
      ORDER BY other_sku_percentage DESC, other_sales DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ASIN-level Other SKU analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Purchased Product details (Advertised ASIN → Purchased ASIN mappings)
app.get('/api/snapshots/:id/purchased-product-analysis', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p_adv.asin as advertised_asin,
        p_adv.sku as advertised_sku,
        p_adv.product_group as advertised_product_group,
        p_adv.category as advertised_category,
        p_purch.asin as purchased_asin,
        p_purch.sku as purchased_sku,
        p_purch.product_group as purchased_product_group,
        p_purch.category as purchased_category,
        c.campaign_name,
        ppp.targeting,
        ppp.match_type,
        SUM(ppp.other_sku_units)::int as total_units,
        SUM(ppp.other_sku_orders)::int as total_orders,
        SUM(ppp.other_sku_sales)::numeric(10,2) as total_sales
      FROM purchased_product_performance ppp
      JOIN products p_adv ON ppp.advertised_product_id = p_adv.id
      JOIN products p_purch ON ppp.purchased_product_id = p_purch.id
      JOIN campaigns c ON ppp.campaign_id = c.id
      WHERE ppp.snapshot_id = $1
      GROUP BY
        p_adv.asin, p_adv.sku, p_adv.product_group, p_adv.category,
        p_purch.asin, p_purch.sku, p_purch.product_group, p_purch.category,
        c.campaign_name, ppp.targeting, ppp.match_type
      ORDER BY total_sales DESC, total_units DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching Purchased Product analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ASIN performance list for a snapshot
app.get('/api/snapshots/:id/asins', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
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
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ASIN performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get keyword performance list for a snapshot
app.get('/api/snapshots/:id/keywords', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
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
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching keyword performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export endpoints
const exportService = new ExportService(pool);

// Download bulk sheet
app.get('/api/snapshots/:id/export/bulk', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = await exportService.exportBulkSheet(parseInt(id));

    if (!filePath) {
      return res.status(404).json({ error: 'No bulk sheet actions found' });
    }

    res.download(filePath, `bulk_sheet_snapshot_${id}.xlsx`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Error exporting bulk sheet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download perpetua checklist
app.get('/api/snapshots/:id/export/perpetua', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = await exportService.exportPerpetuaChecklist(parseInt(id));

    if (!filePath) {
      return res.status(404).json({ error: 'No perpetua actions found' });
    }

    res.download(filePath, `perpetua_checklist_snapshot_${id}.xlsx`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Error exporting perpetua checklist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download ownership matrix
app.get('/api/snapshots/:id/export/matrix', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = await exportService.exportOwnershipMatrix(parseInt(id));

    if (!filePath) {
      return res.status(404).json({ error: 'No ownership data found' });
    }

    res.download(filePath, `ownership_matrix_snapshot_${id}.xlsx`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Error exporting ownership matrix:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download ASIN performance
app.get('/api/snapshots/:id/export/asins', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = await exportService.exportAsinPerformance(parseInt(id));

    if (!filePath) {
      return res.status(404).json({ error: 'No ASIN performance data found' });
    }

    res.download(filePath, `asin_performance_snapshot_${id}.xlsx`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Error exporting ASIN performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download keyword performance
app.get('/api/snapshots/:id/export/keywords', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = await exportService.exportKeywordPerformance(parseInt(id));

    if (!filePath) {
      return res.status(404).json({ error: 'No keyword performance data found' });
    }

    res.download(filePath, `keyword_performance_snapshot_${id}.xlsx`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Error exporting keyword performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import product catalog (ASIN-SKU-Name-Category mapping)
app.post('/api/products/import', upload.single('catalog'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Catalog file is required' });
    }

    console.log('\n📦 Importing product catalog...');

    // Read Excel file
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const row of data) {
      const asin = row['ASIN'] || row['asin'];
      const sku = row['SKU'] || row['sku'];
      const name = row['Name'] || row['name'] || row['NAME'];
      const category = row['Category'] || row['category'] || row['CATEGORY'];

      if (!asin) {
        skipped++;
        continue;
      }

      try {
        // Always match by ASIN only (ignore SKU from Excel)
        // SKUs in database come from ad reports and are correct
        const existing = await pool.query('SELECT id FROM products WHERE asin = $1', [asin]);

        if (existing.rows.length > 0) {
          // Update ALL variants of this ASIN with the category from Excel
          const updateResult = await pool.query(
            `UPDATE products
             SET category = COALESCE($1, category),
                 updated_at = NOW()
             WHERE asin = $2`,
            [category || null, asin]
          );
          updated += updateResult.rowCount || 0;
        } else {
          // ASIN not found in database (not in ad reports yet)
          skipped++;
        }
      } catch (err) {
        console.error(`Error processing row: ${asin}`, err);
        skipped++;
      }
    }

    console.log(`✅ Import complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);

    res.json({
      success: true,
      updated,
      created,
      skipped,
      total: data.length,
      message: 'Product catalog imported successfully!'
    });
  } catch (error: any) {
    console.error('Error importing product catalog:', error);
    res.status(500).json({ error: error.message || 'Failed to import catalog' });
  }
});

// Upload and process reports
app.post('/api/upload', upload.fields([
  { name: 'searchTerm', maxCount: 1 },
  { name: 'targeting', maxCount: 1 },
  { name: 'product', maxCount: 1 },
  { name: 'purchasedProduct', maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const { startDate, endDate } = req.body;

    if (!files.searchTerm?.[0] || !files.targeting?.[0] || !files.product?.[0]) {
      return res.status(400).json({ error: 'All three core reports are required (Search Term, Targeting, Advertised Product)' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    console.log('\n📤 Processing uploaded reports...');

    // Build parse command with optional purchased product report
    let parseCmd = `npm run parse -- ${files.searchTerm[0].path} ${files.targeting[0].path} ${files.product[0].path} ${startDate} ${endDate}`;

    if (files.purchasedProduct?.[0]) {
      parseCmd += ` ${files.purchasedProduct[0].path}`;
      console.log('  📦 Purchased Product Report included');
    }

    console.log('Running parse command...');
    const parseResult = await execAsync(parseCmd, { cwd: __dirname + '/..' });

    // Extract snapshot ID from output
    const snapshotMatch = parseResult.stdout.match(/Snapshot ID: (\d+)/);
    if (!snapshotMatch) {
      throw new Error('Failed to get snapshot ID');
    }
    const snapshotId = parseInt(snapshotMatch[1]);

    console.log(`✅ Reports loaded. Snapshot ID: ${snapshotId}`);
    console.log('🔄 Running ownership analysis...');

    const ownershipCmd = `npm run ownership -- ${snapshotId}`;
    await execAsync(ownershipCmd, { cwd: __dirname + '/..' });

    // Get action count
    const actionResult = await pool.query(
      'SELECT COUNT(*) as count FROM actions WHERE snapshot_id = $1',
      [snapshotId]
    );
    const actionCount = parseInt(actionResult.rows[0].count);

    console.log(`✅ Complete! Generated ${actionCount} actions`);

    res.json({
      success: true,
      snapshotId,
      totalActions: actionCount,
      message: 'Reports processed successfully!'
    });
  } catch (error: any) {
    console.error('Error processing upload:', error);
    res.status(500).json({ error: error.message || 'Failed to process reports' });
  }
});

// ==================== DASHBOARD ENDPOINTS ====================

const dashboardService = new DashboardService();
const VALID_PERIODS = ['L7', 'L14', 'L30', 'L60', 'L90'];

function parsePeriod(q: unknown): Period {
  const p = String(q || 'L30').toUpperCase();
  return VALID_PERIODS.includes(p) ? p as Period : 'L30';
}

// Dashboard KPIs with period-over-period change
app.get('/api/dashboard/kpis', async (req, res) => {
  try {
    const period = parsePeriod(req.query.period);
    const data = await dashboardService.getKpis(period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// Daily time-series
app.get('/api/dashboard/daily', async (req, res) => {
  try {
    const period = parsePeriod(req.query.period);
    const data = await dashboardService.getDaily(period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching daily data:', error);
    res.status(500).json({ error: 'Failed to fetch daily data' });
  }
});

// Top campaigns
app.get('/api/dashboard/campaigns', async (req, res) => {
  try {
    const period = parsePeriod(req.query.period);
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 50);
    const data = await dashboardService.getTopCampaigns(period, limit);
    res.json(data);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Category performance
app.get('/api/dashboard/categories', async (req, res) => {
  try {
    const period = parsePeriod(req.query.period);
    const data = await dashboardService.getCategories(period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Top search terms
app.get('/api/dashboard/search-terms', async (req, res) => {
  try {
    const period = parsePeriod(req.query.period);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const data = await dashboardService.getTopSearchTerms(period, limit);
    res.json(data);
  } catch (error) {
    console.error('Error fetching search terms:', error);
    res.status(500).json({ error: 'Failed to fetch search terms' });
  }
});

// ==================== OWNERSHIP V2 ENDPOINTS (DataBridge direct) ==

const ownershipService = new OwnershipService();
const VALID_OWNERSHIP_PERIODS = ['L14', 'L30', 'L60', 'L90'];

function parseOwnershipPeriod(q: unknown): OwnershipPeriod {
  const p = String(q || 'L30').toUpperCase();
  return VALID_OWNERSHIP_PERIODS.includes(p) ? p as OwnershipPeriod : 'L30';
}

// Full ownership analysis
app.get('/api/v2/ownership', async (req, res) => {
  try {
    const period = parseOwnershipPeriod(req.query.period);
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string || '').toLowerCase();

    const summary = await ownershipService.analyze(period);

    // Filter + paginate
    let filtered = summary.results;
    if (search) {
      filtered = filtered.filter(r =>
        r.keyword.includes(search)
        || r.hero?.asin?.includes(search.toUpperCase())
        || r.hero?.category?.toLowerCase().includes(search)
      );
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    res.json({
      totalKeywords: summary.totalKeywords,
      ownedKeywords: summary.ownedKeywords,
      contestedKeywords: summary.contestedKeywords,
      totalAsins: summary.totalAsins,
      period,
      data: paged,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Error in ownership analysis:', error);
    res.status(500).json({ error: error.message || 'Ownership analysis failed' });
  }
});

// ==================== BID OPTIMIZER ENDPOINTS ====================

const bidOptimizer = new BidOptimizer(pool);

// Preview bid recommendations (dry run)
app.get('/api/bids/preview', async (req, res) => {
  try {
    const lookbackDays = parseInt(req.query.days as string) || 14;
    const recommendations = await bidOptimizer.preview({ lookbackDays });
    res.json({
      count: recommendations.length,
      totalIncreases: recommendations.filter(r => r.bidDelta > 0).length,
      totalDecreases: recommendations.filter(r => r.bidDelta < 0).length,
      recommendations,
    });
  } catch (error: any) {
    console.error('Error in bid preview:', error);
    res.status(500).json({ error: error.message || 'Preview failed' });
  }
});

// Apply bid changes
app.post('/api/bids/apply', async (req, res) => {
  try {
    const { ids } = req.body; // optional: specific keyword IDs to apply
    const recommendations = await bidOptimizer.preview();

    const filtered = ids?.length
      ? recommendations.filter(r => ids.includes(r.keywordId))
      : recommendations;

    if (!filtered.length) {
      return res.json({ applied: 0, errors: [], message: 'No changes to apply' });
    }

    // Run async
    bidOptimizer.apply(filtered).then(result => {
      console.log(`💰 Bid optimizer: ${result.applied} applied, ${result.errors.length} errors`);
    }).catch(err => {
      console.error('Bid apply error:', err.message);
    });

    res.json({ message: `Applying ${filtered.length} bid changes`, startedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error applying bids:', error);
    res.status(500).json({ error: error.message || 'Apply failed' });
  }
});

// Get bid change history
app.get('/api/bids/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const result = await pool.query(`
      SELECT * FROM bid_history ORDER BY created_at DESC LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (error: any) {
    // Table might not exist yet
    if (error.code === '42P01') return res.json([]);
    console.error('Error fetching bid history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ==================== ACTION EXECUTION ENDPOINTS ====================

const adsExecutor = new AdsExecutor(pool);

// Execute a single action via Amazon Ads API
app.post('/api/actions/:id/execute', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid action ID' });
    }

    const result = await adsExecutor.executeAction(id);
    res.json(result);
  } catch (error: any) {
    console.error('Error executing action:', error);
    res.status(500).json({ error: error.message || 'Execution failed' });
  }
});

// Execute multiple actions
app.post('/api/actions/bulk-execute', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    if (ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 actions per bulk request' });
    }

    // Run async — return immediately
    adsExecutor.executeBulk(ids).then(results => {
      const succeeded = results.filter(r => r.success).length;
      console.log(`🎯 Bulk execute: ${succeeded}/${results.length} succeeded`);
    }).catch(err => {
      console.error('Bulk execute error:', err.message);
    });

    res.json({ message: `Executing ${ids.length} actions`, startedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error in bulk execute:', error);
    res.status(500).json({ error: error.message || 'Bulk execution failed' });
  }
});

// ==================== CRON ENDPOINTS ====================

// Get cron status
app.get('/api/cron/status', (req, res) => {
  res.json(getCronStatus());
});

// Manually trigger sync
app.post('/api/cron/trigger', async (req, res) => {
  const status = getCronStatus();
  if (status.isRunning) {
    return res.status(409).json({ error: 'Sync is already running' });
  }

  // Run async — return immediately
  runDailySync(pool).then(result => {
    console.log(`🔄 Manual trigger complete: Snapshot ${result.snapshotId}, ${result.actionCount} actions`);
  }).catch(err => {
    console.error('🔄 Manual trigger failed:', err.message);
  });

  res.json({ message: 'Sync triggered', startedAt: new Date().toISOString() });
});

// ==================== SETTINGS ENDPOINTS ====================

// GET /api/settings - Get all settings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings ORDER BY key');

    // Convert array to object for easier frontend consumption
    const settingsObj: any = {};
    result.rows.forEach(row => {
      settingsObj[row.key] = row.value;
    });

    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// GET /api/settings/:key - Get a specific setting
app.get('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json(result.rows[0].value);
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// PUT /api/settings/:key - Update a specific setting
app.put('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // Check if setting exists
    const existingResult = await pool.query('SELECT id FROM settings WHERE key = $1', [key]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Update setting
    await pool.query(
      'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
      [value, key]
    );

    res.json({ success: true, message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 AdPilot API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Cron status: http://localhost:${PORT}/api/cron/status`);
  console.log(`   Manual trigger: POST http://localhost:${PORT}/api/cron/trigger`);
  console.log('');

  // Start daily scheduler
  startScheduler(pool);
});
