import { adsApiRequest } from './adsApiClient';

const ENDPOINT = '/history';
const MAX_DAYS = 90;

export interface HistoryEvent {
  eventId?: string;
  eventType?: string;
  eventDate?: number;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  previousValue?: string;
  newValue?: string;
  changedBy?: string;
}

export interface HistoryResponse {
  events: HistoryEvent[];
  nextToken?: string;
  totalRecords?: number;
  pageSize?: number;
  pageOffset?: number;
  maxPageNumber?: number;
}

/**
 * Get change history for advertising account.
 * Dates are epoch milliseconds. Max 90 days lookback.
 */
export async function getChangeHistory(opts: {
  daysBack?: number;
  campaignIds?: string[];
  filters?: string[];
  count?: number;
  nextToken?: string;
}): Promise<HistoryResponse> {
  const daysBack = Math.min(opts.daysBack ?? 30, MAX_DAYS - 1); // 89 max to avoid boundary edge
  const now = Date.now();
  const fromDate = now - (daysBack * 24 * 60 * 60 * 1000);

  const body: any = {
    fromDate,
    toDate: now,
    count: opts.count ?? 100,
    sort: { key: 'DATE', direction: 'DESC' },
  };

  // eventTypes is REQUIRED by Amazon API — query multiple entity types
  const entityFilter: any = {};
  if (opts.campaignIds?.length) entityFilter.eventTypeIds = opts.campaignIds;
  if (opts.filters?.length) entityFilter.filters = opts.filters;

  // Supported: CAMPAIGN, AD_GROUP, AD, KEYWORD, PRODUCT_TARGETING,
  //           NEGATIVE_KEYWORD, NEGATIVE_PRODUCT_TARGETING, THEME
  body.eventTypes = {
    CAMPAIGN: entityFilter,
    AD_GROUP: {},
    KEYWORD: {},
    NEGATIVE_KEYWORD: {},
    AD: {},
  };

  if (opts.nextToken) {
    body.nextToken = opts.nextToken;
  }

  const data = await adsApiRequest('POST', ENDPOINT, body, 'application/json');

  return {
    events: data?.events ?? (Array.isArray(data) ? data : []),
    nextToken: data?.nextToken,
    totalRecords: data?.totalRecords,
    pageSize: data?.pageSize,
    pageOffset: data?.pageOffset,
    maxPageNumber: data?.maxPageNumber,
  };
}
