// Heartbeat stub — replaces Manus Forge cron jobs.
// On Vercel, use Vercel Cron Jobs (configured in vercel.json) to trigger
// POST /api/scheduled/campaign on a schedule.
// This module stores cron metadata in the DB only; no external scheduler API.

import { nanoid } from "nanoid";

export type HeartbeatJob = {
  name: string;
  cron: string;
  path: string;
  method?: string;
  payload?: unknown;
  description?: string;
};

export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">>;

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  cronExpression: string;
  callbackPath: string;
  description: string;
  enabled: boolean;
};

/**
 * "Create" a heartbeat job — returns a local taskUid stored in the DB.
 * Actual scheduling is handled by Vercel Cron Jobs in vercel.json.
 */
export async function createHeartbeatJob(
  job: HeartbeatJob,
  _userSession: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  const taskUid = `local_${nanoid(16)}`;
  console.log(`[Heartbeat] Created cron job stub: ${taskUid} (${job.cron}) → ${job.path}`);
  return { taskUid, nextExecutionAt: null };
}

export async function updateHeartbeatJob(
  taskUid: string,
  _patch: HeartbeatJobUpdate,
  _userSession: string
): Promise<{ nextExecutionAt?: string | null }> {
  console.log(`[Heartbeat] Update stub for: ${taskUid}`);
  return { nextExecutionAt: null };
}

export async function deleteHeartbeatJob(
  taskUid: string,
  _userSession: string
): Promise<void> {
  console.log(`[Heartbeat] Delete stub for: ${taskUid}`);
}

export async function listHeartbeatJobs(
  _userSession: string,
  _pagination?: { page?: number; pageSize?: number }
): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  return { total: 0, actorUserId: "", jobs: [] };
}
