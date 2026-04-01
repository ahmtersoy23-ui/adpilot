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
 * Category assignment — maps campaign product_group to sku_master categories.
 * Order matters: more specific patterns first, catch-all patterns last.
 */
const CATEGORY_RULES: Array<{ patterns: string[]; category: string }> = [
  // IWA Metal: IM- prefix, metal wall art, named Islamic wall art campaigns
  { patterns: ['IM AK', 'SURAH RAHMAN-METAL', 'WA-BASMALA-METAL', 'WA-MASHALLAH', 'WA-LA ILAHE', 'WA-PROTECTION', 'WA-BARAKAH', 'WA-DUA', 'WA-NAMES OF ALLAH', 'WA-SURAH', 'WA-HORIZONTAL', 'WA-BLACK MIRROR', 'NAMES OF ALLAH', 'MIHRAB', 'ALLAH AND MOHAMMAD', 'MASHALLAH-TABARAKALLAH'], category: 'IWA Metal' },
  // IWA Ahsap: wooden products
  { patterns: ['AYATUL KURSI-WOODEN', 'TT-BISM', 'TT-BASMALA', 'TT-ISLAMIC BOOKEND', 'SUB-ALHAM-ALLAH-WOODEN', 'MASJID-WOODEN', 'ISLAMIC CLOCK-WOODEN', 'ISLAMIC CLOCK', '-WOODEN-'], category: 'IWA Ahsap' },
  // IWA Tabletop: TT- prefix tabletop items
  { patterns: ['TT-', 'TT'], category: 'IWA Tabletop' },
  // Shukran Cam: glass products
  { patterns: ['AYATUL KURSI-GLASS', 'WA-AYATUL KURSI MIHRAB DOME', '-GLASS-', 'SHUKRAN CAM'], category: 'Shukran Cam' },
  // CFW Ahsap Harita: wooden world maps
  { patterns: ['CAH ', 'MAP-', 'MAP_', 'KV183', 'CFW AHSAP HARITA', 'CFW AHŞAP HARITA'], category: 'CFW Ahsap Harita' },
  // CFW Metal: metal wall decor (non-Islamic)
  { patterns: ['MANDALA', 'CFW METAL'], category: 'CFW Metal' },
  // CFW Metal Ustu Ahsap
  { patterns: ['CFW METAL ÜSTÜ AHŞAP', 'CFW METAL USTU AHSAP'], category: 'CFW Metal Ustu Ahsap' },
  // Mobilya: furniture
  { patterns: ['MOB ', 'OTTOMAN', 'WALNUT', 'PIANO', 'FRN'], category: 'Mobilya' },
  // Kanvas
  { patterns: ['KV-', 'KANVAS'], category: 'Kanvas' },
  // Tekstil
  { patterns: ['ITE ', 'ITE-', 'EMBROIDERED', 'PLACEMATS'], category: 'Tekstil' },
  // Alsat: Styrofoam panels
  { patterns: ['DS STAR', 'DS BUZ', 'STRAFOR', 'STYROFOAM', 'STARFOR'], category: 'Alsat' },
  // IWA Ahsap: Islamic accessories (acrylic, concrete, stickers, cards, seasonal)
  { patterns: ['IA ', 'IA-', 'CR CONCRETE', 'IWA RAMADAN', 'RMDN', 'IMA '], category: 'IWA Ahsap' },
  // Catch-all WA (Islamic wall art → IWA Metal)
  { patterns: ['WA-', 'WA'], category: 'IWA Metal' },
];

/**
 * Determine category from product group name using sku_master categories.
 */
export function determineCategory(productGroup: string): string | undefined {
  const upper = productGroup.toUpperCase();

  for (const { patterns, category } of CATEGORY_RULES) {
    for (const pattern of patterns) {
      if (upper.startsWith(pattern) || upper.includes(pattern)) {
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
