import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Sync state - tracks last sync cursor and status
  syncState: defineTable({
    lastSyncedAt: v.optional(v.string()), // ISO timestamp
    lastEventTimestamp: v.optional(v.string()), // cursor for incremental sync
    lastError: v.optional(v.string()),
    syncInProgress: v.boolean(),
  }),

  // Workouts - parent table
  workouts: defineTable({
    hevyId: v.string(), // Hevy workout UUID
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.string(), // ISO timestamp
    endTime: v.optional(v.string()), // ISO timestamp
    durationMinutes: v.optional(v.number()),
    totalVolume: v.optional(v.number()), // kg
    totalSets: v.optional(v.number()),
    totalReps: v.optional(v.number()),
    notionPageId: v.optional(v.string()), // Notion page ID once synced
    syncedToNotion: v.boolean(),
    isDeleted: v.boolean(),
  }).index("by_hevy_id", ["hevyId"])
    .index("by_synced", ["syncedToNotion"])
    .index("by_start_time", ["startTime"]),

  // Exercises - child of workouts
  exercises: defineTable({
    workoutId: v.id("workouts"), // Convex relation
    hevyExerciseIndex: v.number(), // index within workout
    exerciseTemplateId: v.string(), // Hevy exercise template ID
    title: v.string(),
    notes: v.optional(v.string()),
    supersetId: v.optional(v.number()),
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
  }).index("by_workout", ["workoutId"])
    .index("by_template", ["exerciseTemplateId"]),

  // Sets - child of exercises
  sets: defineTable({
    exerciseId: v.id("exercises"), // Convex relation
    workoutId: v.id("workouts"), // denormalized for easier queries
    setIndex: v.number(), // index within exercise
    setType: v.string(), // "warmup", "normal", "failure", "dropset"
    weightKg: v.optional(v.number()),
    reps: v.optional(v.number()),
    distanceMeters: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    rpe: v.optional(v.number()),
    customMetric: v.optional(v.number()),
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
  }).index("by_exercise", ["exerciseId"])
    .index("by_workout", ["workoutId"]),

  // Exercise templates cache - for lookups
  exerciseTemplates: defineTable({
    hevyId: v.string(),
    title: v.string(),
    exerciseType: v.string(),
    primaryMuscleGroup: v.optional(v.string()),
    secondaryMuscleGroups: v.optional(v.array(v.string())),
    isCustom: v.boolean(),
  }).index("by_hevy_id", ["hevyId"]),

  // ===============================
  // ROUTINES (Program Templates)
  // ===============================

  // Routine folders (program groupings like "SBS Week 1")
  routineFolders: defineTable({
    hevyId: v.number(), // Hevy folder ID (integer)
    title: v.string(),
    index: v.number(), // display order from Hevy
    // Sorting fields for proper week-by-week organization
    weekNumber: v.optional(v.number()), // Parsed from title e.g., "Week 1" → 1
    sortOrder: v.optional(v.number()), // Explicit sort order for Notion (weekNumber * 100 + index)
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
    updatedAt: v.string(), // ISO timestamp for change detection
  }).index("by_hevy_id", ["hevyId"]),

  // Routines (workout templates like "Day 1 - Squat")
  routines: defineTable({
    hevyId: v.string(), // Hevy routine UUID
    folderId: v.optional(v.id("routineFolders")), // Convex relation
    hevyFolderId: v.optional(v.number()), // Hevy folder ID for lookup
    title: v.string(),
    // Sorting fields for proper day-by-day organization within weeks
    dayNumber: v.optional(v.number()), // Parsed from title e.g., "Day 1" → 1
    weekNumber: v.optional(v.number()), // Inherited from folder for denormalized sorting
    sortOrder: v.optional(v.number()), // Explicit sort (weekNumber * 100 + dayNumber)
    // Day classification for grouping
    dayType: v.optional(v.string()), // "Squat", "Bench", "Deadlift", "Press"
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
    updatedAt: v.string(), // ISO timestamp for change detection
  }).index("by_hevy_id", ["hevyId"])
    .index("by_folder", ["folderId"]),

  // Routine exercises (template exercises within a routine)
  routineExercises: defineTable({
    routineId: v.id("routines"), // Convex relation
    index: v.number(), // exercise order in routine (from Hevy)
    exerciseTemplateId: v.string(), // Hevy exercise template ID
    title: v.string(), // e.g., "Bench Press (Barbell)"
    notes: v.optional(v.string()), // RPE instructions, progression notes
    supersetId: v.optional(v.number()),
    restSeconds: v.optional(v.number()),
    targetSets: v.number(), // number of planned sets
    targetReps: v.optional(v.number()), // target reps per set
    targetWeightKg: v.optional(v.number()), // planned weight if set
    // Denormalized sorting fields for Notion views
    weekNumber: v.optional(v.number()), // From parent routine's folder
    dayNumber: v.optional(v.number()), // From parent routine
    exerciseOrder: v.optional(v.number()), // Explicit order within routine
    globalSortOrder: v.optional(v.number()), // week*10000 + day*100 + exerciseOrder for global sorting
    // Exercise categorization
    exerciseRole: v.optional(v.string()), // "Main Lift", "Variation", "Accessory", "Cardio"
    muscleGroup: v.optional(v.string()), // "Chest", "Back", "Legs", etc.
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
  }).index("by_routine", ["routineId"])
    .index("by_template", ["exerciseTemplateId"])
    .index("by_global_sort", ["globalSortOrder"]),

  // Routine sets (planned sets within a routine exercise)
  routineSets: defineTable({
    routineExerciseId: v.id("routineExercises"), // Convex relation
    routineId: v.id("routines"), // denormalized for easier queries
    index: v.number(), // set order
    setType: v.string(), // "normal", "warmup", etc.
    targetReps: v.optional(v.number()),
    targetWeightKg: v.optional(v.number()),
    targetDistanceMeters: v.optional(v.number()),
    targetDurationSeconds: v.optional(v.number()),
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
  }).index("by_routine_exercise", ["routineExerciseId"])
    .index("by_routine", ["routineId"]),

  // ===============================
  // PROGRESSION TRACKING
  // ===============================

  // Exercise progression stats (aggregated per exercise template)
  exerciseProgress: defineTable({
    exerciseTemplateId: v.string(), // links to both routines and workouts
    exerciseTitle: v.string(),
    // Latest performance from workout history
    lastPerformedAt: v.optional(v.string()),
    lastWeightKg: v.optional(v.number()),
    lastReps: v.optional(v.number()),
    lastVolume: v.optional(v.number()),
    // Personal records
    maxWeightKg: v.optional(v.number()),
    maxReps: v.optional(v.number()), // at any weight
    maxVolume: v.optional(v.number()), // single session
    max1RM: v.optional(v.number()), // estimated 1RM
    // Progression recommendation
    suggestedWeightKg: v.optional(v.number()),
    suggestedReps: v.optional(v.number()),
    progressionNote: v.optional(v.string()),
    // Notion sync
    notionPageId: v.optional(v.string()),
    syncedToNotion: v.boolean(),
    updatedAt: v.string(),
  }).index("by_template", ["exerciseTemplateId"]),
});
