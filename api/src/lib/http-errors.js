/**
 * Shared 400 response builder for Zod validation failures. Centralized so
 * every route returns the same error shape instead of hand-rolling it.
 *
 * @param {import("fastify").FastifyReply} reply
 * @param {import("zod").ZodError} zodError
 * @param {"query"|"body"|"params"} [source] - what was being validated, used
 *   for the summary message and as the fallback path label for whole-object
 *   issues (e.g. a refine() failure with no specific field).
 */
const SOURCE_LABELS = {
  query: "query parameters",
  body: "request body fields",
  params: "route parameters",
};

export function badRequest(reply, zodError, source = "query") {
  const label = SOURCE_LABELS[source] || source;
  return reply.code(400).send({
    error: "Bad Request",
    message: `One or more ${label} are invalid.`,
    details: zodError.issues.map((issue) => ({
      path: issue.path.join(".") || `(${source})`,
      message: issue.message,
    })),
  });
}
