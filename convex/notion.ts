import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Helper to make Notion API requests
async function notionRequest(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: any
) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("NOTION_TOKEN not configured");
  }

  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Database IDs will be stored after creation
interface NotionDatabases {
  workouts: string;
  exercises: string;
  sets: string;
}

// Create the three related databases in Notion
export const createDatabases = action({
  args: {
    parentPageId: v.string(),
  },
  handler: async (ctx, { parentPageId }): Promise<NotionDatabases> => {
    // Create Workouts database
    const workoutsDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Hevy Workouts" } }],
      properties: {
        Workout: { title: {} },
        "Hevy ID": { rich_text: {} },
        Date: { date: {} },
        "Duration (min)": { number: { format: "number" } },
        "Volume (kg)": { number: { format: "number" } },
        "Total Sets": { number: { format: "number" } },
        "Total Reps": { number: { format: "number" } },
        Description: { rich_text: {} },
      },
    });

    // Create Exercises database with relation to Workouts
    const exercisesDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Hevy Exercises" } }],
      properties: {
        Exercise: { title: {} },
        Workout: {
          relation: {
            database_id: workoutsDb.id,
            single_property: {},
          },
        },
        "Exercise Index": { number: { format: "number" } },
        "Template ID": { rich_text: {} },
        Notes: { rich_text: {} },
        "Set Count": { number: { format: "number" } },
        "Total Volume (kg)": { number: { format: "number" } },
      },
    });

    // Create Sets database with relation to Exercises
    const setsDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Hevy Sets" } }],
      properties: {
        Set: { title: {} },
        Exercise: {
          relation: {
            database_id: exercisesDb.id,
            single_property: {},
          },
        },
        "Set Index": { number: { format: "number" } },
        Type: {
          select: {
            options: [
              { name: "warmup", color: "yellow" },
              { name: "normal", color: "blue" },
              { name: "failure", color: "red" },
              { name: "dropset", color: "purple" },
            ],
          },
        },
        "Weight (kg)": { number: { format: "number" } },
        Reps: { number: { format: "number" } },
        RPE: { number: { format: "number" } },
        "Volume (kg)": { number: { format: "number" } },
        "Distance (m)": { number: { format: "number" } },
        "Duration (s)": { number: { format: "number" } },
      },
    });

    return {
      workouts: workoutsDb.id,
      exercises: exercisesDb.id,
      sets: setsDb.id,
    };
  },
});

// Query database for pages matching a filter
async function queryDatabase(databaseId: string, filter: any) {
  return notionRequest(`/databases/${databaseId}/query`, "POST", { filter });
}

// Create a page in a database
async function createPage(databaseId: string, properties: any) {
  return notionRequest("/pages", "POST", {
    parent: { database_id: databaseId },
    properties,
  });
}

// Update a page
async function updatePage(pageId: string, properties: any) {
  return notionRequest(`/pages/${pageId}`, "PATCH", { properties });
}

// Archive a page
async function archivePage(pageId: string) {
  return notionRequest(`/pages/${pageId}`, "PATCH", { archived: true });
}

