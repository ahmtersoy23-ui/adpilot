#!/usr/bin/env node
/**
 * CLI tool for parsing Amazon Ads reports and loading into database
 * Usage: npm run parse -- <search_term_path> <targeting_path> <advertised_product_path> <start_date> <end_date> [purchased_product_path]
 */

import path from 'path';
import { parseAllReports } from './reportParser';
import { DataInsertionService } from '../services/dataInsertion';
import { pool } from '../db/connection';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 5) {
    console.log('Usage: npm run parse -- <search_term_path> <targeting_path> <advertised_product_path> <start_date> <end_date> [purchased_product_path]');
    console.log('Example: npm run parse -- ./sample-data/search.xlsx ./sample-data/targeting.xlsx ./sample-data/product.xlsx 2024-01-01 2024-02-29');
    console.log('Example with Purchased Product: npm run parse -- ./sample-data/search.xlsx ./sample-data/targeting.xlsx ./sample-data/product.xlsx 2024-01-01 2024-02-29 ./sample-data/purchased.xlsx');
    process.exit(1);
  }

  const [searchTermPath, targetingPath, advertisedProductPath, startDateStr, endDateStr, purchasedProductPath] = args;

  // Parse dates
  const periodStart = new Date(startDateStr);
  const periodEnd = new Date(endDateStr);

  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }

  try {
    // Parse reports (with optional purchased product report)
    const reports = parseAllReports(searchTermPath, targetingPath, advertisedProductPath, purchasedProductPath);

    // Insert into database
    const insertionService = new DataInsertionService(pool);
    const snapshotId = await insertionService.processReports(reports, periodStart, periodEnd);

    console.log(`\n🎉 Success! Snapshot ID: ${snapshotId}`);
    console.log('\nYou can now run queries against the database to verify the data.');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
