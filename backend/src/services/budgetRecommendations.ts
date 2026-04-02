import { adsApiRequest } from './adsApiClient';

const CONTENT_TYPE = 'application/vnd.budgetrecommendation.v3+json';
const ENDPOINT = '/sp/campaigns/budgetRecommendations';
const MAX_PER_REQUEST = 100;

export interface BudgetRecommendation {
  campaignId: string;
  suggestedBudget: number;
  sevenDaysMissedOpportunities?: {
    startDate: string;
    endDate: string;
    percentTimeInBudget: number;
    estimatedMissedImpressionsLower: number;
    estimatedMissedImpressionsUpper: number;
    estimatedMissedClicksLower: number;
    estimatedMissedClicksUpper: number;
    estimatedMissedSalesLower: number;
    estimatedMissedSalesUpper: number;
  };
}

/**
 * Get budget recommendations for campaigns.
 * Amazon returns recommended daily budget + estimated missed opportunities.
 *
 * Actual response shape:
 * { budgetRecommendationsSuccessResults: [...], budgetRecommendationsErrorResults: [...] }
 */
export async function getBudgetRecommendations(
  campaignIds: string[],
): Promise<BudgetRecommendation[]> {
  if (!campaignIds.length) return [];

  const results: BudgetRecommendation[] = [];

  for (let i = 0; i < campaignIds.length; i += MAX_PER_REQUEST) {
    const batch = campaignIds.slice(i, i + MAX_PER_REQUEST);

    const data = await adsApiRequest(
      'POST',
      ENDPOINT,
      { campaignIds: batch },
      CONTENT_TYPE,
    );

    // Amazon response: { budgetRecommendationsSuccessResults: [...], budgetRecommendationsErrorResults: [...] }
    if (data?.budgetRecommendationsSuccessResults) {
      results.push(...data.budgetRecommendationsSuccessResults);
    } else if (Array.isArray(data)) {
      results.push(...data);
    }

    if (data?.budgetRecommendationsErrorResults?.length) {
      console.warn('[BudgetRecs] Errors:', JSON.stringify(data.budgetRecommendationsErrorResults).slice(0, 300));
    }
  }

  return results;
}