// Sync unsynced workouts to Notion
export const syncToNotion = action({
  args: {
    workoutsDbId: v.string(),
    exercisesDbId: v.string(),
    setsDbId: v.string(),
  },
  handler: async (ctx, { workoutsDbId, exercisesDbId, setsDbId }) => {
    // Get unsynced workouts from Convex
    const workouts = await ctx.runQuery(api.sync.getUnsyncedWorkouts);

    let syncedCount = 0;
    let errorCount = 0;

    for (const workout of workouts) {
      try {
        // Handle deleted workouts
        if (workout.isDeleted && workout.notionPageId) {
          await archivePage(workout.notionPageId);
          await ctx.runMutation(api.sync.markWorkoutSynced, {
            workoutId: workout._id,
            notionPageId: workout.notionPageId,
          });
          syncedCount++;
          continue;
        }

        // Check if workout already exists in Notion (by Hevy ID)
        let workoutPageId = workout.notionPageId;

        if (!workoutPageId) {
          // Search for existing page
          const searchResult = await queryDatabase(workoutsDbId, {
            property: "Hevy ID",
            rich_text: { equals: workout.hevyId },
          });

          if (searchResult.results && searchResult.results.length > 0) {
            workoutPageId = searchResult.results[0].id;
          }
        }

        // Create or update workout page
        const workoutProps: any = {
          Workout: { title: [{ text: { content: workout.title } }] },
          "Hevy ID": { rich_text: [{ text: { content: workout.hevyId } }] },
          Date: { date: { start: workout.startTime.split("T")[0] } },
          "Duration (min)": { number: workout.durationMinutes || null },
          "Volume (kg)": { number: workout.totalVolume || null },
          "Total Sets": { number: workout.totalSets || null },
          "Total Reps": { number: workout.totalReps || null },
          Description: {
            rich_text: workout.description
              ? [{ text: { content: workout.description } }]
              : [],
          },
        };

        if (workoutPageId) {
          // Update existing page
          await updatePage(workoutPageId, workoutProps);
        } else {
          // Create new page
          const newPage = await createPage(workoutsDbId, workoutProps);
          workoutPageId = newPage.id;
        }

        // Get exercises for this workout
        const exercises = await ctx.runQuery(api.sync.getWorkoutExercises, {
          workoutId: workout._id,
        });

        for (const exercise of exercises) {
          // Get sets for this exercise
          const sets = await ctx.runQuery(api.sync.getExerciseSets, {
            exerciseId: exercise._id,
          });

          // Calculate exercise stats
          let exerciseVolume = 0;
          for (const set of sets) {
            if (set.weightKg && set.reps) {
              exerciseVolume += set.weightKg * set.reps;
            }
          }

          // Create exercise page
          const exerciseProps: any = {
            Exercise: { title: [{ text: { content: exercise.title } }] },
            Workout: { relation: [{ id: workoutPageId }] },
            "Exercise Name": { select: { name: exercise.title } }, // Consistent category for grouping
            "Exercise Index": { number: exercise.hevyExerciseIndex },
            "Template ID": {
              rich_text: [{ text: { content: exercise.exerciseTemplateId } }],
            },
            Notes: {
              rich_text: exercise.notes
                ? [{ text: { content: exercise.notes } }]
                : [],
            },
            "Set Count": { number: sets.length },
            "Total Volume (kg)": {
              number: Math.round(exerciseVolume * 10) / 10,
            },
          };

          const exercisePage = await createPage(exercisesDbId, exerciseProps);

          // Create set pages
          for (const set of sets) {
            const setVolume =
              set.weightKg && set.reps ? set.weightKg * set.reps : null;

            const setTitle = `Set ${set.setIndex + 1}: ${set.weightKg || 0}kg x ${set.reps || 0}`;

            const setProps: any = {
              Set: { title: [{ text: { content: setTitle } }] },
              Exercise: { relation: [{ id: exercisePage.id }] },
              "Set Index": { number: set.setIndex },
              Type: { select: { name: set.setType } },
              "Weight (kg)": { number: set.weightKg || null },
              Reps: { number: set.reps || null },
              RPE: { number: set.rpe || null },
              "Volume (kg)": {
                number: setVolume ? Math.round(setVolume * 10) / 10 : null,
              },
              "Distance (m)": { number: set.distanceMeters || null },
              "Duration (s)": { number: set.durationSeconds || null },
            };

            await createPage(setsDbId, setProps);
          }
        }

        // Mark workout as synced
        await ctx.runMutation(api.sync.markWorkoutSynced, {
          workoutId: workout._id,
          notionPageId: workoutPageId,
        });

        syncedCount++;
        console.log(`Synced workout: ${workout.title}`);

        // Rate limit: wait between workouts
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`Error syncing workout ${workout.hevyId}:`, error.message);
        errorCount++;
      }
    }

    return {
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: workouts.length,
    };
  },
});

// Full pipeline: Hevy -> Convex -> Notion
export const fullPipeline = action({
  args: {
    workoutsDbId: v.string(),
    exercisesDbId: v.string(),
    setsDbId: v.string(),
  },
  handler: async (ctx, args) => {
    // Step 1: Sync from Hevy to Convex
    const hevyResult = await ctx.runAction(api.hevy.incrementalSync);

    // Step 2: Sync from Convex to Notion
    const notionResult = await ctx.runAction(api.notion.syncToNotion, args);

    return {
      hevy: hevyResult,
      notion: notionResult,
    };
  },
});

