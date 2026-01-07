import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const HEVY_API_BASE = "https://api.hevyapp.com/v1";

// Types for Hevy API responses
interface HevySet {
  index: number;
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
}

interface HevyExercise {
  index: number;
  title: string;
  notes: string;
  exercise_template_id: string;
  superset_id: number | null;
  sets: HevySet[];
}

interface HevyWorkout {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  exercises: HevyExercise[];
}

interface HevyWorkoutsResponse {
  page: number;
  page_count: number;
  workouts: HevyWorkout[];
}

interface HevyEvent {
  type: "updated" | "deleted";
  workout?: HevyWorkout;
  id?: string;
  deleted_at?: string;
}

interface HevyEventsResponse {
  page: number;
  page_count: number;
  events: HevyEvent[];
}

// Fetch workouts from Hevy API
async function fetchHevyWorkouts(
  apiKey: string,
  page: number = 1,
  pageSize: number = 10
): Promise<HevyWorkoutsResponse> {
  const response = await fetch(
    `${HEVY_API_BASE}/workouts?page=${page}&pageSize=${pageSize}`,
    {
      headers: { "api-key": apiKey },
    }
  );

  if (response.status === 429) {
    throw new Error("Rate limited by Hevy API");
  }

  if (!response.ok) {
    throw new Error(`Hevy API error: ${response.status}`);
  }

  return response.json();
}

// Fetch workout events (incremental sync)
async function fetchHevyEvents(
  apiKey: string,
  since: string,
  page: number = 1,
  pageSize: number = 10
): Promise<HevyEventsResponse> {
  const response = await fetch(
    `${HEVY_API_BASE}/workouts/events?since=${encodeURIComponent(since)}&page=${page}&pageSize=${pageSize}`,
    {
      headers: { "api-key": apiKey },
    }
  );

  if (response.status === 429) {
    throw new Error("Rate limited by Hevy API");
  }

  if (!response.ok) {
    throw new Error(`Hevy API error: ${response.status}`);
  }

  return response.json();
}

// Fetch exercise templates
async function fetchExerciseTemplates(
  apiKey: string,
  page: number = 1,
  pageSize: number = 100
) {
  const response = await fetch(
    `${HEVY_API_BASE}/exercise_templates?page=${page}&pageSize=${pageSize}`,
    {
      headers: { "api-key": apiKey },
    }
  );

  if (!response.ok) {
    throw new Error(`Hevy API error: ${response.status}`);
  }

  return response.json();
}

// Calculate workout stats
function calculateWorkoutStats(exercises: HevyExercise[]) {
  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      totalSets++;
      if (set.reps) {
        totalReps += set.reps;
        if (set.weight_kg) {
          totalVolume += set.weight_kg * set.reps;
        }
      }
    }
  }

  return {
    totalVolume: Math.round(totalVolume * 10) / 10,
    totalSets,
    totalReps,
  };
}

// Calculate duration in minutes
function calculateDuration(startTime: string, endTime: string | null): number | undefined {
  if (!endTime) return undefined;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.round((end - start) / 60000);
}

// Action to sync all workouts (full sync)
export const fullSync = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.HEVY_API_KEY;
    if (!apiKey) {
      throw new Error("HEVY_API_KEY not configured");
    }

    // Get first page to know total pages
    const firstPage = await fetchHevyWorkouts(apiKey, 1, 10);
    const totalPages = firstPage.page_count;

    let allWorkouts: HevyWorkout[] = [...firstPage.workouts];

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
      await new Promise((resolve) => setTimeout(resolve, 300)); // Rate limit
      const pageData = await fetchHevyWorkouts(apiKey, page, 10);
      allWorkouts.push(...pageData.workouts);
    }

    // Store workouts in Convex
    for (const workout of allWorkouts) {
      await ctx.runMutation(internal.sync.upsertWorkout, { workout });
    }

    // Update sync state
    await ctx.runMutation(internal.sync.updateSyncState, {
      lastSyncedAt: new Date().toISOString(),
      lastEventTimestamp: new Date().toISOString(),
    });

    return {
      success: true,
      workoutsProcessed: allWorkouts.length,
    };
  },
});

// Action for incremental sync using events endpoint
export const incrementalSync = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.HEVY_API_KEY;
    if (!apiKey) {
      throw new Error("HEVY_API_KEY not configured");
    }

    // Get last sync timestamp
    const syncState = await ctx.runQuery(internal.sync.getSyncState);
    const since = syncState?.lastEventTimestamp || "1970-01-01T00:00:00Z";

    // Fetch events since last sync
    const firstPage = await fetchHevyEvents(apiKey, since, 1, 10);
    let allEvents: HevyEvent[] = [...firstPage.events];

    // Fetch remaining pages
    for (let page = 2; page <= firstPage.page_count; page++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const pageData = await fetchHevyEvents(apiKey, since, page, 10);
      allEvents.push(...pageData.events);
    }

    let updatedCount = 0;
    let deletedCount = 0;

    // Process events
    for (const event of allEvents) {
      if (event.type === "updated" && event.workout) {
        await ctx.runMutation(internal.sync.upsertWorkout, { workout: event.workout });
        updatedCount++;
      } else if (event.type === "deleted" && event.id) {
        await ctx.runMutation(internal.sync.markWorkoutDeleted, { hevyId: event.id });
        deletedCount++;
      }
    }

    // Update sync state
    await ctx.runMutation(internal.sync.updateSyncState, {
      lastSyncedAt: new Date().toISOString(),
      lastEventTimestamp: new Date().toISOString(),
    });

    return {
      success: true,
      eventsProcessed: allEvents.length,
      updated: updatedCount,
      deleted: deletedCount,
    };
  },
});

