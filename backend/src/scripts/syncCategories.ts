#!/usr/bin/env node
/**
 * Sync product categories from sku_master (pricelab_db).
 * Maps AdPilot product_group names to sku_master categories using:
 * 1. ASIN lookup (if available in the future)
 * 2. Product group prefix → sku_master category keyword matching
 *
 * Usage: npx ts-node src/scripts/syncCategories.ts
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// ── AdPilot product_group → sku_master category mapping ──
// Based on campaign naming convention + sku_master name prefix analysis
const CATEGORY_MAP: Array<{ patterns: string[]; category: string }> = [
  // IWA Metal: IM- prefix, metal wall art
  { patterns: ['IM AK', 'IM ', 'Surah Rahman-Metal', 'WA-Basmala-Metal', 'WA-Mashallah', 'WA-La ilahe', 'WA-Protection', 'WA-Barakah', 'WA-Dua', 'WA-Names of Allah', 'WA-Surah', 'WA-Horizontal', 'WA-Black Mirror', 'Names of Allah', 'Mihrab', 'Allah and Mohammad', 'Mashallah-Tabarakallah'], category: 'IWA Metal' },
  // IWA Ahsap: wooden products
  { patterns: ['Ayatul Kursi-Wooden', 'TT-Bism', 'TT-Basmala', 'TT-Islamic Bookend', 'Sub-Alham-Allah-Wooden', 'Masjid-Wooden', 'Islamic Clock-Wooden', 'Islamic Clock'], category: 'IWA Ahsap' },
  // IWA Tabletop: TT- prefix tabletop items
  { patterns: ['TT-'], category: 'IWA Tabletop' },
  // Shukran Cam: glass products
  { patterns: ['Ayatul Kursi-Glass', 'WA-Ayatul Kursi Mihrab Dome'], category: 'Shukran Cam' },
  // CFW Ahsap Harita: wooden world maps
  { patterns: ['CAH ', 'MAP-', 'MAP_', 'KV183'], category: 'CFW Ahsap Harita' },
  // CFW Metal: metal wall decor (non-Islamic)
  { patterns: ['Mandala'], category: 'CFW Metal' },
  // Mobilya: furniture
  { patterns: ['MOB ', 'Ottoman', 'Walnut', 'Piano', 'FRN'], category: 'Mobilya' },
  // Kanvas
  { patterns: ['KV-', 'Kanvas'], category: 'Kanvas' },
  // Tekstil
  { patterns: ['ITE ', 'ITE-', 'Embroidered', 'Placemats'], category: 'Tekstil' },
  // Alsat: Styrofoam panels (DS = Dekoratif Strafor)
  { patterns: ['DS Star', 'DS Buz', 'Strafor', 'Styrofoam'], category: 'Alsat' },
  // IWA Ahsap: Islamic accessories (acrylic, concrete, stickers, cards)
  { patterns: ['IA ', 'IA-', 'CR Concrete', 'IWA Ramadan', 'RMDN'], category: 'IWA Ahsap' },
  // Alsat: legacy Starfor naming
  { patterns: ['Starfor'], category: 'Alsat' },
  // IWA Metal: IMA prefix
  { patterns: ['IMA '], category: 'IWA Metal' },
  // Shukran Cam: glass suffix
  { patterns: ['-Glass-'], category: 'Shukran Cam' },
  // IWA Ahsap: Wooden suffix (Surah Rahman-Wooden)
  { patterns: ['-Wooden-'], category: 'IWA Ahsap' },
  // sku_master Turkish names (direct match from product_group)
  { patterns: ['CFW Metal Üstü Ahşap', 'CFW Metal Ustu Ahsap'], category: 'CFW Metal Ustu Ahsap' },
  { patterns: ['CFW Ahşap Harita', 'CFW Ahsap Harita'], category: 'CFW Ahsap Harita' },
  { patterns: ['Shukran Cam'], category: 'Shukran Cam' },
  // Catch-all WA (Islamic wall art, default to IWA Metal)
  { patterns: ['WA-', 'WA ', 'WA'], category: 'IWA Metal' },
  // Catch-all TT (tabletop)
  { patterns: ['TT'], category: 'IWA Tabletop' },
];

function mapCategory(productGroup: string): string | null {
  const upper = productGroup.toUpperCase();
  for (const { patterns, category } of CATEGORY_MAP) {
    for (const pattern of patterns) {
      if (upper.startsWith(pattern.toUpperCase()) || upper.includes(pattern.toUpperCase())) {
        return category;
      }
    }
  }
  return null;
}

async function main() {
  const adpilotPool = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME || 'keyword_ownership_engine',
    user: process.env.DATABASE_USER || 'ahmetersoy',
    password: process.env.DATABASE_PASSWORD || '',
  });

  const pricelabPool = new Pool({
    host: process.env.DATABRIDGE_DB_HOST || 'localhost',
    port: parseInt(process.env.DATABRIDGE_DB_PORT || '5433'),
    database: 'pricelab_db',
    user: process.env.DATABRIDGE_DB_USER || 'pricelab',
    password: process.env.DATABRIDGE_DB_PASSWORD || 'pricelab123',
    max: 3,
  });

  try {
    // Step 1: Get all products
    const products = await adpilotPool.query('SELECT id, product_group, category FROM products');
    console.log(`📦 Total products: ${products.rows.length}`);

    // Step 2: Get sku_master ASIN → category cache (for future ASIN matching)
    const skuResult = await pricelabPool.query(`
      SELECT DISTINCT asin, category FROM sku_master
      WHERE asin IS NOT NULL AND category IS NOT NULL
    `);
    const asinCategoryMap = new Map<string, string>();
    for (const r of skuResult.rows) {
      asinCategoryMap.set(r.asin, r.category);
    }
    console.log(`📋 sku_master: ${asinCategoryMap.size} ASIN→category entries`);

    // Step 3: Map each product
    let updated = 0;
    let unchanged = 0;
    let unmapped = 0;
    const categoryStats = new Map<string, number>();

    for (const product of products.rows) {
      const newCategory = mapCategory(product.product_group);

      if (!newCategory) {
        unmapped++;
        console.log(`  ⚠️  Unmapped: "${product.product_group}" (id: ${product.id})`);
        continue;
      }

      categoryStats.set(newCategory, (categoryStats.get(newCategory) || 0) + 1);

      if (product.category === newCategory) {
        unchanged++;
        continue;
      }

      await adpilotPool.query(
        'UPDATE products SET category = $1 WHERE id = $2',
        [newCategory, product.id]
      );
      updated++;
    }

    console.log(`\n✅ Category sync complete:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Unchanged: ${unchanged}`);
    console.log(`   Unmapped: ${unmapped}`);
    console.log(`\n📊 Category distribution:`);
    Array.from(categoryStats.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, cnt]) => console.log(`   ${cat}: ${cnt}`));

  } finally {
    await adpilotPool.end();
    await pricelabPool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