// Database IDs for routine system
interface RoutineNotionDatabases {
  programs: string; // Routine folders
  routines: string; // Individual routines
  routineExercises: string; // Exercises within routines
  exerciseProgress: string; // Progression tracking
}

// Create routine-related databases in Notion
export const createRoutineDatabases = action({
  args: {
    parentPageId: v.string(),
    exercisesDbId: v.string(), // Link to existing exercises DB for shared "Exercise Name" select
  },
  handler: async (ctx, { parentPageId, exercisesDbId }): Promise<RoutineNotionDatabases> => {
    // Create Programs database (routine folders)
    const programsDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Hevy Programs" } }],
      properties: {
        Program: { title: {} },
        "Hevy Folder ID": { number: { format: "number" } },
        "Week Number": { number: { format: "number" } }, // For sorting: Week 1, Week 2, etc.
        "Sort Order": { number: { format: "number" } }, // For precise sorting
        Description: { rich_text: {} },
        "Routine Count": { number: { format: "number" } },
      },
    });

    // Create Routines database (workout templates)
    const routinesDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Hevy Routines" } }],
      properties: {
        Routine: { title: {} },
        "Hevy ID": { rich_text: {} },
        Program: {
          relation: {
            database_id: programsDb.id,
            single_property: {},
          },
        },
        // Sorting fields for week-by-week, day-by-day views
        "Week Number": { number: { format: "number" } },
        "Day Number": { number: { format: "number" } },
        "Sort Order": { number: { format: "number" } }, // week*100 + day for precise sorting
        "Exercise Count": { number: { format: "number" } },
        "Total Sets": { number: { format: "number" } },
        "Day Type": {
          select: {
            options: [
              { name: "Squat", color: "blue" },
              { name: "Bench", color: "red" },
              { name: "Deadlift", color: "purple" },
              { name: "Press", color: "green" },
              { name: "Upper", color: "orange" },
              { name: "Lower", color: "yellow" },
              { name: "Pull", color: "pink" },
              { name: "Push", color: "brown" },
              { name: "Full Body", color: "gray" },
            ],
          },
        },
        Notes: { rich_text: {} },
      },
    });

    // Create Routine Exercises database (template exercises)
    const routineExercisesDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Hevy Routine Exercises" } }],
      properties: {
        Exercise: { title: {} },
        Routine: {
          relation: {
            database_id: routinesDb.id,
            single_property: {},
          },
        },
        "Exercise Name": {
          select: {
            options: [], // Will be populated with same options as workout exercises
          },
        },
        "Template ID": { rich_text: {} },
        // Sorting fields for global exercise ordering
        "Week Number": { number: { format: "number" } },
        "Day Number": { number: { format: "number" } },
        "Exercise Order": { number: { format: "number" } },
        "Global Sort": { number: { format: "number" } }, // week*10000 + day*100 + exerciseOrder
        // Exercise categorization
        "Exercise Role": {
          select: {
            options: [
              { name: "Main Lift", color: "red" },
              { name: "Variation", color: "blue" },
              { name: "Accessory", color: "green" },
              { name: "Cardio", color: "yellow" },
            ],
          },
        },
        "Muscle Group": {
          select: {
            options: [
              { name: "Chest", color: "red" },
              { name: "Back", color: "blue" },
              { name: "Shoulders", color: "orange" },
              { name: "Legs", color: "green" },
              { name: "Biceps", color: "purple" },
              { name: "Triceps", color: "pink" },
              { name: "Core", color: "gray" },
            ],
          },
        },
        "Target Sets": { number: { format: "number" } },
        "Target Reps": { number: { format: "number" } },
        "Target Weight (kg)": { number: { format: "number" } },
        "Rest (s)": { number: { format: "number" } },
        Notes: { rich_text: {} },
        // Progression data (filled from history)
        "Last Weight (kg)": { number: { format: "number" } },
        "Last Reps": { number: { format: "number" } },
        "Suggested Weight (kg)": { number: { format: "number" } },
        "PR Weight (kg)": { number: { format: "number" } },
      },
    });

    // Create Exercise Progress database (aggregated stats per exercise)
    const exerciseProgressDb = await notionRequest("/databases", "POST", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Exercise Progress" } }],
      properties: {
        "Exercise Name": { title: {} },
        "Template ID": { rich_text: {} },
        // Performance stats
        "Last Performed": { date: {} },
        "Last Weight (kg)": { number: { format: "number" } },
        "Last Reps": { number: { format: "number" } },
        "Last Volume (kg)": { number: { format: "number" } },
        // Personal records
        "PR Weight (kg)": { number: { format: "number" } },
        "PR Reps": { number: { format: "number" } },
        "PR Volume (kg)": { number: { format: "number" } },
        "Est 1RM (kg)": { number: { format: "number" } },
        // Progression
        "Suggested Weight (kg)": { number: { format: "number" } },
        "Progression Note": { rich_text: {} },
        // Workout count
        "Times Performed": { number: { format: "number" } },
        // Muscle groups
        "Primary Muscle": {
          select: {
            options: [
              { name: "Chest", color: "red" },
              { name: "Back", color: "blue" },
              { name: "Shoulders", color: "orange" },
              { name: "Biceps", color: "purple" },
              { name: "Triceps", color: "pink" },
              { name: "Quadriceps", color: "green" },
              { name: "Hamstrings", color: "yellow" },
              { name: "Glutes", color: "brown" },
              { name: "Core", color: "gray" },
              { name: "Calves", color: "default" },
            ],
          },
        },
      },
    });

    return {
      programs: programsDb.id,
      routines: routinesDb.id,
      routineExercises: routineExercisesDb.id,
      exerciseProgress: exerciseProgressDb.id,
    };
  },
});

