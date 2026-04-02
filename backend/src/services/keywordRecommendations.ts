import { adsApiRequest } from './adsApiClient';

const CONTENT_TYPE = 'application/vnd.spkeywordsrecommendation.v4+json';
const ENDPOINT = '/sp/targets/keywords/recommendations';

export interface KeywordBidInfo {
  matchType: string;
  rank: number;
  bid: number;
  suggestedBid: { rangeStart: number; rangeMedian: number; rangeEnd: number; bidRecId: string };
}

export interface KeywordRecommendation {
  keyword: string;
  translation?: string;
  userSelectedKeyword: boolean;
  searchTermImpressionRank?: number;
  searchTermImpressionShare?: number;
  recId: string;
  bidInfo: KeywordBidInfo[];
}

/**
 * Get keyword recommendations for a list of ASINs.
 * Max 50 ASINs per request, max 200 recommendations.
 */
export async function getKeywordRecsForAsins(
  asins: string[],
  sortDimension: 'CLICKS' | 'CONVERSIONS' | 'DEFAULT' = 'CONVERSIONS',
  maxRecommendations = 200,
): Promise<KeywordRecommendation[]> {
  if (!asins.length) return [];

  const data = await adsApiRequest('POST', ENDPOINT, {
    recommendationType: 'KEYWORDS_FOR_ASINS',
    asins: asins.slice(0, 50),
    maxRecommendations,
    sortDimension,
    locale: 'en_US',
    bidsEnabled: true,
  }, CONTENT_TYPE);

  return normalizeResponse(data);
}

/**
 * Get keyword recommendations for an existing ad group.
 */
export async function getKeywordRecsForAdGroup(
  campaignId: string,
  adGroupId: string,
  sortDimension: 'CLICKS' | 'CONVERSIONS' | 'DEFAULT' = 'CONVERSIONS',
  maxRecommendations = 200,
): Promise<KeywordRecommendation[]> {
  const data = await adsApiRequest('POST', ENDPOINT, {
    recommendationType: 'KEYWORDS_FOR_ADGROUP',
    campaignId,
    adGroupId,
    maxRecommendations,
    sortDimension,
    bidsEnabled: true,
  }, CONTENT_TYPE);

  return normalizeResponse(data);
}

function normalizeResponse(data: any): KeywordRecommendation[] {
  // Amazon response: { keywordTargetList: [...] }
  if (data?.keywordTargetList) return data.keywordTargetList;
  if (Array.isArray(data)) return data;
  return [];
}
