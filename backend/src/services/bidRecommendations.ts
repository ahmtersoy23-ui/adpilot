import { adsApiRequest } from './adsApiClient';

const CONTENT_TYPE = 'application/vnd.spthemebasedbidrecommendation.v4+json';
const ENDPOINT = '/sp/targets/bid/recommendations';
const MAX_EXPRESSIONS = 100;

type TargetingType =
  | 'CLOSE_MATCH' | 'LOOSE_MATCH' | 'SUBSTITUTES' | 'COMPLEMENTS'
  | 'KEYWORD_BROAD_MATCH' | 'KEYWORD_EXACT_MATCH' | 'KEYWORD_PHRASE_MATCH';

interface TargetingExpression {
  type: TargetingType;
  value?: string; // required for KEYWORD_* types, omitted for auto targets
}

export interface BidRecommendationResult {
  targetingExpression: TargetingExpression;
  bidValues: { suggestedBid: number }[];
}

export interface BidRecommendationTheme {
  theme: string;
  bidRecommendationsForTargetingExpressions: BidRecommendationResult[];
}

/**
 * Actual Amazon response:
 * { bidRecommendations: [{ theme, bidRecommendationsForTargetingExpressions: [{ targetingExpression, bidValues }] }] }
 */
function normalizeResponse(data: any): BidRecommendationTheme[] {
  if (data?.bidRecommendations) return data.bidRecommendations;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Get Amazon ML bid recommendations for keyword targets in an ad group.
 * All expressions must be the same type (all keyword OR all auto).
 * Max 100 expressions per request.
 */
export async function getKeywordBidRecommendations(
  campaignId: string,
  adGroupId: string,
  keywords: { text: string; matchType: 'BROAD' | 'EXACT' | 'PHRASE' }[],
): Promise<BidRecommendationTheme[]> {
  const results: BidRecommendationTheme[] = [];

  const expressions: TargetingExpression[] = keywords.map(kw => ({
    type: `KEYWORD_${kw.matchType}_MATCH` as TargetingType,
    value: kw.text,
  }));

  for (let i = 0; i < expressions.length; i += MAX_EXPRESSIONS) {
    const batch = expressions.slice(i, i + MAX_EXPRESSIONS);

    const data = await adsApiRequest('POST', ENDPOINT, {
      campaignId,
      adGroupId,
      recommendationType: 'BIDS_FOR_EXISTING_AD_GROUP',
      targetingExpressions: batch,
    }, CONTENT_TYPE);

    results.push(...normalizeResponse(data));
  }

  return results;
}

/**
 * Get bid recommendations for auto-targeting (4 types).
 */
export async function getAutoTargetBidRecommendations(
  campaignId: string,
  adGroupId: string,
): Promise<BidRecommendationTheme[]> {
  const data = await adsApiRequest('POST', ENDPOINT, {
    campaignId,
    adGroupId,
    recommendationType: 'BIDS_FOR_EXISTING_AD_GROUP',
    targetingExpressions: [
      { type: 'CLOSE_MATCH' },
      { type: 'LOOSE_MATCH' },
      { type: 'SUBSTITUTES' },
      { type: 'COMPLEMENTS' },
    ],
  }, CONTENT_TYPE);

  return normalizeResponse(data);
}
