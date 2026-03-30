#!/usr/bin/env node
/**
 * CLI tool for exporting Bulk Sheets and Perpetua Checklists
 * Usage:
 *   npm run export:bulk -- <snapshot_id>
 *   npm run export:perpetua -- <snapshot_id>
 *   npm run export:matrix -- <snapshot_id>
 */

import { pool } from '../db/connection';
import { ExportService } from './exportService';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage:');
    console.log('  npm run export:bulk -- <snapshot_id>');
    console.log('  npm run export:perpetua -- <snapshot_id>');
    console.log('  npm run export:matrix -- <snapshot_id>');
    console.log('  npm run export:all -- <snapshot_id>');
    process.exit(1);
  }

  const exportType = args[0]; // bulk, perpetua, matrix, or all
  const snapshotId = parseInt(args[1]);

  if (isNaN(snapshotId)) {
    console.error('❌ Invalid snapshot ID');
    process.exit(1);
  }

  try {
    const exportService = new ExportService(pool);

    console.log(`\n🚀 Exporting for Snapshot ${snapshotId}...\n`);

    if (exportType === 'bulk' || exportType === 'all') {
      await exportService.exportBulkSheet(snapshotId);
    }

    if (exportType === 'perpetua' || exportType === 'all') {
      await exportService.exportPerpetuaChecklist(snapshotId);
    }

    if (exportType === 'matrix' || exportType === 'all') {
      await exportService.exportOwnershipMatrix(snapshotId);
    }

    console.log('\n✨ Export complete!\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
