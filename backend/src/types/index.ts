// Type definitions for the Keyword Ownership Engine

export interface Product {
  id?: number;
  asin: string;
  sku?: string;
  product_group: string;
  category?: string;
  title?: string;
  average_selling_price?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface Campaign {
  id?: number;
  campaign_name: string;
  ad_group_name?: string;
  product_group?: string;
  campaign_type?: 'Auto' | 'Manual' | 'PAT';
  portfolio_name?: string;
  status?: string;
  created_at?: Date;
}

export interface Keyword {
  id?: number;
  keyword_text: string;
  first_seen_date?: Date;
  keyword_type?: 'search_term' | 'asin_target' | 'auto';
  created_at?: Date;
}

export interface Snapshot {
  id?: number;
  upload_date?: Date;
  period_start: Date;
  period_end: Date;
  marketplace?: string;
  search_term_rows?: number;
  targeting_rows?: number;
  advertised_product_rows?: number;
  total_spend?: number;
  total_sales?: number;
  notes?: string;
}

// Report row types (from Excel files)

export interface SearchTermReportRow {
  'Start Date': string;
  'End Date': string;
  'Portfolio name': string;
  'Currency': string;
  'Campaign Name': string;
  'Ad Group Name': string;
  'Retailer': string;
  'Country': string;
  'Targeting': string;
  'Match Type': string;
  'Customer Search Term': string;
  'Impressions': number;
  'Clicks': number;
  'Click-Thru Rate (CTR)': number;
  'Cost Per Click (CPC)': number;
  'Spend': number;
  '7 Day Total Sales': number;
  'Total Advertising Cost of Sales (ACOS)': number;
  'Total Return on Advertising Spend (ROAS)': number;
  '7 Day Total Orders (#)': number;
  '7 Day Total Units (#)': number;
  '7 Day Conversion Rate': number;
  '7 Day Advertised SKU Units (#)': number;
  '7 Day Other SKU Units (#)': number;
  '7 Day Advertised SKU Sales': number;
  '7 Day Other SKU Sales': number;
}

export interface TargetingReportRow {
  'Start Date': string;
  'End Date': string;
  'Portfolio name': string;
  'Currency': string;
  'Campaign Name': string;
  'Ad Group Name': string;
  'Retailer': string;
  'Country': string;
  'Targeting': string;
  'Match Type': string;
  'Top-of-search Impression Share': number;
  'Impressions': number;
  'Clicks': number;
  'Click-Thru Rate (CTR)': number;
  'Cost Per Click (CPC)': number;
  'Spend': number;
  '7 Day Total Sales': number;
  'Total Advertising Cost of Sales (ACOS)': number;
  'Total Return on Advertising Spend (ROAS)': number;
  '7 Day Total Orders (#)': number;
  '7 Day Total Units (#)': number;
  '7 Day Conversion Rate': number;
  '7 Day Advertised SKU Units (#)': number;
  '7 Day Other SKU Units (#)': number;
  '7 Day Advertised SKU Sales': number;
  '7 Day Other SKU Sales': number;
}

export interface AdvertisedProductReportRow {
  'Start Date': string;
  'End Date': string;
  'Portfolio name': string;
  'Currency': string;
  'Campaign Name': string;
  'Ad Group Name': string;
  'Retailer': string;
  'Country': string;
  'Advertised SKU': string;
  'Advertised ASIN': string;
  'Impressions': number;
  'Clicks': number;
  'Click-Thru Rate (CTR)': number;
  'Cost Per Click (CPC)': number;
  'Spend': number;
  '7 Day Total Sales': number;
  'Total Advertising Cost of Sales (ACOS)': number;
  'Total Return on Advertising Spend (ROAS)': number;
  '7 Day Total Orders (#)': number;
  '7 Day Total Units (#)': number;
  '7 Day Conversion Rate': number;
  '7 Day Advertised SKU Units (#)': number;
  '7 Day Other SKU Units (#)': number;
  '7 Day Advertised SKU Sales': number;
  '7 Day Other SKU Sales': number;
}

export interface PurchasedProductReportRow {
  'Start Date': string;
  'End Date': string;
  'Portfolio name': string;
  'Currency': string;
  'Campaign Name': string;
  'Ad Group Name': string;
  'Advertised SKU': string;
  'Advertised ASIN': string;
  'Purchased ASIN': string;
  'Targeting': string;
  'Match Type': string;
  '7 Day Other SKU Units (#)': number;
  '7 Day Other SKU Orders (#)': number;
  '7 Day Other SKU Sales': number;
}

export interface ParsedReports {
  searchTermReport: SearchTermReportRow[];
  targetingReport: TargetingReportRow[];
  advertisedProductReport: AdvertisedProductReportRow[];
  purchasedProductReport?: PurchasedProductReportRow[];
}

export interface KeywordCampaignPerformance {
  snapshot_id: number;
  keyword_id: number;
  campaign_id: number;
  match_type: string;
  impressions: number;
  clicks: number;
  spend: number;
  total_sales: number;
  adv_sales: number;
  other_sales: number;
  orders: number;
  adv_units: number;
  other_units: number;
  ctr: number;
  cpc: number;
  acos: number;
  cvr: number;
}

export interface OwnershipRole {
  keyword_id: number;
  product_id: number;
  role: 'hero' | 'support' | 'long_tail' | 'exclude' | 'contested';
  ownership_score: number;
  snapshot_id: number;
}

export interface Action {
  snapshot_id: number;
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
  status?: 'pending' | 'approved' | 'applied' | 'skipped' | 'rejected';
}
