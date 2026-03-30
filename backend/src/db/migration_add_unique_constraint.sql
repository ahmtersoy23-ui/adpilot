-- Migration: Add UNIQUE constraint to asin_campaign_performance
-- Date: 2026-02-11
-- Issue: K3 from Audit Report
-- Description: Prevents duplicate rows for same snapshot/product/campaign combination

-- Add UNIQUE constraint
ALTER TABLE asin_campaign_performance
ADD CONSTRAINT uq_acp_snapshot_product_campaign
UNIQUE(snapshot_id, product_id, campaign_id);
