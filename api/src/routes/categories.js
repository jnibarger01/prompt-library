import { getCategories } from "../services/prompt-store.js";

/**
 * GET /v1/categories — category discovery. No query params: this endpoint
 * always returns the full, deterministically ordered set derived from the
 * corpus (small, bounded list — no pagination needed).
 */
export default async function categoriesRoutes(fastify) {
  fastify.get("/v1/categories", async () => {
    return await getCategories();
  });
}