// Helper to batch process with concurrency limit
async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<{ results: R[]; errors: number }> {
  const results: R[] = [];
  let errors = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processor));

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("Batch error:", result.reason);
        errors++;
      }
    }
  }

  return { results, errors };
}

// Sync routines to Notion (batched for speed)
export const syncRoutinesToNotion = action({
  args: {
    programsDbId: v.string(),
    routinesDbId: v.string(),
    routineExercisesDbId: v.string(),
  },
  handler: async (ctx, { programsDbId, routinesDbId, routineExercisesDbId }) => {
    const folders = await ctx.runQuery(api.sync.getUnsyncedRoutineFolders);

    let syncedFolders = 0;
    let syncedRoutines = 0;
    let syncedExercises = 0;
    let errorCount = 0;

    // Step 1: Create all folders in parallel (batches of 5)
    const folderResults = await batchProcess(folders, async (folder) => {
      const routines = await ctx.runQuery(api.sync.getRoutinesByFolder, {
        folderId: folder._id,
      });

      const folderProps: any = {
        Program: { title: [{ text: { content: folder.title } }] },
        "Hevy Folder ID": { number: folder.hevyId },
        "Week Number": { number: folder.weekNumber || folder.index },
        "Sort Order": { number: folder.sortOrder },
        "Routine Count": { number: routines.length },
      };

      const newPage = await createPage(programsDbId, folderProps);

      await ctx.runMutation(api.sync.markRoutineFolderSynced, {
        folderId: folder._id,
        notionPageId: newPage.id,
      });

      return { folder, pageId: newPage.id, routines };
    }, 5);

    syncedFolders = folderResults.results.length;
    errorCount += folderResults.errors;

    // Step 2: Create all routines in parallel (batches of 10)
    const allRoutineData: Array<{
      routine: any;
      folderPageId: string;
      exercises: any[];
    }> = [];

    for (const { folder, pageId, routines } of folderResults.results) {
      for (const routine of routines) {
        const exercises = await ctx.runQuery(api.sync.getRoutineExercises, {
          routineId: routine._id,
        });
        allRoutineData.push({ routine, folderPageId: pageId, exercises });
      }
    }

    const routineResults = await batchProcess(allRoutineData, async ({ routine, folderPageId, exercises }) => {
      let totalSets = 0;
      for (const ex of exercises) {
        totalSets += ex.targetSets;
      }

      const routineProps: any = {
        Routine: { title: [{ text: { content: routine.title } }] },
        "Hevy ID": { rich_text: [{ text: { content: routine.hevyId } }] },
        Program: { relation: [{ id: folderPageId }] },
        // Sorting fields for week-by-week, day-by-day views
        "Week Number": { number: routine.weekNumber || null },
        "Day Number": { number: routine.dayNumber || null },
        "Sort Order": { number: routine.sortOrder },
        "Exercise Count": { number: exercises.length },
        "Total Sets": { number: totalSets },
      };

      // Use dayType from Convex (already parsed)
      if (routine.dayType) {
        routineProps["Day Type"] = { select: { name: routine.dayType } };
      }

      const newPage = await createPage(routinesDbId, routineProps);

      await ctx.runMutation(api.sync.markRoutineSynced, {
        routineId: routine._id,
        notionPageId: newPage.id,
      });

      return { routine, pageId: newPage.id, exercises };
    }, 10);

    syncedRoutines = routineResults.results.length;
    errorCount += routineResults.errors;

    // Step 3: Create all exercises in parallel (batches of 20)
    const allExerciseData: Array<{
      exercise: any;
      routinePageId: string;
    }> = [];

    for (const { pageId, exercises } of routineResults.results) {
      for (const exercise of exercises) {
        allExerciseData.push({ exercise, routinePageId: pageId });
      }
    }

    const exerciseResults = await batchProcess(allExerciseData, async ({ exercise, routinePageId }) => {
      const progress = await ctx.runQuery(api.sync.getExerciseProgress, {
        exerciseTemplateId: exercise.exerciseTemplateId,
      });

      const exerciseProps: any = {
        Exercise: { title: [{ text: { content: exercise.title } }] },
        Routine: { relation: [{ id: routinePageId }] },
        "Exercise Name": { select: { name: exercise.title } },
        "Template ID": {
          rich_text: [{ text: { content: exercise.exerciseTemplateId } }],
        },
        // Sorting fields for global exercise ordering
        "Week Number": { number: exercise.weekNumber || null },
        "Day Number": { number: exercise.dayNumber || null },
        "Exercise Order": { number: exercise.exerciseOrder },
        "Global Sort": { number: exercise.globalSortOrder },
        "Target Sets": { number: exercise.targetSets },
        "Target Reps": { number: exercise.targetReps || null },
        "Target Weight (kg)": { number: exercise.targetWeightKg || null },
        "Rest (s)": { number: exercise.restSeconds || null },
        Notes: {
          rich_text: exercise.notes
            ? [{ text: { content: exercise.notes.substring(0, 2000) } }]
            : [],
        },
      };

      // Add exercise categorization
      if (exercise.exerciseRole) {
        exerciseProps["Exercise Role"] = { select: { name: exercise.exerciseRole } };
      }
      if (exercise.muscleGroup) {
        exerciseProps["Muscle Group"] = { select: { name: exercise.muscleGroup } };
      }

      // Add progression data
      if (progress) {
        exerciseProps["Last Weight (kg)"] = { number: progress.lastWeightKg || null };
        exerciseProps["Last Reps"] = { number: progress.lastReps || null };
        exerciseProps["Suggested Weight (kg)"] = { number: progress.suggestedWeightKg || null };
        exerciseProps["PR Weight (kg)"] = { number: progress.maxWeightKg || null };
      }

      const exercisePage = await createPage(routineExercisesDbId, exerciseProps);

      await ctx.runMutation(api.sync.markRoutineExerciseSynced, {
        exerciseId: exercise._id,
        notionPageId: exercisePage.id,
      });

      return exercisePage.id;
    }, 20);

    syncedExercises = exerciseResults.results.length;
    errorCount += exerciseResults.errors;

    return {
      success: true,
      syncedFolders,
      syncedRoutines,
      syncedExercises,
      errors: errorCount,
    };
  },
});

