import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { fetchFromDataBridge, getDataBridgeProfiles, closeDataBridgePool } from './databridgeAdapter';
import { DataInsertionService } from './dataInsertion';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'keyword_ownership_engine',
  user: process.env.DATABASE_USER || 'ahmetersoy',
  password: process.env.DATABASE_PASSWORD || '',
});

async function main() {
  const args = process.argv.slice(2);

  // Parse --from and --to flags
  let startDate: string | undefined;
  let endDate: string | undefined;
  let profileId: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) startDate = args[++i];
    if (args[i] === '--to' && args[i + 1]) endDate = args[++i];
    if (args[i] === '--profile' && args[i + 1]) profileId = parseInt(args[++i]);
  }

  // Default: last 60 days
  if (!endDate) {
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    endDate = end.toISOString().split('T')[0];
  }
  if (!startDate) {
    const start = new Date(endDate);
    start.setUTCDate(start.getUTCDate() - 59);
    startDate = start.toISOString().split('T')[0];
  }

  // If no profile specified, list available and use first
  if (!profileId) {
    const profiles = await getDataBridgeProfiles();
    if (!profiles.length) {
      console.error('❌ No active profiles found in DataBridge');
      process.exit(1);
    }
    console.log('\n📋 Available profiles:');
    profiles.forEach(p => console.log(`   ${p.profile_id} — ${p.country_code} (${p.account_name})`));
    profileId = profiles[0].profile_id;
    console.log(`\n→ Using profile: ${profileId}\n`);
  }

  try {
    // Fetch from DataBridge
    const reports = await fetchFromDataBridge(profileId, startDate, endDate);

    if (reports.searchTermReport.length === 0 && reports.targetingReport.length === 0) {
      console.error('❌ No data found in DataBridge for this date range');
      process.exit(1);
    }

    // Insert into ads_tool DB
    const service = new DataInsertionService(pool);
    const snapshotId = await service.processReports(
      reports,
      new Date(startDate),
      new Date(endDate),
    );

    console.log(`\n🎯 Snapshot ID: ${snapshotId}`);
    console.log(`\nNext steps:`);
    console.log(`  npm run ownership ${snapshotId}`);
    console.log(`  npm run export:all ${snapshotId}`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closeDataBridgePool();
    await pool.end();
  }
}

main();