// Action to sync exercise templates
export const syncExerciseTemplates = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.HEVY_API_KEY;
    if (!apiKey) {
      throw new Error("HEVY_API_KEY not configured");
    }

    const firstPage = await fetchExerciseTemplates(apiKey, 1, 100);
    let allTemplates = [...firstPage.exercise_templates];

    for (let page = 2; page <= firstPage.page_count; page++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const pageData = await fetchExerciseTemplates(apiKey, page, 100);
      allTemplates.push(...pageData.exercise_templates);
    }

    for (const template of allTemplates) {
      await ctx.runMutation(internal.sync.upsertExerciseTemplate, { template });
    }

    return {
      success: true,
      templatesProcessed: allTemplates.length,
    };
  },
});

// ===============================
// ROUTINES (Program Templates)
// ===============================

interface HevyRoutineFolder {
  id: number;
  index: number;
  title: string;
  updated_at: string;
  created_at: string;
}

interface HevyRoutineSet {
  index: number;
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  custom_metric: number | null;
}

interface HevyRoutineExercise {
  index: number;
  title: string;
  notes: string;
  exercise_template_id: string;
  superset_id: number | null;
  rest_seconds: number | null;
  sets: HevyRoutineSet[];
}

interface HevyRoutine {
  id: string;
  title: string;
  folder_id: number | null;
  updated_at: string;
  created_at: string;
  exercises: HevyRoutineExercise[];
}

// Fetch routine folders from Hevy API
async function fetchRoutineFolders(
  apiKey: string,
  page: number = 1,
  pageSize: number = 10 // Max is 10 for routine_folders
): Promise<{ page: number; page_count: number; routine_folders: HevyRoutineFolder[] }> {
  const response = await fetch(
    `${HEVY_API_BASE}/routine_folders?page=${page}&pageSize=${pageSize}`,
    { headers: { "api-key": apiKey } }
  );

  if (response.status === 429) {
    throw new Error("Rate limited by Hevy API");
  }

  if (!response.ok) {
    throw new Error(`Hevy API error: ${response.status}`);
  }

  return response.json();
}

// Fetch routines from Hevy API
async function fetchRoutines(
  apiKey: string,
  page: number = 1,
  pageSize: number = 10
): Promise<{ page: number; page_count: number; routines: HevyRoutine[] }> {
  const response = await fetch(
    `${HEVY_API_BASE}/routines?page=${page}&pageSize=${pageSize}`,
    { headers: { "api-key": apiKey } }
  );

  if (response.status === 429) {
    throw new Error("Rate limited by Hevy API");
  }

  if (!response.ok) {
    throw new Error(`Hevy API error: ${response.status}`);
  }

  return response.json();
}

// Action to sync routine folders from Hevy
export const syncRoutineFolders = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.HEVY_API_KEY;
    if (!apiKey) {
      throw new Error("HEVY_API_KEY not configured");
    }

    const firstPage = await fetchRoutineFolders(apiKey, 1, 10);
    let allFolders = [...firstPage.routine_folders];

    for (let page = 2; page <= firstPage.page_count; page++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const pageData = await fetchRoutineFolders(apiKey, page, 10);
      allFolders.push(...pageData.routine_folders);
    }

    for (const folder of allFolders) {
      await ctx.runMutation(internal.sync.upsertRoutineFolder, { folder });
    }

    return {
      success: true,
      foldersProcessed: allFolders.length,
    };
  },
});

// Action to sync routines from Hevy
export const syncRoutines = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.HEVY_API_KEY;
    if (!apiKey) {
      throw new Error("HEVY_API_KEY not configured");
    }

    // First sync folders (need them for relations)
    await ctx.runAction(internal.hevy.syncRoutineFolders);

    // Fetch all routines
    const firstPage = await fetchRoutines(apiKey, 1, 10);
    let allRoutines = [...firstPage.routines];

    console.log(`Fetching ${firstPage.page_count} pages of routines...`);

    for (let page = 2; page <= firstPage.page_count; page++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const pageData = await fetchRoutines(apiKey, page, 10);
      allRoutines.push(...pageData.routines);
    }

    // Store routines in Convex
    for (const routine of allRoutines) {
      await ctx.runMutation(internal.sync.upsertRoutine, { routine });
    }

    return {
      success: true,
      routinesProcessed: allRoutines.length,
    };
  },
});

// Full routine pipeline: Hevy -> Convex -> Notion
export const fullRoutinePipeline = action({
  args: {
    programsDbId: v.string(),
    routinesDbId: v.string(),
    routineExercisesDbId: v.string(),
    exerciseProgressDbId: v.string(),
  },
  handler: async (ctx, args) => {
    // Import the api here to avoid circular dependency
    const { api } = await import("./_generated/api");

    // Step 1: Sync routines from Hevy to Convex
    const hevyResult = await ctx.runAction(internal.hevy.syncRoutines);

    // Step 2: Calculate exercise progress from workout history
    await ctx.runMutation(api.sync.calculateAllExerciseProgress);

    // Step 3: Sync routines to Notion
    const notionResult = await ctx.runAction(api.notion.syncRoutinesToNotion, {
      programsDbId: args.programsDbId,
      routinesDbId: args.routinesDbId,
      routineExercisesDbId: args.routineExercisesDbId,
    });

    // Step 4: Sync exercise progress to Notion
    const progressResult = await ctx.runAction(api.notion.syncExerciseProgress, {
      exerciseProgressDbId: args.exerciseProgressDbId,
    });

    return {
      hevy: hevyResult,
      notion: notionResult,
      progress: progressResult,
    };
  },
});