// Sync exercise progress stats to Notion (batched)
export const syncExerciseProgress = action({
  args: {
    exerciseProgressDbId: v.string(),
  },
  handler: async (ctx, { exerciseProgressDbId }) => {
    // Calculate and update progress for all exercises
    await ctx.runMutation(api.sync.calculateAllExerciseProgress);

    // Get all progress records
    const progressRecords = await ctx.runQuery(api.sync.getAllExerciseProgress);

    const results = await batchProcess(progressRecords, async (progress) => {
      const props: any = {
        "Exercise Name": {
          title: [{ text: { content: progress.exerciseTitle } }],
        },
        "Template ID": {
          rich_text: [{ text: { content: progress.exerciseTemplateId } }],
        },
        "Last Weight (kg)": { number: progress.lastWeightKg || null },
        "Last Reps": { number: progress.lastReps || null },
        "Last Volume (kg)": { number: progress.lastVolume || null },
        "PR Weight (kg)": { number: progress.maxWeightKg || null },
        "PR Reps": { number: progress.maxReps || null },
        "PR Volume (kg)": { number: progress.maxVolume || null },
        "Est 1RM (kg)": { number: progress.max1RM || null },
        "Suggested Weight (kg)": { number: progress.suggestedWeightKg || null },
        "Progression Note": {
          rich_text: progress.progressionNote
            ? [{ text: { content: progress.progressionNote } }]
            : [],
        },
      };

      if (progress.lastPerformedAt) {
        props["Last Performed"] = {
          date: { start: progress.lastPerformedAt.split("T")[0] },
        };
      }

      const newPage = await createPage(exerciseProgressDbId, props);

      await ctx.runMutation(api.sync.markExerciseProgressSynced, {
        progressId: progress._id,
        notionPageId: newPage.id,
      });

      return newPage.id;
    }, 15); // 15 concurrent requests

    return {
      success: true,
      synced: results.results.length,
      errors: results.errors,
    };
  },
});

