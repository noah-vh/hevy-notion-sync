import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Manual sync trigger endpoint
http.route({
  path: "/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify webhook secret
    const authHeader = request.headers.get("Authorization");
    const expectedSecret = process.env.SYNC_WEBHOOK_SECRET;

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const body = await request.json().catch(() => ({}));

      // If database IDs provided, do full pipeline
      if (body.workoutsDbId && body.exercisesDbId && body.setsDbId) {
        const result = await ctx.runAction(api.notion.fullPipeline, {
          workoutsDbId: body.workoutsDbId,
          exercisesDbId: body.exercisesDbId,
          setsDbId: body.setsDbId,
        });
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Otherwise just sync Hevy -> Convex
      const result = await ctx.runAction(api.hevy.incrementalSync);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Full sync (backfill) endpoint
http.route({
  path: "/full-sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const expectedSecret = process.env.SYNC_WEBHOOK_SECRET;

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const result = await ctx.runAction(api.hevy.fullSync);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Health check endpoint
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Status endpoint
http.route({
  path: "/status",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const status = await ctx.runQuery(api.sync.getStatus);
    return new Response(JSON.stringify(status), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
