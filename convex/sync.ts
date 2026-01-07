import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Get current sync state
export const getSyncState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("syncState").first();
    return state;
  },
});

// Public query for sync status
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("syncState").first();
    const workoutCount = await ctx.db.query("workouts").collect();
    const exerciseCount = await ctx.db.query("exercises").collect();
    const setCount = await ctx.db.query("sets").collect();

    return {
      lastSyncedAt: state?.lastSyncedAt,
      lastEventTimestamp: state?.lastEventTimestamp,
      lastError: state?.lastError,
      syncInProgress: state?.syncInProgress || false,
      counts: {
        workouts: workoutCount.length,
        exercises: exerciseCount.length,
        sets: setCount.length,
      },
    };
  },
});

// Update sync state
export const updateSyncState = internalMutation({
  args: {
    lastSyncedAt: v.optional(v.string()),
    lastEventTimestamp: v.optional(v.string()),
    lastError: v.optional(v.string()),
    syncInProgress: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("syncState").first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.lastSyncedAt && { lastSyncedAt: args.lastSyncedAt }),
        ...(args.lastEventTimestamp && { lastEventTimestamp: args.lastEventTimestamp }),
        ...(args.lastError !== undefined && { lastError: args.lastError }),
        ...(args.syncInProgress !== undefined && { syncInProgress: args.syncInProgress }),
      });
    } else {
      await ctx.db.insert("syncState", {
        lastSyncedAt: args.lastSyncedAt,
        lastEventTimestamp: args.lastEventTimestamp,
        lastError: args.lastError,
        syncInProgress: args.syncInProgress || false,
      });
    }
  },
});

// Upsert a workout and its exercises/sets
export const upsertWorkout = internalMutation({
  args: {
    workout: v.any(), // HevyWorkout type
  },
  handler: async (ctx, { workout }) => {
    // Check if workout exists
    const existing = await ctx.db
      .query("workouts")
      .withIndex("by_hevy_id", (q) => q.eq("hevyId", workout.id))
      .first();

    // Calculate stats
    let totalVolume = 0;
    let totalSets = 0;
    let totalReps = 0;

    for (const exercise of workout.exercises || []) {
      for (const set of exercise.sets || []) {
        totalSets++;
        if (set.reps) {
          totalReps += set.reps;
          if (set.weight_kg) {
            totalVolume += set.weight_kg * set.reps;
          }
        }
      }
    }

    // Calculate duration
    let durationMinutes: number | undefined;
    if (workout.start_time && workout.end_time) {
      const start = new Date(workout.start_time).getTime();
      const end = new Date(workout.end_time).getTime();
      durationMinutes = Math.round((end - start) / 60000);
    }

    let workoutId: any;

    if (existing) {
      // Update existing workout
      await ctx.db.patch(existing._id, {
        title: workout.title,
        description: workout.description || undefined,
        startTime: workout.start_time,
        endTime: workout.end_time || undefined,
        durationMinutes,
        totalVolume: Math.round(totalVolume * 10) / 10,
        totalSets,
        totalReps,
        syncedToNotion: false, // Mark for re-sync
        isDeleted: false,
      });
      workoutId = existing._id;

      // Delete existing exercises and sets for this workout
      const existingExercises = await ctx.db
        .query("exercises")
        .withIndex("by_workout", (q) => q.eq("workoutId", existing._id))
        .collect();

      for (const ex of existingExercises) {
        // Delete sets for this exercise
        const existingSets = await ctx.db
          .query("sets")
          .withIndex("by_exercise", (q) => q.eq("exerciseId", ex._id))
          .collect();
        for (const set of existingSets) {
          await ctx.db.delete(set._id);
        }
        await ctx.db.delete(ex._id);
      }
    } else {
      // Insert new workout
      workoutId = await ctx.db.insert("workouts", {
        hevyId: workout.id,
        title: workout.title,
        description: workout.description || undefined,
        startTime: workout.start_time,
        endTime: workout.end_time || undefined,
        durationMinutes,
        totalVolume: Math.round(totalVolume * 10) / 10,
        totalSets,
        totalReps,
        syncedToNotion: false,
        isDeleted: false,
      });
    }

    // Insert exercises and sets
    for (const exercise of workout.exercises || []) {
      const exerciseId = await ctx.db.insert("exercises", {
        workoutId,
        hevyExerciseIndex: exercise.index,
        exerciseTemplateId: exercise.exercise_template_id,
        title: exercise.title,
        notes: exercise.notes || undefined,
        supersetId: exercise.superset_id || undefined,
        syncedToNotion: false,
      });

      // Insert sets
      for (const set of exercise.sets || []) {
        await ctx.db.insert("sets", {
          exerciseId,
          workoutId,
          setIndex: set.index,
          setType: set.type,
          weightKg: set.weight_kg || undefined,
          reps: set.reps || undefined,
          distanceMeters: set.distance_meters || undefined,
          durationSeconds: set.duration_seconds || undefined,
          rpe: set.rpe || undefined,
          customMetric: set.custom_metric || undefined,
          syncedToNotion: false,
        });
      }
    }

    return workoutId;
  },
});

