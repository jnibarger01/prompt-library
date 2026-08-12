import { checkDatabaseHealth } from "../db/pool.js";

/**
 * GET /health — liveness + database readiness in one response.
 *
 * Slice 4 contract change (additive, not breaking): the response now also
 * includes a `database` field. Existing consumers checking `status === "ok"`
 * and `res.statusCode === 200` are unaffected when the database is healthy.
 * When the database is unreachable, this now returns 503 instead of 200 —
 * that is the one deliberate, documented behavior change, made because a
 * health check that always says "ok" while the datastore is down is worse
 * than no health check at all. Never includes DATABASE_URL, hostnames, or
 * any other connection detail — `checkDatabaseHealth()` only ever returns
 * a boolean.
 */
export default async function healthRoutes(fastify) {
  fastify.get("/health", async (request, reply) => {
    const databaseOk = await checkDatabaseHealth();

    if (!databaseOk) {
      return reply.code(503).send({
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: "unavailable",
      });
    }

    return { status: "ok", timestamp: new Date().toISOString(), database: "ok" };
  });
}
