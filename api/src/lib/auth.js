import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Bearer-token authentication for mutation routes.
 *
 * Behavior:
 * - Reads PROMPT_API_KEY from the environment on every request (not cached
 *   at module load) so tests can flip it and so a running process always
 *   reflects the current environment rather than a stale snapshot.
 * - If PROMPT_API_KEY is unset/empty, auth FAILS CLOSED: every mutation
 *   request gets 401, regardless of what Authorization header is sent. This
 *   is deliberate — an unconfigured key must never mean "no auth required."
 * - Comparison is constant-time regardless of input length: both sides are
 *   hashed to a fixed 32-byte SHA-256 digest before timingSafeEqual, so the
 *   comparison itself never leaks token length or content via timing.
 * - Never logs the header or the configured key. Never echoes either back
 *   in a response body.
 */

const BEARER_PATTERN = /^Bearer[ \t]+(\S.*)$/;

function constantTimeEquals(a, b) {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
}

function unauthorized(reply) {
  reply.code(401).send({
    error: "Unauthorized",
    message: "A valid bearer token is required for this request.",
  });
}

/** Fastify preHandler. Attach to individual mutation routes only. */
export function requireBearerAuth(request, reply, done) {
  const configuredKey = process.env.PROMPT_API_KEY;

  if (!configuredKey) {
    // Fail closed: no key configured means no mutation can ever succeed.
    unauthorized(reply);
    return;
  }

  const header = request.headers.authorization;
  if (typeof header !== "string") {
    unauthorized(reply);
    return;
  }

  const match = BEARER_PATTERN.exec(header);
  if (!match) {
    unauthorized(reply);
    return;
  }

  const provided = match[1];
  if (!constantTimeEquals(provided, configuredKey)) {
    unauthorized(reply);
    return;
  }

  done();
}
