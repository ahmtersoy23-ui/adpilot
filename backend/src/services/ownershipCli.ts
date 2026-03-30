#!/usr/bin/env node
/**
 * CLI tool for running Ownership Engine and Action Generation
 * Usage: npm run ownership -- <snapshot_id>
 */

import { pool } from '../db/connection';
import { OwnershipEngineService } from './ownershipEngine';
import { ActionEngineService } from './actionEngine';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npm run ownership -- <snapshot_id>');
    console.log('Example: npm run ownership -- 1');
    process.exit(1);
  }

  const snapshotId = parseInt(args[0]);

  if (isNaN(snapshotId)) {
    console.error('❌ Invalid snapshot ID');
    process.exit(1);
  }

  try {
    // Verify snapshot exists
    const snapshotCheck = await pool.query(
      'SELECT id, period_start, period_end FROM snapshots WHERE id = $1',
      [snapshotId]
    );

    if (snapshotCheck.rows.length === 0) {
      console.error(`❌ Snapshot ${snapshotId} not found`);
      process.exit(1);
    }

    const snapshot = snapshotCheck.rows[0];
    console.log(`\n📊 Processing Snapshot ${snapshotId}`);
    console.log(`   Period: ${snapshot.period_start} to ${snapshot.period_end}`);

    // Step 1: Run Ownership Engine
    const ownershipEngine = new OwnershipEngineService(pool);
    const assignments = await ownershipEngine.processOwnership(snapshotId);

    // Step 2: Run Action Generation Engine
    const actionEngine = new ActionEngineService(pool);
    const actions = await actionEngine.generateAllActions(snapshotId, assignments);

    console.log('\n🎉 Analysis Complete!\n');
    console.log('Next steps:');
    console.log('  1. Review actions: psql keyword_ownership_engine -c "SELECT * FROM actions WHERE snapshot_id = ' + snapshotId + '"');
    console.log('  2. Export bulk sheet: npm run export:bulk -- ' + snapshotId);
    console.log('  3. Export Perpetua checklist: npm run export:perpetua -- ' + snapshotId);
    console.log('  4. Start API: npm run dev');
    console.log('');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
