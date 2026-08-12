import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const TEST_KEY = "test-only-secret-key-do-not-use-in-prod";
const originalKey = process.env.PROMPT_API_KEY;

function authHeader(key = TEST_KEY) {
  return { authorization: `Bearer ${key}` };
}

describe("mutation routes (Slice 3 contract, Slice 4 PostgreSQL persistence)", () => {
  let app;
  const createdIds = [];

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

  // Every test that creates a row registers its id here; afterEach cleans
  // up so this file never leaves rows behind for other test files (which
  // share the same TEST_DATABASE_URL) to trip over.
  afterEach(async () => {
    while (createdIds.length) {
      const id = createdIds.pop();
      await app.inject({ method: "DELETE", url: `/v1/prompts/${id}`, headers: authHeader() });
    }
  });

  const validBody = {
    title: "Slice 4 Test Prompt",
    prompt: "This is a test prompt body used for Slice 4 mutation tests.",
    category: "Development",
    tags: ["testing", "slice4"],
  };

  async function createOne(overrides = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/prompts",
      headers: authHeader(),
      payload: { ...validBody, ...overrides },
    });
    const body = res.json();
    if (res.statusCode === 201) createdIds.push(body.id);
    return { res, body };
  }

  describe("authentication", () => {
    it("POST without Authorization header -> 401", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/prompts", payload: validBody });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Unauthorized");
    });

    it("POST with an invalid token -> 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader("definitely-wrong-key"),
        payload: validBody,
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST with a malformed Authorization header -> 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: { authorization: `Basic ${TEST_KEY}` },
        payload: validBody,
      });
      expect(res.statusCode).toBe(401);
    });

    it("PATCH without Authorization header -> 401", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/v1/prompts/some-id",
        payload: { title: "x" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("DELETE without Authorization header -> 401", async () => {
      const res = await app.inject({ method: "DELETE", url: "/v1/prompts/some-id" });
      expect(res.statusCode).toBe(401);
    });

    it("accepts a valid bearer token", async () => {
      const { res } = await createOne();
      expect(res.statusCode).toBe(201);
    });

    it("fails closed when PROMPT_API_KEY is not configured", async () => {
      delete process.env.PROMPT_API_KEY;
      try {
        const res = await app.inject({
          method: "POST",
          url: "/v1/prompts",
          headers: authHeader(), // even the "right" key from before is now meaningless
          payload: validBody,
        });
        expect(res.statusCode).toBe(401);
      } finally {
        process.env.PROMPT_API_KEY = TEST_KEY;
      }
    });

    it("never echoes the key in a 401 response", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader("wrong-key"),
        payload: validBody,
      });
      const text = JSON.stringify(res.json());
      expect(text).not.toContain(TEST_KEY);
      expect(text).not.toContain("wrong-key");
    });
  });

  describe("POST /v1/prompts", () => {
    it("creates a prompt and returns 201 with the full stored object", async () => {
      const { res, body } = await createOne();
      expect(res.statusCode).toBe(201);
      expect(body.title).toBe(validBody.title);
      expect(body.prompt).toBe(validBody.prompt);
      expect(body.category).toBe(validBody.category);
      expect(body.tags).toEqual(validBody.tags);
    });

    it("generates an id server-side in the accepted format", async () => {
      const { body } = await createOne();
      expect(typeof body.id).toBe("string");
      // Same 43-char base64url SHA-256 shape as the shipped corpus.
      expect(body.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("derives characters correctly from the prompt body", async () => {
      const { body } = await createOne();
      expect(body.characters).toBe(validBody.prompt.length);
    });

    it("derives words correctly from the prompt body", async () => {
      const { body } = await createOne();
      const expectedWords = validBody.prompt.trim().split(/\s+/).length;
      expect(body.words).toBe(expectedWords);
    });

    it("rejects client-supplied id/characters/words as unknown keys -> 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader(),
        payload: { ...validBody, id: "client-supplied-id", characters: 1, words: 1 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects unknown body keys -> 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader(),
        payload: { ...validBody, notAField: "nope" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Bad Request");
    });

    it("rejects an empty title -> 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader(),
        payload: { ...validBody, title: "   " },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a missing prompt field -> 400", async () => {
      const { prompt, ...rest } = validBody;
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader(),
        payload: rest,
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects too many tags -> 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/prompts",
        headers: authHeader(),
        payload: { ...validBody, tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PATCH /v1/prompts/:id", () => {
    it("applies a partial update -> 200", async () => {
      const { body: created } = await createOne();
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
        payload: { title: "Updated Title" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("Updated Title");
      expect(body.prompt).toBe(created.prompt);
      expect(body.category).toBe(created.category);
      expect(body.id).toBe(created.id);
    });

    it("recalculates characters/words when prompt content changes", async () => {
      const { body: created } = await createOne();
      const newPrompt = "A much longer replacement prompt body with several more words in it.";
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
        payload: { prompt: newPrompt },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.characters).toBe(newPrompt.length);
      expect(body.words).toBe(newPrompt.trim().split(/\s+/).length);
    });

    it("keeps characters/words unchanged when prompt content is not part of the patch", async () => {
      const { body: created } = await createOne();
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
        payload: { category: "Writing" },
      });
      const body = res.json();
      expect(body.characters).toBe(created.characters);
      expect(body.words).toBe(created.words);
    });

    it("rejects unknown body fields -> 400", async () => {
      const { body: created } = await createOne();
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
        payload: { notAField: "nope" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an attempt to change id/characters/words -> 400", async () => {
      const { body: created } = await createOne();
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
        payload: { id: "new-id", characters: 1, words: 1 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an empty PATCH body -> 400", async () => {
      const { body: created } = await createOne();
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/v1/prompts/does-not-exist",
        headers: authHeader(),
        payload: { title: "x" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/prompts/:id", () => {
    it("deletes a prompt -> 204", async () => {
      const { body: created } = await createOne();
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      // Already deleted — nothing left for afterEach to clean up.
      createdIds.pop();
    });

    it("returns 404 on GET after deletion", async () => {
      const { body: created } = await createOne();
      await app.inject({
        method: "DELETE",
        url: `/v1/prompts/${created.id}`,
        headers: authHeader(),
      });
      createdIds.pop();

      const res = await app.inject({ method: "GET", url: `/v1/prompts/${created.id}` });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 when deleting an unknown id", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/v1/prompts/does-not-exist",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
