import Fastify from "fastify";
import healthRoutes from "./routes/health.js";
import promptsRoutes from "./routes/prompts.js";
import searchRoutes from "./routes/search.js";
import categoriesRoutes from "./routes/categories.js";
import { closePool } from "./db/pool.js";

/**
 * Builds the Fastify app. Kept separate from the listen() call so tests can
 * build an in-memory instance (via .inject()) without binding a port.
 *
 * Startup policy (Slice 4): the process starts regardless of database
 * availability — no connection is attempted here. A database that's down
 * or misconfigured surfaces per-request as 500s (mutation/list/search/
 * categories routes) or a 503 from GET /health, rather than crash-looping
 * the whole process at boot. See db/pool.js for the full rationale.
 */
export function buildServer(opts = {}) {
  const fastify = Fastify({ logger: opts.logger ?? false });

  // GET routes are public and read-only. POST/PATCH/DELETE on /v1/prompts
  // require bearer auth (see lib/auth.js) and are the only state-changing
  // routes registered anywhere.

  fastify.setErrorHandler((error, request, reply) => {
    // Never leak stack traces, file paths, connection strings, or other
    // internals to clients — this applies to database errors exactly the
    // same as any other unexpected error.
    request.log?.error?.(error);
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(statusCode).send({
      error: statusCode === 500 ? "Internal Server Error" : error.name || "Error",
      message: statusCode === 500 ? "An unexpected error occurred." : error.message,
    });
  });

  // Release the database pool when the server shuts down (graceful
  // shutdown in production; between test runs in the test suite).
  fastify.addHook("onClose", async () => {
    await closePool();
  });

  fastify.register(healthRoutes);
  fastify.register(promptsRoutes);
  fastify.register(searchRoutes);
  fastify.register(categoriesRoutes);

  return fastify;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || "0.0.0.0";

  const server = buildServer({ logger: true });

  server
    .listen({ port, host })
    .catch((err) => {
      server.log.error(err);
      process.exit(1);
    });
}
