import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const TEST_KEY = "test-only-secret-key-do-not-use-in-prod";
const originalKey = process.env.PROMPT_API_KEY;

function authHeader() {
  return { authorization: `Bearer ${TEST_KEY}` };
}

// Unique markers so these tests can't collide with anything in the real
// 2,084-prompt corpus or with prompts created by other test files.
const UNIQUE_TOKEN = "zzzslice4token";
const UNIQUE_CATEGORY = "Zzz Slice4 Test Category";
const PATCHED_TOKEN = "zzzslice4patchedtoken";

describe("cross-endpoint consistency + restart persistence (Slice 4)", () => {
  let app;
  let createdId;

  beforeAll(async () => {
    process.env.PROMPT_API_KEY = TEST_KEY;
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (originalKey === undefined) {
      delete process.env.PROMPT_API_KEY;
    } else {
      process.env.PROMPT_API_KEY = originalKey;
    }
  });

  it("step 1: create a prompt with unique markers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/prompts",
      headers: authHeader(),
      payload: {
        title: `Consistency check ${UNIQUE_TOKEN}`,
        prompt: `This prompt body contains the marker ${UNIQUE_TOKEN} for cross-endpoint checks.`,
        category: UNIQUE_CATEGORY,
        tags: [UNIQUE_TOKEN],
      },
    });
    expect(res.statusCode).toBe(201);
    createdId = res.json().id;
    expect(createdId).toBeTruthy();
  });

  it("step 2: created prompt appears in GET /v1/prompts (filtered by its new category)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/prompts?category=${encodeURIComponent(UNIQUE_CATEGORY)}&limit=10`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.items[0].id).toBe(createdId);
  });

  it("step 3: created prompt appears in GET /v1/search", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/search?q=${UNIQUE_TOKEN}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.some((p) => p.id === createdId)).toBe(true);
  });

  it("step 4: new category appears in /v1/categories with count 1", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/categories" });
    expect(res.statusCode).toBe(200);
    const category = res.json().items.find((c) => c.name === UNIQUE_CATEGORY);
    expect(category).toBeDefined();
    expect(category.count).toBe(1);
  });

  it("step 5: POST survives a simulated process restart (close + rebuild server/store)", async () => {
    await app.close(); // triggers the onClose hook -> db pool closePool()
    app = buildServer(); // fresh Fastify instance; store lazily reconnects on first query
    await app.ready();

    const res = await app.inject({ method: "GET", url: `/v1/prompts/${createdId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toContain(UNIQUE_TOKEN);
  });

  it("step 6: patched prompt is reflected in search under its new content", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/prompts/${createdId}`,
      headers: authHeader(),
      payload: { title: `Consistency check ${PATCHED_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);

    const searchNew = await app.inject({ method: "GET", url: `/v1/search?q=${PATCHED_TOKEN}` });
    expect(searchNew.json().items.some((p) => p.id === createdId)).toBe(true);
  });

  it("step 7: PATCH survives a simulated process restart", async () => {
    await app.close();
    app = buildServer();
    await app.ready();

    const res = await app.inject({ method: "GET", url: `/v1/prompts/${createdId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toContain(PATCHED_TOKEN);
  });

  it("step 8: DELETE removes the prompt, disappearing from search and categories", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/v1/prompts/${createdId}`,
      headers: authHeader(),
    });
    expect(del.statusCode).toBe(204);

    const search = await app.inject({ method: "GET", url: `/v1/search?q=${PATCHED_TOKEN}` });
    expect(search.json().items.some((p) => p.id === createdId)).toBe(false);

    const categories = await app.inject({ method: "GET", url: "/v1/categories" });
    const category = categories.json().items.find((c) => c.name === UNIQUE_CATEGORY);
    expect(category).toBeUndefined();
  });

  it("step 9: DELETE survives a simulated process restart (id remains 404, not resurrected)", async () => {
    await app.close();
    app = buildServer();
    await app.ready();

    const res = await app.inject({ method: "GET", url: `/v1/prompts/${createdId}` });
    expect(res.statusCode).toBe(404);
  });
});
