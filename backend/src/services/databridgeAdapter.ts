import { Pool } from 'pg';
import { ParsedReports, SearchTermReportRow, TargetingReportRow, AdvertisedProductReportRow } from '../types';

/**
 * DataBridge PostgreSQL connection (read-only).
 * Connects via SSH tunnel: localhost:5433 → server:5432
 */
function createDataBridgePool(): Pool {
  return new Pool({
    host: process.env.DATABRIDGE_DB_HOST || 'localhost',
    port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'),
    database: process.env.DATABRIDGE_DB_NAME || 'databridge_db',
    user: process.env.DATABRIDGE_DB_USER || 'pricelab',
    password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

let databridgePool: Pool | null = null;

function getPool(): Pool {
  if (!databridgePool) {
    databridgePool = createDataBridgePool();
  }
  return databridgePool;
}

/**
 * Fetch Search Term Report data from DataBridge and map to ads_tool format.
 */
async function fetchSearchTermData(profileId: number, startDate: string, endDate: string): Promise<SearchTermReportRow[]> {
  const pool = getPool();

  const result = await pool.query(`
    SELECT
      report_date, portfolio_name, currency,
      campaign_name, campaign_id, ad_group_name, ad_group_id,
      targeting, match_type, customer_search_term,
      impressions, clicks, spend, sales_7d, orders_7d, units_7d, cpc
    FROM ads_search_term_report
    WHERE profile_id = $1
      AND report_date >= $2::date
      AND report_date <= $3::date
    ORDER BY report_date
  `, [profileId, startDate, endDate]);

  return result.rows.map(r => ({
    'Start Date': startDate,
    'End Date': endDate,
    'Portfolio name': r.portfolio_name || '',
    'Currency': r.currency || 'USD',
    'Campaign Name': r.campaign_name || '',
    'Ad Group Name': r.ad_group_name || '',
    'Retailer': 'AMAZON.COM',
    'Country': 'US',
    'Targeting': r.targeting || '',
    'Match Type': r.match_type || '',
    'Customer Search Term': r.customer_search_term || '',
    'Impressions': Number(r.impressions) || 0,
    'Clicks': Number(r.clicks) || 0,
    'Click-Thru Rate (CTR)': r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    'Cost Per Click (CPC)': Number(r.cpc) || 0,
    'Spend': Number(r.spend) || 0,
    '7 Day Total Sales': Number(r.sales_7d) || 0,
    'Total Advertising Cost of Sales (ACOS)': r.sales_7d > 0 ? (r.spend / r.sales_7d) * 100 : 0,
    'Total Return on Advertising Spend (ROAS)': r.spend > 0 ? r.sales_7d / r.spend : 0,
    '7 Day Total Orders (#)': Number(r.orders_7d) || 0,
    '7 Day Total Units (#)': Number(r.units_7d) || 0,
    '7 Day Conversion Rate': r.clicks > 0 ? (r.orders_7d / r.clicks) * 100 : 0,
    '7 Day Advertised SKU Units (#)': 0, // Not available in DataBridge search_term table
    '7 Day Other SKU Units (#)': 0,
    '7 Day Advertised SKU Sales': 0,
    '7 Day Other SKU Sales': 0,
  }));
}

/**
 * Fetch Targeting Report data from DataBridge.
 */
async function fetchTargetingData(profileId: number, startDate: string, endDate: string): Promise<TargetingReportRow[]> {
  const pool = getPool();

  const result = await pool.query(`
    SELECT
      report_date, portfolio_name, currency,
      campaign_name, campaign_id, ad_group_name, ad_group_id,
      targeting, match_type,
      impressions, clicks, spend, sales_7d, orders_7d, units_7d
    FROM ads_targeting_report
    WHERE profile_id = $1
      AND report_date >= $2::date
      AND report_date <= $3::date
    ORDER BY report_date
  `, [profileId, startDate, endDate]);

  return result.rows.map(r => ({
    'Start Date': startDate,
    'End Date': endDate,
    'Portfolio name': r.portfolio_name || '',
    'Currency': r.currency || 'USD',
    'Campaign Name': r.campaign_name || '',
    'Ad Group Name': r.ad_group_name || '',
    'Retailer': 'AMAZON.COM',
    'Country': 'US',
    'Targeting': r.targeting || '',
    'Match Type': r.match_type || '',
    'Top-of-search Impression Share': 0, // Available in targeting but not in current schema columns
    'Impressions': Number(r.impressions) || 0,
    'Clicks': Number(r.clicks) || 0,
    'Click-Thru Rate (CTR)': r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    'Cost Per Click (CPC)': r.clicks > 0 ? r.spend / r.clicks : 0,
    'Spend': Number(r.spend) || 0,
    '7 Day Total Sales': Number(r.sales_7d) || 0,
    'Total Advertising Cost of Sales (ACOS)': r.sales_7d > 0 ? (r.spend / r.sales_7d) * 100 : 0,
    'Total Return on Advertising Spend (ROAS)': r.spend > 0 ? r.sales_7d / r.spend : 0,
    '7 Day Total Orders (#)': Number(r.orders_7d) || 0,
    '7 Day Total Units (#)': Number(r.units_7d) || 0,
    '7 Day Conversion Rate': r.clicks > 0 ? (r.orders_7d / r.clicks) * 100 : 0,
    '7 Day Advertised SKU Units (#)': 0,
    '7 Day Other SKU Units (#)': 0,
    '7 Day Advertised SKU Sales': 0,
    '7 Day Other SKU Sales': 0,
  }));
}

/**
 * Fetch Advertised Product Report data from DataBridge.
 */
async function fetchAdvertisedProductData(profileId: number, startDate: string, endDate: string): Promise<AdvertisedProductReportRow[]> {
  const pool = getPool();

  const result = await pool.query(`
    SELECT
      report_date, portfolio_name, currency,
      campaign_name, campaign_id, ad_group_name, ad_group_id,
      impressions, clicks, spend, sales_7d, orders_7d, units_7d, cpc
    FROM ads_advertised_product_report
    WHERE profile_id = $1
      AND report_date >= $2::date
      AND report_date <= $3::date
    ORDER BY report_date
  `, [profileId, startDate, endDate]);

  return result.rows.map(r => ({
    'Start Date': startDate,
    'End Date': endDate,
    'Portfolio name': r.portfolio_name || '',
    'Currency': r.currency || 'USD',
    'Campaign Name': r.campaign_name || '',
    'Ad Group Name': r.ad_group_name || '',
    'Retailer': 'AMAZON.COM',
    'Country': 'US',
    'Advertised SKU': '', // Not in current DataBridge advertised_product table
    'Advertised ASIN': '', // Not in current DataBridge advertised_product table
    'Impressions': Number(r.impressions) || 0,
    'Clicks': Number(r.clicks) || 0,
    'Click-Thru Rate (CTR)': r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    'Cost Per Click (CPC)': Number(r.cpc) || 0,
    'Spend': Number(r.spend) || 0,
    '7 Day Total Sales': Number(r.sales_7d) || 0,
    'Total Advertising Cost of Sales (ACOS)': r.sales_7d > 0 ? (r.spend / r.sales_7d) * 100 : 0,
    'Total Return on Advertising Spend (ROAS)': r.spend > 0 ? r.sales_7d / r.spend : 0,
    '7 Day Total Orders (#)': Number(r.orders_7d) || 0,
    '7 Day Total Units (#)': Number(r.units_7d) || 0,
    '7 Day Conversion Rate': r.clicks > 0 ? (r.orders_7d / r.clicks) * 100 : 0,
    '7 Day Advertised SKU Units (#)': 0,
    '7 Day Other SKU Units (#)': 0,
    '7 Day Advertised SKU Sales': 0,
    '7 Day Other SKU Sales': 0,
  }));
}

/**
 * Fetch all reports from DataBridge and return as ParsedReports.
 * This replaces the Excel parsing step entirely.
 */
export async function fetchFromDataBridge(
  profileId: number,
  startDate: string,
  endDate: string,
): Promise<ParsedReports> {
  console.log(`\n📡 Fetching data from DataBridge (profile: ${profileId}, ${startDate} → ${endDate})...\n`);

  const [searchTermReport, targetingReport, advertisedProductReport] = await Promise.all([
    fetchSearchTermData(profileId, startDate, endDate),
    fetchTargetingData(profileId, startDate, endDate),
    fetchAdvertisedProductData(profileId, startDate, endDate),
  ]);

  console.log(`  Search Term rows: ${searchTermReport.length}`);
  console.log(`  Targeting rows: ${targetingReport.length}`);
  console.log(`  Advertised Product rows: ${advertisedProductReport.length}`);

  return {
    searchTermReport,
    targetingReport,
    advertisedProductReport,
  };
}

/**
 * Get available profile IDs from DataBridge.
 */
export async function getDataBridgeProfiles(): Promise<Array<{ profile_id: number; country_code: string; account_name: string }>> {
  const pool = getPool();
  const result = await pool.query(`
    SELECT profile_id, country_code, account_name
    FROM ads_api_profiles
    WHERE is_active = true
    ORDER BY country_code
  `);
  return result.rows;
}

/**
 * Cleanup: close DataBridge pool connection.
 */
export async function closeDataBridgePool(): Promise<void> {
  if (databridgePool) {
    await databridgePool.end();
    databridgePool = null;
  }
}
