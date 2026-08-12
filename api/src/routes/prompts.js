import {
  DEFAULT_LIMIT,
  listPromptsQuerySchema,
  promptIdParamSchema,
  createPromptBodySchema,
  updatePromptBodySchema,
} from "../schemas/prompt.js";
import {
  getPromptById,
  queryPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  PromptConflictError,
} from "../services/prompt-store.js";
import { badRequest } from "../lib/http-errors.js";
import { requireBearerAuth } from "../lib/auth.js";

function notFound(reply) {
  return reply.code(404).send({
    error: "Not Found",
    message: "No prompt exists with the given id.",
  });
}

/**
 * GET /v1/prompts, GET /v1/prompts/:id — read-only, public, unchanged from
 * Slice 1/2.
 *
 * POST /v1/prompts, PATCH /v1/prompts/:id, DELETE /v1/prompts/:id — Slice 3
 * mutation routes, now (Slice 4) backed by PostgreSQL via prompt-store.js.
 * All require bearer auth (see lib/auth.js) and are durable — a process
 * restart no longer discards mutations. A database failure surfaces as a
 * generic 500 through the shared error handler in server.js (no filesystem
 * paths, credentials, or stack traces are ever included in that response).
 */
export default async function promptsRoutes(fastify) {
  fastify.get("/v1/prompts", async (request, reply) => {
    const parsed = listPromptsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, parsed.error, "query");
    }

    const { limit = DEFAULT_LIMIT, offset = 0, category, q } = parsed.data;

    const { items, total } = await queryPrompts({ limit, offset, category, q });

    return {
      items,
      pagination: {
        limit,
        offset,
        returned: items.length,
        total,
      },
    };
  });

  fastify.get("/v1/prompts/:id", async (request, reply) => {
    const parsedParams = promptIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error, "params");
    }

    const prompt = await getPromptById(parsedParams.data.id);
    if (!prompt) {
      return notFound(reply);
    }

    return prompt;
  });

  fastify.post("/v1/prompts", { preHandler: requireBearerAuth }, async (request, reply) => {
    const parsedBody = createPromptBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return badRequest(reply, parsedBody.error, "body");
    }

    try {
      const created = await createPrompt(parsedBody.data);
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof PromptConflictError) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Could not create the prompt due to an id collision. Please retry.",
        });
      }
      throw err;
    }
  });

  fastify.patch("/v1/prompts/:id", { preHandler: requireBearerAuth }, async (request, reply) => {
    const parsedParams = promptIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error, "params");
    }

    const parsedBody = updatePromptBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return badRequest(reply, parsedBody.error, "body");
    }

    const updated = await updatePrompt(parsedParams.data.id, parsedBody.data);
    if (!updated) {
      return notFound(reply);
    }

    return updated;
  });

  fastify.delete("/v1/prompts/:id", { preHandler: requireBearerAuth }, async (request, reply) => {
    const parsedParams = promptIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error, "params");
    }

    const removed = await deletePrompt(parsedParams.data.id);
    if (!removed) {
      return notFound(reply);
    }

    return reply.code(204).send();
  });
}
