import * as cron from 'node-cron';
import { Pool } from 'pg';
import { fetchFromDataBridge, getDataBridgeProfiles, closeDataBridgePool } from './databridgeAdapter';
import { DataInsertionService } from './dataInsertion';
import { OwnershipEngineService } from './ownershipEngine';
import { ActionEngineService } from './actionEngine';
import { BidOptimizer } from './bidOptimizer';

export interface CronStatus {
  lastRun: string | null;
  lastResult: 'success' | 'error' | null;
  lastSnapshotId: number | null;
  lastActionCount: number | null;
  lastError: string | null;
  nextRun: string | null;
  isRunning: boolean;
}

const US_PROFILE_ID = 387696953974213;
const CRON_SCHEDULE = '0 7 * * *'; // 07:00 UTC daily (after DataBridge ads sync at 06:00)
const LOOKBACK_DAYS = 30; // Reduced from 60 to prevent OOM on 4GB server

let status: CronStatus = {
  lastRun: null,
  lastResult: null,
  lastSnapshotId: null,
  lastActionCount: null,
  lastError: null,
  nextRun: null,
  isRunning: false,
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export function getCronStatus(): CronStatus {
  return { ...status };
}

/**
 * Run the full pipeline: DataBridge fetch → snapshot → ownership → actions
 */
export async function runDailySync(pool: Pool): Promise<{ snapshotId: number; actionCount: number }> {
  if (status.isRunning) {
    throw new Error('Sync is already running');
  }

  status.isRunning = true;
  const startTime = Date.now();

  try {
    console.log('\n⏰ [CRON] Daily sync started at', new Date().toISOString());

    // Calculate date range (last N days, ending yesterday)
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (LOOKBACK_DAYS - 1));

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    console.log(`  📅 Period: ${startStr} → ${endStr}`);

    // Step 1: Fetch from DataBridge
    const reports = await fetchFromDataBridge(US_PROFILE_ID, startStr, endStr);

    if (reports.searchTermReport.length === 0 && reports.targetingReport.length === 0) {
      throw new Error('No data found in DataBridge for this date range');
    }

    // Step 2: Insert into AdPilot DB → create snapshot
    const insertionService = new DataInsertionService(pool);
    const snapshotId = await insertionService.processReports(
      reports,
      startDate,
      endDate,
    );

    console.log(`  🎯 Snapshot created: ID ${snapshotId}`);

    // Step 3: Run ownership engine
    const ownershipEngine = new OwnershipEngineService(pool);
    const assignments = await ownershipEngine.processOwnership(snapshotId);

    // Step 4: Run action engine
    const actionEngine = new ActionEngineService(pool);
    const actions = await actionEngine.generateAllActions(snapshotId, assignments);
    const actionCount = actions.length;

    // Step 5: Run bid optimizer (preview only — apply requires manual trigger or setting)
    try {
      const optimizer = new BidOptimizer(pool);
      const bidRecs = await optimizer.preview();
      console.log(`  💰 Bid optimizer: ${bidRecs.length} recommendations generated`);
    } catch (bidErr: any) {
      console.warn(`  ⚠️  Bid optimizer skipped: ${bidErr.message}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ [CRON] Daily sync complete in ${elapsed}s — Snapshot ${snapshotId}, ${actionCount} actions\n`);

    // Update status
    status.lastRun = new Date().toISOString();
    status.lastResult = 'success';
    status.lastSnapshotId = snapshotId;
    status.lastActionCount = actionCount;
    status.lastError = null;
    status.isRunning = false;

    return { snapshotId, actionCount };
  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ❌ [CRON] Daily sync failed after ${elapsed}s:`, error.message);

    status.lastRun = new Date().toISOString();
    status.lastResult = 'error';
    status.lastError = error.message;
    status.isRunning = false;

    throw error;
  } finally {
    await closeDataBridgePool();
  }
}

/**
 * Start the daily cron job.
 */
export function startScheduler(pool: Pool): void {
  if (scheduledTask) {
    console.log('⚠️  Scheduler already running');
    return;
  }

  scheduledTask = cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await runDailySync(pool);
    } catch {
      // Error already logged in runDailySync
    }
  }, {
    timezone: 'UTC',
  });

  // Calculate next run
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(7, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  status.nextRun = next.toISOString();

  console.log(`⏰ Daily sync scheduled: ${CRON_SCHEDULE} UTC (next: ${status.nextRun})`);
}

/**
 * Stop the cron job.
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('⏰ Scheduler stopped');
  }
}
