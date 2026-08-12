import { DEFAULT_LIMIT, searchQuerySchema } from "../schemas/prompt.js";
import { queryPrompts } from "../services/prompt-store.js";
import { badRequest } from "../lib/http-errors.js";

/**
 * GET /v1/search — explicit search endpoint. `q` is required (unlike the
 * optional `q` on GET /v1/prompts). Filtering/pagination is delegated to the
 * same prompt-store.queryPrompts used by /v1/prompts, so search semantics
 * never diverge between the two routes.
 */
export default async function searchRoutes(fastify) {
  fastify.get("/v1/search", async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, parsed.error);
    }

    const { q, limit = DEFAULT_LIMIT, offset = 0, category } = parsed.data;

    const { items, total } = await queryPrompts({ limit, offset, category, q });

    return {
      items,
      pagination: {
        limit,
        offset,
        returned: items.length,
        total,
      },
      query: {
        q,
        category: category ?? null,
      },
    };
  });
}
