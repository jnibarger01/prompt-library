import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { getAllPrompts } from "../src/services/prompt-store.js";

describe("prompt-library API", () => {
  let app;
  let corpus;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    corpus = await getAllPrompts();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns 200 with a machine-readable status", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(typeof body.timestamp).toBe("string");
      // Slice 4: additive field, database connectivity is reported alongside status.
      expect(body.database).toBe("ok");
    });
  });

  describe("GET /v1/prompts", () => {
    it("returns paginated data with the default limit", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pagination.limit).toBe(25);
      expect(body.pagination.offset).toBe(0);
      expect(body.items.length).toBe(25);
      expect(body.pagination.returned).toBe(25);
      expect(body.pagination.total).toBe(corpus.length);
    });

    it("enforces the requested limit", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts?limit=5" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBe(5);
      expect(body.pagination.limit).toBe(5);
    });

    it("rejects a limit above the hard maximum", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts?limit=1000" });
      expect(res.statusCode).toBe(400);
    });

    it("never returns the full dataset when limit is omitted", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts" });
      const body = res.json();
      expect(body.items.length).toBeLessThan(corpus.length);
    });

    it("honors offset for deterministic pagination", async () => {
      const first = await app.inject({ method: "GET", url: "/v1/prompts?limit=5&offset=0" });
      const second = await app.inject({ method: "GET", url: "/v1/prompts?limit=5&offset=5" });
      const firstIds = first.json().items.map((p) => p.id);
      const secondIds = second.json().items.map((p) => p.id);
      expect(firstIds).not.toEqual(secondIds);
      expect(new Set([...firstIds, ...secondIds]).size).toBe(10);
    });

    it("filters by category", async () => {
      const category = corpus[0].category;
      const res = await app.inject({
        method: "GET",
        url: `/v1/prompts?category=${encodeURIComponent(category)}&limit=100`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.category).toBe(category);
      }
    });

    it("searches with q across title/prompt/tags", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts?q=ethereum&limit=100" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        const haystack = [item.title, item.prompt, ...(item.tags || [])].join(" ").toLowerCase();
        expect(haystack).toContain("ethereum");
      }
    });

    it("returns 400 for malformed query values", async () => {
      const badLimit = await app.inject({ method: "GET", url: "/v1/prompts?limit=abc" });
      expect(badLimit.statusCode).toBe(400);
      expect(badLimit.json().error).toBe("Bad Request");

      const negativeOffset = await app.inject({ method: "GET", url: "/v1/prompts?offset=-1" });
      expect(negativeOffset.statusCode).toBe(400);

      const zeroLimit = await app.inject({ method: "GET", url: "/v1/prompts?limit=0" });
      expect(zeroLimit.statusCode).toBe(400);

      const emptyQ = await app.inject({ method: "GET", url: "/v1/prompts?q=" });
      expect(emptyQ.statusCode).toBe(400);
    });

    it("does not leak filesystem details in error responses", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts?limit=abc" });
      const text = JSON.stringify(res.json());
      expect(text).not.toMatch(/\/data\/prompts\.json/);
      expect(text).not.toMatch(/\/home\//);
    });
  });

  describe("GET /v1/prompts/:id", () => {
    it("returns the correct prompt for a known id", async () => {
      const known = corpus[0];
      const res = await app.inject({ method: "GET", url: `/v1/prompts/${known.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(known);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/prompts/does-not-exist" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    });
  });
});
