import { Pool } from 'pg';
import { getAdsClient } from './adsApiClient';
import dotenv from 'dotenv';
dotenv.config();

// ── Types ────────────────────────────────────────────

export interface ExecutionResult {
  actionId: number;
  success: boolean;
  message: string;
  amazonResponse?: any;
}

interface CampaignLookup {
  campaign_id: string;
  ad_group_id: string;
}

// ── DataBridge pool for campaign_id lookup ────────────

let dbPool: Pool | null = null;

function getDataBridgePool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      host: process.env.DATABRIDGE_DB_HOST || 'localhost',
      port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'),
      database: process.env.DATABRIDGE_DB_NAME || 'databridge_db',
      user: process.env.DATABRIDGE_DB_USER || 'pricelab',
      password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return dbPool;
}

// ── Campaign ID lookup ───────────────────────────────

const PROFILE_ID = process.env.ADS_PROFILE_ID || '387696953974213';

async function lookupCampaignId(campaignName: string, adGroupName?: string): Promise<CampaignLookup | null> {
  const pool = getDataBridgePool();

  // Use targeting_report as it has the most data
  const result = await pool.query(`
    SELECT DISTINCT campaign_id::text, ad_group_id::text
    FROM ads_targeting_report
    WHERE profile_id = $1
      AND campaign_name = $2
      ${adGroupName ? 'AND ad_group_name = $3' : ''}
    LIMIT 1
  `, adGroupName
    ? [PROFILE_ID, campaignName, adGroupName]
    : [PROFILE_ID, campaignName]
  );

  if (!result.rows.length) return null;
  return {
    campaign_id: result.rows[0].campaign_id,
    ad_group_id: result.rows[0].ad_group_id,
  };
}

// ── Amazon Ads API calls ─────────────────────────────

/**
 * Add a negative exact keyword to a campaign/ad group.
 * SP Negative Keywords API (V3)
 */
async function addNegativeKeyword(
  campaignId: string,
  adGroupId: string,
  keyword: string,
): Promise<any> {
  const client = await getAdsClient();

  const res = await client.post('/sp/negativeKeywords', {
    negativeKeywords: [{
      campaignId,
      adGroupId,
      keywordText: keyword,
      matchType: 'NEGATIVE_EXACT',
      state: 'ENABLED',
    }],
  }, {
    headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json' },
  });

  return res.data;
}

/**
 * Pause a campaign.
 * SP Campaigns API (V3)
 */
async function pauseCampaign(campaignId: string): Promise<any> {
  const client = await getAdsClient();

  const res = await client.put('/sp/campaigns', {
    campaigns: [{
      campaignId,
      state: 'PAUSED',
    }],
  }, {
    headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json' },
  });

  return res.data;
}

/**
 * Add a negative ASIN product target to a campaign/ad group.
 * SP Negative Targeting Clauses API (V3)
 */
async function addNegativeAsinTarget(
  campaignId: string,
  adGroupId: string,
  asin: string,
): Promise<any> {
  const client = await getAdsClient();

  const res = await client.post('/sp/negativeTargetingClauses', {
    negativeTargetingClauses: [{
      campaignId,
      adGroupId,
      expression: [{ type: 'ASIN_SAME_AS', value: asin }],
      state: 'ENABLED',
    }],
  }, {
    headers: { 'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json' },
  });

  return res.data;
}

// ── Main executor ────────────────────────────────────

export class AdsExecutor {
  constructor(private pool: Pool) {}

  /**
   * Execute a single action by ID.
   */
  async executeAction(actionId: number): Promise<ExecutionResult> {
    // Fetch the action
    const actionResult = await this.pool.query(
      'SELECT * FROM actions WHERE id = $1',
      [actionId]
    );

    if (!actionResult.rows.length) {
      return { actionId, success: false, message: 'Action not found' };
    }

    const action = actionResult.rows[0];

    if (action.status === 'applied') {
      return { actionId, success: false, message: 'Action already applied' };
    }

    // Look up campaign ID
    const lookup = await lookupCampaignId(
      action.target_campaign,
      action.target_ad_group || undefined,
    );

    if (!lookup) {
      await this.updateStatus(actionId, 'skipped', 'Campaign not found in DataBridge');
      return { actionId, success: false, message: `Campaign "${action.target_campaign}" not found` };
    }

    try {
      let amazonResponse: any;

      switch (action.action_type) {
        case 'negative_add':
          if (!action.target_keyword) {
            return { actionId, success: false, message: 'No target keyword' };
          }
          amazonResponse = await addNegativeKeyword(
            lookup.campaign_id,
            lookup.ad_group_id,
            action.target_keyword,
          );
          break;

        case 'campaign_pause':
          amazonResponse = await pauseCampaign(lookup.campaign_id);
          break;

        case 'negative_asin_add':
          if (!action.target_asin) {
            return { actionId, success: false, message: 'No target ASIN' };
          }
          amazonResponse = await addNegativeAsinTarget(
            lookup.campaign_id,
            lookup.ad_group_id,
            action.target_asin,
          );
          break;

        default:
          return {
            actionId,
            success: false,
            message: `Action type "${action.action_type}" not supported for API execution`,
          };
      }

      // Check for API-level errors in the response
      const hasError = this.checkResponseErrors(amazonResponse);
      if (hasError) {
        await this.updateStatus(actionId, 'skipped', hasError);
        return { actionId, success: false, message: hasError, amazonResponse };
      }

      await this.updateStatus(actionId, 'applied');
      return { actionId, success: true, message: 'Executed successfully', amazonResponse };

    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || 'Unknown API error';
      await this.updateStatus(actionId, 'skipped', errMsg);
      return { actionId, success: false, message: errMsg };
    }
  }

  /**
   * Execute multiple actions.
   */
  async executeBulk(actionIds: number[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const id of actionIds) {
      const result = await this.executeAction(id);
      results.push(result);

      // Rate limit: 1 TPS for new accounts
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    return results;
  }

  private checkResponseErrors(response: any): string | null {
    if (!response) return null;

    // V3 API returns success/error arrays
    const items = response.negativeKeywords
      || response.campaigns
      || response.negativeTargetingClauses
      || [];

    for (const item of items) {
      if (item.errors?.length) {
        return item.errors.map((e: any) => e.errorType || e.message).join(', ');
      }
    }

    return null;
  }

  private async updateStatus(actionId: number, status: string, errorMessage?: string): Promise<void> {
    if (errorMessage) {
      await this.pool.query(
        'UPDATE actions SET status = $1, reason = reason || $3 WHERE id = $2',
        [status, actionId, ` [API: ${errorMessage}]`]
      );
    } else {
      await this.pool.query(
        'UPDATE actions SET status = $1 WHERE id = $2',
        [status, actionId]
      );
    }
  }
}
