import * as cron from 'node-cron';
import { Pool } from 'pg';
import { OwnershipService } from './ownershipService';
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

const CRON_SCHEDULE = '0 7 * * *'; // 07:00 UTC daily (after DataBridge ads sync at 06:00)

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
 * Run the daily pipeline: ownership (via DataBridge) + bid optimizer.
 * No more dataInsertion — ownership v2 queries DataBridge directly,
 * avoiding 500K+ sequential queries and OOM on 4GB server.
 */
export async function runDailySync(pool: Pool): Promise<{ snapshotId: number; actionCount: number }> {
  if (status.isRunning) {
    throw new Error('Sync is already running');
  }

  status.isRunning = true;
  const startTime = Date.now();

  try {
    console.log('\n⏰ [CRON] Daily sync started at', new Date().toISOString());

    // Step 1: Run ownership analysis (queries DataBridge directly — no local insertion)
    const ownershipService = new OwnershipService();
    const ownership = await ownershipService.analyze('L30');

    console.log(`  🎯 Ownership: ${ownership.totalKeywords} keywords, ${ownership.ownedKeywords} owned, ${ownership.contestedKeywords} contested`);

    // Step 2: Run bid optimizer (preview only)
    let bidCount = 0;
    try {
      const optimizer = new BidOptimizer(pool);
      const bidRecs = await optimizer.preview();
      bidCount = bidRecs.length;
      console.log(`  💰 Bid optimizer: ${bidCount} recommendations generated`);
    } catch (bidErr: any) {
      console.warn(`  ⚠️  Bid optimizer skipped: ${bidErr.message}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ [CRON] Daily sync complete in ${elapsed}s — ${ownership.ownedKeywords} owned keywords, ${bidCount} bid recs\n`);

    // Update status
    status.lastRun = new Date().toISOString();
    status.lastResult = 'success';
    status.lastSnapshotId = null;
    status.lastActionCount = bidCount;
    status.lastError = null;
    status.isRunning = false;

    return { snapshotId: 0, actionCount: bidCount };
  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ❌ [CRON] Daily sync failed after ${elapsed}s:`, error.message);

    status.lastRun = new Date().toISOString();
    status.lastResult = 'error';
    status.lastError = error.message;
    status.isRunning = false;

    throw error;
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