// Mark a workout as deleted
export const markWorkoutDeleted = internalMutation({
  args: {
    hevyId: v.string(),
  },
  handler: async (ctx, { hevyId }) => {
    const existing = await ctx.db
      .query("workouts")
      .withIndex("by_hevy_id", (q) => q.eq("hevyId", hevyId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isDeleted: true,
        syncedToNotion: false, // Mark for re-sync to archive in Notion
      });
    }
  },
});

// Upsert exercise template
export const upsertExerciseTemplate = internalMutation({
  args: {
    template: v.any(),
  },
  handler: async (ctx, { template }) => {
    const existing = await ctx.db
      .query("exerciseTemplates")
      .withIndex("by_hevy_id", (q) => q.eq("hevyId", template.id))
      .first();

    const data = {
      hevyId: template.id,
      title: template.title,
      exerciseType: template.type,
      primaryMuscleGroup: template.primary_muscle_group,
      secondaryMuscleGroups: template.secondary_muscle_groups,
      isCustom: template.is_custom,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("exerciseTemplates", data);
    }
  },
});

// Get workouts that need to be synced to Notion
export const getUnsyncedWorkouts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("workouts")
      .withIndex("by_synced", (q) => q.eq("syncedToNotion", false))
      .collect();
  },
});

// Get exercises for a workout
export const getWorkoutExercises = query({
  args: { workoutId: v.id("workouts") },
  handler: async (ctx, { workoutId }) => {
    return await ctx.db
      .query("exercises")
      .withIndex("by_workout", (q) => q.eq("workoutId", workoutId))
      .collect();
  },
});

// Get sets for an exercise
export const getExerciseSets = query({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    return await ctx.db
      .query("sets")
      .withIndex("by_exercise", (q) => q.eq("exerciseId", exerciseId))
      .collect();
  },
});

// Mark workout as synced to Notion
export const markWorkoutSynced = mutation({
  args: {
    workoutId: v.id("workouts"),
    notionPageId: v.string(),
  },
  handler: async (ctx, { workoutId, notionPageId }) => {
    await ctx.db.patch(workoutId, {
      syncedToNotion: true,
      notionPageId,
    });
  },
});

// Get all workouts with their exercises and sets (for display)
export const getAllWorkoutsWithDetails = query({
  args: {},
  handler: async (ctx) => {
    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_start_time")
      .order("desc")
      .collect();

    const result = [];
    for (const workout of workouts) {
      const exercises = await ctx.db
        .query("exercises")
        .withIndex("by_workout", (q) => q.eq("workoutId", workout._id))
        .collect();

      const exercisesWithSets = [];
      for (const exercise of exercises) {
        const sets = await ctx.db
          .query("sets")
          .withIndex("by_exercise", (q) => q.eq("exerciseId", exercise._id))
          .collect();
        exercisesWithSets.push({ ...exercise, sets });
      }

      result.push({ ...workout, exercises: exercisesWithSets });
    }

    return result;
  },
});

// ===============================
// ROUTINES (Program Templates)
// ===============================

