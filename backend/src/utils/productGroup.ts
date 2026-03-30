/**
 * Product Group Extraction Utilities
 * Based on Perpetua campaign naming convention:
 * {ProductGroup} - {Uni/UNV/Universal} - MA - SP - {Auto/Manual/PAT} - {hash}
 */

const PATTERNS_TO_REMOVE = [
  / - MA - SP -.*$/i,
  / - UNV -.*$/i,
  / - Uni -.*$/i,
  / - Universal -.*$/i,
];

/**
 * Extract product group from campaign name
 * Example: "IM AK - UNV - MA - SP - Auto - abc123" → "IM AK"
 */
export function extractProductGroup(campaignName: string): string {
  let productGroup = campaignName.trim();

  // Remove known patterns
  for (const pattern of PATTERNS_TO_REMOVE) {
    productGroup = productGroup.replace(pattern, '');
  }

  // Return the first part before any remaining " - "
  const parts = productGroup.split(' - ');
  return parts[0].trim();
}

/**
 * Category assignment based on product group keywords
 * Based on CLAUDE.md category mapping
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Islamic Wall Art': [
    'WA-', 'MIHRAB', 'AYATUL', 'BASMALA', 'MASHALLAH', 'SURAH', 'ALLAH',
    'ISLAMIC', 'IM AK', 'IMA', 'NAMES OF', 'GOLDEN RATIO', 'SUB-ALHAM',
    'BARAKAH', 'PROTECTION', 'CLOCK', 'BOOKEND', 'QURAN', 'LA ILAHE',
    'BIS MAASH', 'BISM ALHAM', 'TT-', 'KEY HOLDER', 'DUA', 'FRN',
  ],
  'World Maps': ['CAH', 'MAP', 'KV183'],
  'Styrofoam Panels': ['STRAFOR', 'STYROFOAM', 'DS STAR', 'DS BUZ'],
  'Furniture': ['PIANO', 'OTTOMAN', 'STOOL', 'MOB'],
  'Ramadan Seasonal': ['RMDN', 'RAMADAN'],
  'Mandala Art': ['MANDALA'],
  'Islamic Accessories': ['IA', 'IWA', 'ITE', 'CR CONCRETE', 'CARD'],
};

/**
 * Determine category from product group name
 */
export function determineCategory(productGroup: string): string | undefined {
  const upperProductGroup = productGroup.toUpperCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (upperProductGroup.includes(keyword.toUpperCase())) {
        return category;
      }
    }
  }

  return undefined; // Uncategorized
}

/**
 * Extract campaign type from campaign name
 */
export function extractCampaignType(campaignName: string): 'Auto' | 'Manual' | 'PAT' | undefined {
  const upper = campaignName.toUpperCase();

  if (upper.includes('- AUTO -')) return 'Auto';
  if (upper.includes('- MANUAL -')) return 'Manual';
  if (upper.includes('- PAT -')) return 'PAT';

  return undefined;
}

/**
 * Check if a search term is an ASIN target (product targeting)
 * ASIN pattern: B0xxxxxxxxx
 */
export function isAsinTarget(searchTerm: string): boolean {
  return /^B0[A-Z0-9]{8}$/i.test(searchTerm);
}

/**
 * Check if a search term is aggregated data (should be skipped)
 */
export function isAggregatedTerm(searchTerm: string): boolean {
  return searchTerm === '*' || searchTerm === '';
}

/**
 * Normalize numeric value from Excel (handle various formats)
 */
export function normalizeNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove $ and commas
    const cleaned = value.replace(/[$,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Normalize percentage value from Excel
 */
export function normalizePercentage(value: any): number {
  if (typeof value === 'number') {
    // Amazon reports provide percentages already in correct format (e.g., 25.5 for 25.5%)
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/%/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Parse date from Excel format
 */
export function parseDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  // Try parsing string
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}