// Update existing Notion databases with new sorting properties
export const addSortingProperties = action({
  args: {
    programsDbId: v.string(),
    routinesDbId: v.string(),
    routineExercisesDbId: v.string(),
  },
  handler: async (ctx, { programsDbId, routinesDbId, routineExercisesDbId }) => {
    const results: string[] = [];

    // Add properties to Programs database
    try {
      await notionRequest(`/databases/${programsDbId}`, "PATCH", {
        properties: {
          "Week Number": { number: { format: "number" } },
          "Sort Order": { number: { format: "number" } },
        },
      });
      results.push("Added Week Number, Sort Order to Programs");
    } catch (e: any) {
      results.push(`Programs update error: ${e.message}`);
    }

    // Add properties to Routines database
    try {
      await notionRequest(`/databases/${routinesDbId}`, "PATCH", {
        properties: {
          "Week Number": { number: { format: "number" } },
          "Day Number": { number: { format: "number" } },
          "Sort Order": { number: { format: "number" } },
        },
      });
      results.push("Added Week Number, Day Number, Sort Order to Routines");
    } catch (e: any) {
      results.push(`Routines update error: ${e.message}`);
    }

    // Add properties to Routine Exercises database
    try {
      await notionRequest(`/databases/${routineExercisesDbId}`, "PATCH", {
        properties: {
          "Week Number": { number: { format: "number" } },
          "Day Number": { number: { format: "number" } },
          "Exercise Order": { number: { format: "number" } },
          "Global Sort": { number: { format: "number" } },
          "Exercise Role": {
            select: {
              options: [
                { name: "Main Lift", color: "red" },
                { name: "Variation", color: "blue" },
                { name: "Accessory", color: "green" },
                { name: "Cardio", color: "yellow" },
              ],
            },
          },
          "Muscle Group": {
            select: {
              options: [
                { name: "Chest", color: "red" },
                { name: "Back", color: "blue" },
                { name: "Shoulders", color: "orange" },
                { name: "Legs", color: "green" },
                { name: "Biceps", color: "purple" },
                { name: "Triceps", color: "pink" },
                { name: "Core", color: "gray" },
              ],
            },
          },
        },
      });
      results.push("Added sorting and categorization properties to Routine Exercises");
    } catch (e: any) {
      results.push(`Routine Exercises update error: ${e.message}`);
    }

    return { success: true, results };
  },
});