// Helper: Parse week number from folder title (e.g., "SBS Week 1" → 1)
function parseWeekNumber(title: string): number | undefined {
  // Match patterns like "Week 1", "Week 2", "W1", "W2", "week 1"
  const weekMatch = title.match(/(?:week|w)\s*(\d+)/i);
  if (weekMatch) {
    return parseInt(weekMatch[1], 10);
  }
  return undefined;
}

// Helper: Parse day number from routine title (e.g., "Day 1 - Squat" → 1)
function parseDayNumber(title: string): number | undefined {
  // Match patterns like "Day 1", "D1", "day 1", "#1"
  const dayMatch = title.match(/(?:day|d|#)\s*(\d+)/i);
  if (dayMatch) {
    return parseInt(dayMatch[1], 10);
  }
  return undefined;
}

// Helper: Detect day type from routine title
function detectDayType(title: string): string | undefined {
  const titleLower = title.toLowerCase();
  if (titleLower.includes("squat")) return "Squat";
  if (titleLower.includes("bench")) return "Bench";
  if (titleLower.includes("deadlift")) return "Deadlift";
  if (titleLower.includes("press") && !titleLower.includes("bench")) return "Press";
  if (titleLower.includes("upper")) return "Upper";
  if (titleLower.includes("lower")) return "Lower";
  if (titleLower.includes("pull")) return "Pull";
  if (titleLower.includes("push")) return "Push";
  return undefined;
}

// Helper: Detect exercise role from exercise index and title
function detectExerciseRole(index: number, title: string): string {
  const titleLower = title.toLowerCase();

  // First exercise is usually the main lift
  if (index === 0) return "Main Lift";

  // Common accessory indicators
  if (titleLower.includes("curl") ||
      titleLower.includes("extension") ||
      titleLower.includes("raise") ||
      titleLower.includes("fly") ||
      titleLower.includes("kickback") ||
      titleLower.includes("calf") ||
      titleLower.includes("ab ") ||
      titleLower.includes("crunch") ||
      titleLower.includes("plank")) {
    return "Accessory";
  }

  // Compound variations are usually second
  if (index === 1 || index === 2) return "Variation";

  return "Accessory";
}

// Helper: Detect muscle group from exercise title
function detectMuscleGroup(title: string): string | undefined {
  const titleLower = title.toLowerCase();

  // Chest exercises
  if (titleLower.includes("bench") ||
      titleLower.includes("chest") ||
      titleLower.includes("fly") ||
      titleLower.includes("pec")) {
    return "Chest";
  }

  // Back exercises
  if (titleLower.includes("row") ||
      titleLower.includes("pull") ||
      titleLower.includes("lat") ||
      titleLower.includes("back") ||
      titleLower.includes("deadlift")) {
    return "Back";
  }

  // Shoulder exercises
  if (titleLower.includes("shoulder") ||
      titleLower.includes("press") ||
      titleLower.includes("raise") ||
      titleLower.includes("delt")) {
    return "Shoulders";
  }

  // Leg exercises
  if (titleLower.includes("squat") ||
      titleLower.includes("leg") ||
      titleLower.includes("quad") ||
      titleLower.includes("ham") ||
      titleLower.includes("glute") ||
      titleLower.includes("lunge") ||
      titleLower.includes("calf")) {
    return "Legs";
  }

  // Arm exercises
  if (titleLower.includes("curl") || titleLower.includes("bicep")) {
    return "Biceps";
  }
  if (titleLower.includes("tricep") ||
      titleLower.includes("pushdown") ||
      titleLower.includes("extension")) {
    return "Triceps";
  }

  // Core exercises
  if (titleLower.includes("ab") ||
      titleLower.includes("core") ||
      titleLower.includes("crunch") ||
      titleLower.includes("plank")) {
    return "Core";
  }

  return undefined;
}

// Upsert routine folder
export const upsertRoutineFolder = internalMutation({
  args: {
    folder: v.any(),
  },
  handler: async (ctx, { folder }) => {
    const existing = await ctx.db
      .query("routineFolders")
      .withIndex("by_hevy_id", (q) => q.eq("hevyId", folder.id))
      .first();

    // Parse week number from title
    const weekNumber = parseWeekNumber(folder.title);
    // Calculate sort order: weekNumber * 100 + index (so week 1 = 100-199, week 2 = 200-299, etc.)
    const sortOrder = (weekNumber || 0) * 100 + folder.index;

    const data = {
      hevyId: folder.id,
      title: folder.title,
      index: folder.index,
      weekNumber,
      sortOrder,
      updatedAt: folder.updated_at,
      syncedToNotion: false,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("routineFolders", data);
    }
  },
});

// Upsert routine and its exercises/sets
export const upsertRoutine = internalMutation({
  args: {
    routine: v.any(),
  },
  handler: async (ctx, { routine }) => {
    // Look up the folder and get its week number
    let folderId = null;
    let folderWeekNumber: number | undefined;
    if (routine.folder_id) {
      const folder = await ctx.db
        .query("routineFolders")
        .withIndex("by_hevy_id", (q) => q.eq("hevyId", routine.folder_id))
        .first();
      folderId = folder?._id;
      folderWeekNumber = folder?.weekNumber;
    }

    // Parse sorting fields from routine title
    const dayNumber = parseDayNumber(routine.title);
    const dayType = detectDayType(routine.title);
    // Calculate sort order: week * 100 + day (so Week 1 Day 1 = 101, Week 1 Day 4 = 104, Week 2 Day 1 = 201)
    const sortOrder = (folderWeekNumber || 0) * 100 + (dayNumber || 0);

    const existing = await ctx.db
      .query("routines")
      .withIndex("by_hevy_id", (q) => q.eq("hevyId", routine.id))
      .first();

    let routineId: any;

    const routineData = {
      hevyId: routine.id,
      folderId: folderId || undefined,
      hevyFolderId: routine.folder_id || undefined,
      title: routine.title,
      dayNumber,
      weekNumber: folderWeekNumber,
      sortOrder,
      dayType,
      updatedAt: routine.updated_at,
      syncedToNotion: false,
    };

    if (existing) {
      await ctx.db.patch(existing._id, routineData);
      routineId = existing._id;

      // Delete existing exercises and sets
      const existingExercises = await ctx.db
        .query("routineExercises")
        .withIndex("by_routine", (q) => q.eq("routineId", existing._id))
        .collect();

      for (const ex of existingExercises) {
        const existingSets = await ctx.db
          .query("routineSets")
          .withIndex("by_routine_exercise", (q) => q.eq("routineExerciseId", ex._id))
          .collect();
        for (const set of existingSets) {
          await ctx.db.delete(set._id);
        }
        await ctx.db.delete(ex._id);
      }
    } else {
      routineId = await ctx.db.insert("routines", routineData);
    }

    // Insert exercises and sets with denormalized sorting fields
    for (const exercise of routine.exercises || []) {
      // Get first set's reps as target
      const targetReps = exercise.sets?.[0]?.reps || undefined;
      const exerciseOrder = exercise.index;
      // Global sort: week*10000 + day*100 + exerciseOrder
      const globalSortOrder = (folderWeekNumber || 0) * 10000 + (dayNumber || 0) * 100 + exerciseOrder;

      // Detect exercise categorization
      const exerciseRole = detectExerciseRole(exercise.index, exercise.title);
      const muscleGroup = detectMuscleGroup(exercise.title);

      const exerciseId = await ctx.db.insert("routineExercises", {
        routineId,
        index: exercise.index,
        exerciseTemplateId: exercise.exercise_template_id,
        title: exercise.title,
        notes: exercise.notes || undefined,
        supersetId: exercise.superset_id || undefined,
        restSeconds: exercise.rest_seconds || undefined,
        targetSets: (exercise.sets || []).length,
        targetReps,
        targetWeightKg: undefined, // Routines don't have pre-set weights
        // Denormalized sorting fields
        weekNumber: folderWeekNumber,
        dayNumber,
        exerciseOrder,
        globalSortOrder,
        exerciseRole,
        muscleGroup,
        syncedToNotion: false,
      });

      // Insert sets
      for (const set of exercise.sets || []) {
        await ctx.db.insert("routineSets", {
          routineExerciseId: exerciseId,
          routineId,
          index: set.index,
          setType: set.type,
          targetReps: set.reps || undefined,
          targetWeightKg: set.weight_kg || undefined,
          targetDistanceMeters: set.distance_meters || undefined,
          targetDurationSeconds: set.duration_seconds || undefined,
          syncedToNotion: false,
        });
      }
    }

    return routineId;
  },
});

// Get unsynced routine folders
export const getUnsyncedRoutineFolders = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("routineFolders")
      .filter((q) => q.eq(q.field("syncedToNotion"), false))
      .collect();
  },
});

