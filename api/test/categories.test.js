import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { getAllPrompts } from "../src/services/prompt-store.js";

describe("GET /v1/categories", () => {
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

  it("returns all corpus categories", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/categories" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const expectedNames = new Set(corpus.map((p) => p.category));
    const returnedNames = new Set(body.items.map((c) => c.name));
    expect(returnedNames).toEqual(expectedNames);
    expect(body.total).toBe(expectedNames.size);
  });

  it("is deterministically ordered", async () => {
    const first = await app.inject({ method: "GET", url: "/v1/categories" });
    const second = await app.inject({ method: "GET", url: "/v1/categories" });
    const firstNames = first.json().items.map((c) => c.name);
    const secondNames = second.json().items.map((c) => c.name);
    expect(firstNames).toEqual(secondNames);

    const sorted = [...firstNames].sort((a, b) => a.localeCompare(b));
    expect(firstNames).toEqual(sorted);
  });

  it("reports counts matching the corpus", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/categories" });
    const body = res.json();

    const expectedCounts = new Map();
    for (const p of corpus) {
      expectedCounts.set(p.category, (expectedCounts.get(p.category) || 0) + 1);
    }

    for (const item of body.items) {
      expect(item.count).toBe(expectedCounts.get(item.name));
    }

    const totalCount = body.items.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(corpus.length);
  });

  it("ignores extraneous query params (no query schema on this route)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/categories?foo=bar" });
    // /v1/categories takes no query params at all; extra params are simply
    // ignored by Fastify routing (no schema is attached), matching the
    // "GET with no params" contract rather than the strict-query contract
    // used by /v1/prompts and /v1/search.
    expect(res.statusCode).toBe(200);
  });
});
