import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Run incremental sync every 30 minutes
// Note: This only syncs Hevy -> Convex
// The Notion sync needs to be triggered separately with database IDs
crons.interval(
  "sync-hevy-to-convex",
  { minutes: 30 },
  api.hevy.incrementalSync
);

export default crons;
