#!/usr/bin/env node
/**
 * CLI tool for importing product categories from catalog file
 * Usage: npm run import-categories -- <catalog_file_path>
 */

import XLSX from 'xlsx';
import { pool } from '../db/connection';

interface CatalogRow {
  asin: string;
  sku: string;
  name: string;
  category: string;
}

async function importCategories(catalogPath: string) {
  console.log('\n📂 Reading catalog file...');
  const workbook = XLSX.readFile(catalogPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`  ✅ Found ${rawData.length} products in catalog\n`);

  const catalogData: CatalogRow[] = rawData.map((row) => ({
    asin: row.asin || '',
    sku: row.sku || '',
    name: row.name || '',
    category: row.category || '',
  }));

  // Get category statistics from catalog
  const categoryStats = new Map<string, number>();
  catalogData.forEach((row) => {
    if (row.category) {
      categoryStats.set(row.category, (categoryStats.get(row.category) || 0) + 1);
    }
  });

  console.log('📊 Categories in catalog:');
  Array.from(categoryStats.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`  - ${category}: ${count} products`);
    });

  console.log('\n🔄 Updating product categories in database...');
  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of catalogData) {
    if (!row.asin || !row.category) {
      continue;
    }

    try {
      const result = await pool.query(
        'UPDATE products SET category = $1 WHERE asin = $2',
        [row.category, row.asin]
      );

      if (result.rowCount && result.rowCount > 0) {
        updated++;
      } else {
        notFound++;
      }
    } catch (error) {
      console.error(`  ❌ Error updating ASIN ${row.asin}:`, error);
      errors++;
    }
  }

  console.log('\n✅ Category import complete:');
  console.log(`  - Updated: ${updated} products`);
  console.log(`  - Not found in DB: ${notFound} products`);
  console.log(`  - Errors: ${errors}`);

  // Show updated category distribution in database
  const dbCategories = await pool.query(`
    SELECT category, COUNT(*) as count
    FROM products
    WHERE category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
  `);

  console.log('\n📊 Updated category distribution in database:');
  dbCategories.rows.forEach((row) => {
    console.log(`  - ${row.category}: ${row.count} products`);
  });

  const uncategorized = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE category IS NULL
  `);
  console.log(`  - Uncategorized: ${uncategorized.rows[0].count} products`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npm run import-categories -- <catalog_file_path>');
    console.log('Example: npm run import-categories -- ./sample-data/asin-kategori.xlsx');
    process.exit(1);
  }

  const [catalogPath] = args;

  try {
    await importCategories(catalogPath);
    await pool.end();
    console.log('\n🎉 Done!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