// Update existing Notion pages with new sorting values
export const updateExistingWithSorting = action({
  args: {
    programsDbId: v.string(),
    routinesDbId: v.string(),
    routineExercisesDbId: v.string(),
  },
  handler: async (ctx, { programsDbId, routinesDbId, routineExercisesDbId }) => {
    let updatedFolders = 0;
    let updatedRoutines = 0;
    let updatedExercises = 0;
    let errors = 0;

    // Update Program pages with sorting values
    const folders = await ctx.runQuery(api.sync.getAllRoutineFolders);
    const folderResults = await batchProcess(folders.filter((f: any) => f.notionPageId), async (folder: any) => {
      await updatePage(folder.notionPageId, {
        "Week Number": { number: folder.weekNumber || folder.index },
        "Sort Order": { number: folder.sortOrder || folder.index },
      });
      return folder._id;
    }, 10);
    updatedFolders = folderResults.results.length;
    errors += folderResults.errors;

    // Update Routine pages with sorting values
    const allRoutines: any[] = [];
    for (const folder of folders) {
      const routines = await ctx.runQuery(api.sync.getRoutinesByFolder, { folderId: folder._id });
      allRoutines.push(...routines);
    }
    const routineResults = await batchProcess(allRoutines.filter((r: any) => r.notionPageId), async (routine: any) => {
      await updatePage(routine.notionPageId, {
        "Week Number": { number: routine.weekNumber || null },
        "Day Number": { number: routine.dayNumber || null },
        "Sort Order": { number: routine.sortOrder || 0 },
      });
      return routine._id;
    }, 10);
    updatedRoutines = routineResults.results.length;
    errors += routineResults.errors;

    // Update Routine Exercise pages with sorting values
    const allExercises: any[] = [];
    for (const routine of allRoutines) {
      const exercises = await ctx.runQuery(api.sync.getRoutineExercises, { routineId: routine._id });
      allExercises.push(...exercises);
    }
    const exerciseResults = await batchProcess(allExercises.filter((e: any) => e.notionPageId), async (exercise: any) => {
      const props: any = {
        "Week Number": { number: exercise.weekNumber || null },
        "Day Number": { number: exercise.dayNumber || null },
        "Exercise Order": { number: exercise.exerciseOrder || exercise.index },
        "Global Sort": { number: exercise.globalSortOrder || 0 },
      };
      if (exercise.exerciseRole) {
        props["Exercise Role"] = { select: { name: exercise.exerciseRole } };
      }
      if (exercise.muscleGroup) {
        props["Muscle Group"] = { select: { name: exercise.muscleGroup } };
      }
      await updatePage(exercise.notionPageId, props);
      return exercise._id;
    }, 20);
    updatedExercises = exerciseResults.results.length;
    errors += exerciseResults.errors;

    return {
      success: true,
      updatedFolders,
      updatedRoutines,
      updatedExercises,
      errors,
    };
  },
});

// Backfill Exercise Name select property for all existing exercises
export const backfillExerciseNames = action({
  args: {
    exercisesDbId: v.string(),
  },
  handler: async (ctx, { exercisesDbId }) => {
    // Query all exercises from Notion
    let hasMore = true;
    let startCursor: string | undefined;
    let updatedCount = 0;
    let errorCount = 0;

    while (hasMore) {
      const queryBody: any = {};
      if (startCursor) {
        queryBody.start_cursor = startCursor;
      }

      const response = await notionRequest(
        `/databases/${exercisesDbId}/query`,
        "POST",
        queryBody
      );

      for (const page of response.results) {
        try {
          // Get the exercise title from the page
          const titleProp = page.properties?.Exercise?.title;
          if (!titleProp || titleProp.length === 0) continue;

          const exerciseTitle = titleProp[0]?.plain_text;
          if (!exerciseTitle) continue;

          // Check if Exercise Name is already set
          const existingName = page.properties?.["Exercise Name"]?.select?.name;
          if (existingName) continue; // Already has a name

          // Update the page with the Exercise Name select
          await updatePage(page.id, {
            "Exercise Name": { select: { name: exerciseTitle } },
          });

          updatedCount++;
          console.log(`Updated: ${exerciseTitle}`);

          // Rate limit
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error: any) {
          console.error(`Error updating page ${page.id}:`, error.message);
          errorCount++;
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }

    return {
      success: true,
      updated: updatedCount,
      errors: errorCount,
    };
  },
});
