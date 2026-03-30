-- Keyword Ownership Engine - Database Schema
-- Based on CLAUDE.md specification

-- Drop existing tables (for development)
DROP TABLE IF EXISTS action_results CASCADE;
DROP TABLE IF EXISTS actions CASCADE;
DROP TABLE IF EXISTS asin_campaign_performance CASCADE;
DROP TABLE IF EXISTS campaign_targeting_performance CASCADE;
DROP TABLE IF EXISTS keyword_campaign_performance CASCADE;
DROP TABLE IF EXISTS keyword_product_roles CASCADE;
DROP TABLE IF EXISTS keyword_ownership CASCADE;
DROP TABLE IF EXISTS snapshots CASCADE;
DROP TABLE IF EXISTS keywords CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- Core Tables

-- Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  asin VARCHAR(20) NOT NULL,
  sku VARCHAR(50),
  product_group VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  title VARCHAR(500),
  average_selling_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(asin, sku)
);

CREATE INDEX idx_products_asin ON products(asin);
CREATE INDEX idx_products_product_group ON products(product_group);
CREATE INDEX idx_products_category ON products(category);

-- Campaigns table
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  campaign_name VARCHAR(500) NOT NULL UNIQUE,
  ad_group_name VARCHAR(500),
  product_group VARCHAR(100),
  campaign_type VARCHAR(20), -- Auto, Manual, PAT
  portfolio_name VARCHAR(200),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaigns_product_group ON campaigns(product_group);
CREATE INDEX idx_campaigns_name ON campaigns(campaign_name);