// Get all routine folders
export const getAllRoutineFolders = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("routineFolders").collect();
  },
});

// Get routines by folder
export const getRoutinesByFolder = query({
  args: { folderId: v.id("routineFolders") },
  handler: async (ctx, { folderId }) => {
    return await ctx.db
      .query("routines")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect();
  },
});

// Get routine exercises
export const getRoutineExercises = query({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    return await ctx.db
      .query("routineExercises")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .collect();
  },
});

// Mark routine folder synced
export const markRoutineFolderSynced = mutation({
  args: {
    folderId: v.id("routineFolders"),
    notionPageId: v.string(),
  },
  handler: async (ctx, { folderId, notionPageId }) => {
    await ctx.db.patch(folderId, {
      syncedToNotion: true,
      notionPageId,
    });
  },
});

// Mark routine synced
export const markRoutineSynced = mutation({
  args: {
    routineId: v.id("routines"),
    notionPageId: v.string(),
  },
  handler: async (ctx, { routineId, notionPageId }) => {
    await ctx.db.patch(routineId, {
      syncedToNotion: true,
      notionPageId,
    });
  },
});

// Mark routine exercise synced
export const markRoutineExerciseSynced = mutation({
  args: {
    exerciseId: v.id("routineExercises"),
    notionPageId: v.string(),
  },
  handler: async (ctx, { exerciseId, notionPageId }) => {
    await ctx.db.patch(exerciseId, {
      syncedToNotion: true,
      notionPageId,
    });
  },
});

