import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { getAllPrompts } from "../src/services/prompt-store.js";

describe("GET /v1/search", () => {
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

  it("returns 200 for a basic search", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search?q=typescript" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.query).toEqual({ q: "typescript", category: null });
  });

  it("is case-insensitive", async () => {
    const lower = await app.inject({ method: "GET", url: "/v1/search?q=ethereum&limit=100" });
    const upper = await app.inject({ method: "GET", url: "/v1/search?q=ETHEREUM&limit=100" });
    expect(lower.statusCode).toBe(200);
    expect(upper.statusCode).toBe(200);
    expect(lower.json().pagination.total).toBe(upper.json().pagination.total);
    expect(lower.json().items.map((p) => p.id)).toEqual(upper.json().items.map((p) => p.id));
  });

  it("matches on title", async () => {
    const target = corpus.find((p) => p.title && p.title.trim().length > 0);
    const word = target.title.trim().split(/\s+/)[0];
    const res = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(word)}&limit=100`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((p) => p.id === target.id)).toBe(true);
  });

  it("matches on prompt body", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search?q=Solidity&limit=100" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.prompt.toLowerCase()).toContain("solidity");
    }
  });

  it("matches on tags", async () => {
    const tagged = corpus.find((p) => Array.isArray(p.tags) && p.tags.length > 0);
    const tag = tagged.tags[0];
    const res = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(tag)}&limit=100`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((p) => p.id === tagged.id)).toBe(true);
  });

  it("applies category filtering in addition to search", async () => {
    const category = corpus[0].category;
    const res = await app.inject({
      method: "GET",
      url: `/v1/search?q=a&category=${encodeURIComponent(category)}&limit=100`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const item of body.items) {
      expect(item.category).toBe(category);
    }
    expect(body.query.category).toBe(category);
  });

  it("paginates deterministically", async () => {
    const first = await app.inject({ method: "GET", url: "/v1/search?q=a&limit=5&offset=0" });
    const second = await app.inject({ method: "GET", url: "/v1/search?q=a&limit=5&offset=5" });
    const firstIds = first.json().items.map((p) => p.id);
    const secondIds = second.json().items.map((p) => p.id);
    expect(firstIds).not.toEqual(secondIds);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(10);
  });

  it("returns 400 when q is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Bad Request");
  });

  it("returns 400 for empty or whitespace-only q", async () => {
    const empty = await app.inject({ method: "GET", url: "/v1/search?q=" });
    expect(empty.statusCode).toBe(400);

    const whitespace = await app.inject({
      method: "GET",
      url: "/v1/search?q=" + encodeURIComponent("   "),
    });
    expect(whitespace.statusCode).toBe(400);
  });

  it("returns 400 for an oversized q", async () => {
    const oversized = "a".repeat(201);
    const res = await app.inject({
      method: "GET",
      url: `/v1/search?q=${encodeURIComponent(oversized)}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an invalid limit", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search?q=a&limit=abc" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for unknown query keys", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search?q=a&sort=relevance" });
    expect(res.statusCode).toBe(400);
  });
});