-- Keywords table
CREATE TABLE keywords (
  id SERIAL PRIMARY KEY,
  keyword_text VARCHAR(500) NOT NULL UNIQUE,
  first_seen_date DATE,
  keyword_type VARCHAR(20), -- search_term, asin_target, auto
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_keywords_text ON keywords(keyword_text);
CREATE INDEX idx_keywords_type ON keywords(keyword_type);

-- Snapshot tracking (report uploads)
CREATE TABLE snapshots (
  id SERIAL PRIMARY KEY,
  upload_date TIMESTAMP DEFAULT NOW(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  marketplace VARCHAR(10) DEFAULT 'US',
  search_term_rows INT,
  targeting_rows INT,
  advertised_product_rows INT,
  total_spend DECIMAL(12,2),
  total_sales DECIMAL(12,2),
  notes TEXT
);

CREATE INDEX idx_snapshots_period ON snapshots(period_start, period_end);

-- Keyword ownership assignments
CREATE TABLE keyword_ownership (
  id SERIAL PRIMARY KEY,
  keyword_id INT REFERENCES keywords(id) ON DELETE CASCADE,
  hero_product_id INT REFERENCES products(id) ON DELETE CASCADE,
  ownership_score DECIMAL(12,4),
  status VARCHAR(20) DEFAULT 'auto', -- auto, manual_override, seasonal
  override_expiry DATE,
  override_reason VARCHAR(200),
  last_calculated TIMESTAMP DEFAULT NOW(),
  UNIQUE(keyword_id)
);

CREATE INDEX idx_keyword_ownership_keyword ON keyword_ownership(keyword_id);
CREATE INDEX idx_keyword_ownership_hero ON keyword_ownership(hero_product_id);

-- Keyword-product roles (Hero, Support, Long Tail, Exclude, Contested)
CREATE TABLE keyword_product_roles (
  id SERIAL PRIMARY KEY,
  keyword_id INT REFERENCES keywords(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- hero, support, long_tail, exclude, contested
  ownership_score DECIMAL(12,4),
  snapshot_id INT REFERENCES snapshots(id) ON DELETE CASCADE,
  UNIQUE(keyword_id, product_id, snapshot_id)
);

CREATE INDEX idx_kpr_keyword ON keyword_product_roles(keyword_id);
CREATE INDEX idx_kpr_product ON keyword_product_roles(product_id);
CREATE INDEX idx_kpr_role ON keyword_product_roles(role);
CREATE INDEX idx_kpr_snapshot ON keyword_product_roles(snapshot_id);

-- Performance Tables (Snapshot-based)

-- Keyword × Campaign performance (from Search Term Report)
CREATE TABLE keyword_campaign_performance (
  id SERIAL PRIMARY KEY,
  snapshot_id INT REFERENCES snapshots(id) ON DELETE CASCADE,
  keyword_id INT REFERENCES keywords(id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  match_type VARCHAR(30),
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  total_sales DECIMAL(10,2) DEFAULT 0,
  adv_sales DECIMAL(10,2) DEFAULT 0,
  other_sales DECIMAL(10,2) DEFAULT 0,
  orders INT DEFAULT 0,
  adv_units INT DEFAULT 0,
  other_units INT DEFAULT 0,
  ctr DECIMAL(12,6),
  cpc DECIMAL(12,4),
  acos DECIMAL(12,4),
  cvr DECIMAL(12,6)
);

CREATE INDEX idx_kcp_snapshot ON keyword_campaign_performance(snapshot_id);
CREATE INDEX idx_kcp_keyword ON keyword_campaign_performance(keyword_id);
CREATE INDEX idx_kcp_campaign ON keyword_campaign_performance(campaign_id);

-- Campaign × Targeting performance (from Targeting Report)
CREATE TABLE campaign_targeting_performance (
  id SERIAL PRIMARY KEY,
  snapshot_id INT REFERENCES snapshots(id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  targeting_text VARCHAR(500),
  match_type VARCHAR(30),
  top_of_search_share DECIMAL(10,4),
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  total_sales DECIMAL(10,2) DEFAULT 0,
  adv_sales DECIMAL(10,2) DEFAULT 0,
  other_sales DECIMAL(10,2) DEFAULT 0,
  orders INT DEFAULT 0,
  adv_units INT DEFAULT 0,
  other_units INT DEFAULT 0
);

CREATE INDEX idx_ctp_snapshot ON campaign_targeting_performance(snapshot_id);
CREATE INDEX idx_ctp_campaign ON campaign_targeting_performance(campaign_id);

-- ASIN × Campaign performance (from Advertised Product Report)
CREATE TABLE asin_campaign_performance (
  id SERIAL PRIMARY KEY,
  snapshot_id INT REFERENCES snapshots(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  total_sales DECIMAL(10,2) DEFAULT 0,
  adv_sales DECIMAL(10,2) DEFAULT 0,
  other_sales DECIMAL(10,2) DEFAULT 0,
  orders INT DEFAULT 0,
  adv_units INT DEFAULT 0,
  other_units INT DEFAULT 0,
  CONSTRAINT uq_acp_snapshot_product_campaign UNIQUE(snapshot_id, product_id, campaign_id)
);

CREATE INDEX idx_acp_snapshot ON asin_campaign_performance(snapshot_id);
CREATE INDEX idx_acp_product ON asin_campaign_performance(product_id);
CREATE INDEX idx_acp_campaign ON asin_campaign_performance(campaign_id);

-- Action Tables

-- Generated actions
CREATE TABLE actions (
  id SERIAL PRIMARY KEY,
  snapshot_id INT REFERENCES snapshots(id) ON DELETE CASCADE,
  action_type VARCHAR(30) NOT NULL,
  -- Types: campaign_pause, bid_change, negative_add, asin_remove, asin_change
  application_channel VARCHAR(20) NOT NULL, -- 'bulk_sheet' or 'perpetua'
  priority VARCHAR(5), -- P1, P2, P3
  target_campaign VARCHAR(500),
  target_ad_group VARCHAR(500),
  target_keyword VARCHAR(500),
  target_asin VARCHAR(20),
  current_value VARCHAR(100),
  recommended_value VARCHAR(100),
  estimated_monthly_savings DECIMAL(10,2),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  -- Status: pending, approved, applied, skipped, rejected
  applied_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_actions_snapshot ON actions(snapshot_id);
CREATE INDEX idx_actions_type ON actions(action_type);
CREATE INDEX idx_actions_channel ON actions(application_channel);
CREATE INDEX idx_actions_priority ON actions(priority);
CREATE INDEX idx_actions_status ON actions(status);

-- Action result tracking
CREATE TABLE action_results (
  id SERIAL PRIMARY KEY,
  action_id INT REFERENCES actions(id) ON DELETE CASCADE,
  before_snapshot_id INT REFERENCES snapshots(id),
  after_snapshot_id INT REFERENCES snapshots(id),
  before_spend DECIMAL(10,2),
  after_spend DECIMAL(10,2),
  before_sales DECIMAL(10,2),
  after_sales DECIMAL(10,2),
  before_acos DECIMAL(8,4),
  after_acos DECIMAL(8,4),
  actual_savings DECIMAL(10,2),
  notes TEXT,
  evaluated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_action_results_action ON action_results(action_id);

-- Settings table (JSONB for flexibility)
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('target_acos', '{"default": 25, "by_category": {"Islamic Wall Art": 20, "World Maps": 27, "Styrofoam Panels": 15, "Furniture": 30, "Ramadan Seasonal": 40, "Mandala Art": 27, "Islamic Accessories": 30}}'),
  ('min_orders_threshold', '5'),
  ('min_clicks_threshold', '50'),
  ('min_spend_threshold', '10'),
  ('hero_score_ratio', '0.5'),
  ('category_keywords', '{
    "Islamic Wall Art": ["WA-", "MIHRAB", "AYATUL", "BASMALA", "MASHALLAH", "SURAH", "ALLAH", "ISLAMIC", "IM AK", "IMA", "NAMES OF", "GOLDEN RATIO", "SUB-ALHAM", "BARAKAH", "PROTECTION", "CLOCK", "BOOKEND", "QURAN", "LA ILAHE", "BIS MAASH", "BISM ALHAM", "TT-", "KEY HOLDER", "DUA", "FRN"],
    "World Maps": ["CAH", "MAP", "KV183"],
    "Styrofoam Panels": ["STRAFOR", "STYROFOAM", "DS STAR", "DS BUZ"],
    "Furniture": ["PIANO", "OTTOMAN", "STOOL", "MOB"],
    "Ramadan Seasonal": ["RMDN", "RAMADAN"],
    "Mandala Art": ["MANDALA"],
    "Islamic Accessories": ["IA", "IWA", "ITE", "CR CONCRETE", "CARD"]
  }');

-- Create views for common queries

-- View: Current ownership summary
CREATE OR REPLACE VIEW v_current_ownership AS
SELECT
  k.keyword_text,
  p.asin as hero_asin,
  p.product_group as hero_product_group,
  p.category,
  ko.ownership_score,
  ko.status,
  ko.last_calculated
FROM keyword_ownership ko
JOIN keywords k ON ko.keyword_id = k.id
JOIN products p ON ko.hero_product_id = p.id
ORDER BY ko.ownership_score DESC;

-- View: Latest snapshot summary
CREATE OR REPLACE VIEW v_latest_snapshot AS
SELECT
  id,
  period_start,
  period_end,
  marketplace,
  total_spend,
  total_sales,
  CASE WHEN total_sales > 0 THEN (total_spend / total_sales * 100) ELSE NULL END as acos,
  search_term_rows + targeting_rows + advertised_product_rows as total_rows,
  upload_date
FROM snapshots
ORDER BY upload_date DESC
LIMIT 1;

COMMENT ON TABLE products IS 'Product catalog with ASIN, SKU, and product group classification';
COMMENT ON TABLE campaigns IS 'Amazon Ads campaigns extracted from reports';
COMMENT ON TABLE keywords IS 'Unique keywords from search term and targeting reports';
COMMENT ON TABLE snapshots IS 'Report upload tracking and period metadata';
COMMENT ON TABLE keyword_ownership IS 'Hero product assignments for keywords';
COMMENT ON TABLE keyword_product_roles IS 'All product roles (Hero/Support/LongTail/Exclude) per keyword';
COMMENT ON TABLE actions IS 'Generated optimization actions for Bulk Sheet or Perpetua';
COMMENT ON COLUMN actions.application_channel IS 'bulk_sheet = Amazon Console upload, perpetua = manual Perpetua dashboard changes';