// ===============================
// PROGRESSION TRACKING
// ===============================

// Get exercise progress by template ID
export const getExerciseProgress = query({
  args: { exerciseTemplateId: v.string() },
  handler: async (ctx, { exerciseTemplateId }) => {
    return await ctx.db
      .query("exerciseProgress")
      .withIndex("by_template", (q) => q.eq("exerciseTemplateId", exerciseTemplateId))
      .first();
  },
});

// Get all exercise progress records
export const getAllExerciseProgress = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("exerciseProgress").collect();
  },
});

// Mark exercise progress synced
export const markExerciseProgressSynced = mutation({
  args: {
    progressId: v.id("exerciseProgress"),
    notionPageId: v.string(),
  },
  handler: async (ctx, { progressId, notionPageId }) => {
    await ctx.db.patch(progressId, {
      syncedToNotion: true,
      notionPageId,
    });
  },
});

// Calculate progression stats for all exercises (from workout history)
export const calculateAllExerciseProgress = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all exercises grouped by template
    const allExercises = await ctx.db.query("exercises").collect();

    // Group by exercise template
    const exercisesByTemplate: Map<string, any[]> = new Map();
    for (const exercise of allExercises) {
      const existing = exercisesByTemplate.get(exercise.exerciseTemplateId) || [];
      existing.push(exercise);
      exercisesByTemplate.set(exercise.exerciseTemplateId, existing);
    }

    // Process each exercise template
    for (const [templateId, exercises] of exercisesByTemplate) {
      // Get workout dates for these exercises
      const workoutIds = [...new Set(exercises.map((e) => e.workoutId))];
      const workouts = await Promise.all(
        workoutIds.map((id) => ctx.db.get(id))
      );
      const workoutMap = new Map(
        workouts.filter(Boolean).map((w) => [w!._id, w!])
      );

      // Collect all sets for this exercise
      let maxWeight = 0;
      let maxReps = 0;
      let maxVolume = 0;
      let max1RM = 0;
      let lastPerformedAt: string | undefined;
      let lastWeight: number | undefined;
      let lastReps: number | undefined;
      let lastVolume = 0;
      let exerciseTitle = exercises[0]?.title || "";

      // Sort exercises by workout date
      const sortedExercises = exercises.sort((a, b) => {
        const workoutA = workoutMap.get(a.workoutId);
        const workoutB = workoutMap.get(b.workoutId);
        return (workoutB?.startTime || "").localeCompare(workoutA?.startTime || "");
      });

      for (const exercise of sortedExercises) {
        const workout = workoutMap.get(exercise.workoutId);
        if (!workout) continue;

        const sets = await ctx.db
          .query("sets")
          .withIndex("by_exercise", (q) => q.eq("exerciseId", exercise._id))
          .collect();

        let sessionVolume = 0;

        for (const set of sets) {
          const weight = set.weightKg || 0;
          const reps = set.reps || 0;
          const volume = weight * reps;

          sessionVolume += volume;

          // Track max weight
          if (weight > maxWeight) {
            maxWeight = weight;
          }

          // Track max reps (at any weight)
          if (reps > maxReps) {
            maxReps = reps;
          }

          // Estimate 1RM using Brzycki formula: 1RM = w × (36 / (37 - r))
          if (weight > 0 && reps > 0 && reps < 37) {
            const estimated1RM = weight * (36 / (37 - reps));
            if (estimated1RM > max1RM) {
              max1RM = estimated1RM;
            }
          }
        }

        // Track max volume (single session)
        if (sessionVolume > maxVolume) {
          maxVolume = sessionVolume;
        }

        // Track last performance (first in sorted = most recent)
        if (!lastPerformedAt) {
          lastPerformedAt = workout.startTime;
          // Get the last working set (non-warmup)
          const workingSets = sets.filter((s) => s.setType !== "warmup");
          if (workingSets.length > 0) {
            const lastSet = workingSets[workingSets.length - 1];
            lastWeight = lastSet.weightKg;
            lastReps = lastSet.reps;
          }
          lastVolume = sessionVolume;
        }
      }

      // Calculate suggested weight (simple progression: +2.5% if hit target reps)
      let suggestedWeight: number | undefined;
      let progressionNote: string | undefined;

      if (lastWeight && lastReps) {
        if (lastReps >= 10) {
          // Hit AMRAP target, increase by 2-5%
          suggestedWeight = Math.round((lastWeight * 1.025) * 2) / 2; // Round to 0.5kg
          progressionNote = `Hit ${lastReps} reps - increase by 2.5%`;
        } else if (lastReps >= 8) {
          // Good performance, small increase
          suggestedWeight = lastWeight;
          progressionNote = `Hit ${lastReps} reps - maintain weight`;
        } else {
          // Didn't hit target, keep same weight
          suggestedWeight = lastWeight;
          progressionNote = `Only ${lastReps} reps - maintain or reduce`;
        }
      }

      // Upsert progress record
      const existingProgress = await ctx.db
        .query("exerciseProgress")
        .withIndex("by_template", (q) => q.eq("exerciseTemplateId", templateId))
        .first();

      const progressData = {
        exerciseTemplateId: templateId,
        exerciseTitle,
        lastPerformedAt,
        lastWeightKg: lastWeight,
        lastReps,
        lastVolume: Math.round(lastVolume * 10) / 10,
        maxWeightKg: maxWeight > 0 ? maxWeight : undefined,
        maxReps: maxReps > 0 ? maxReps : undefined,
        maxVolume: maxVolume > 0 ? Math.round(maxVolume * 10) / 10 : undefined,
        max1RM: max1RM > 0 ? Math.round(max1RM * 10) / 10 : undefined,
        suggestedWeightKg: suggestedWeight,
        progressionNote,
        syncedToNotion: false,
        updatedAt: new Date().toISOString(),
      };

      if (existingProgress) {
        await ctx.db.patch(existingProgress._id, progressData);
      } else {
        await ctx.db.insert("exerciseProgress", progressData);
      }
    }

    return { success: true, processedTemplates: exercisesByTemplate.size };
  },
});
