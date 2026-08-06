import fs from "node:fs";
import path from "node:path";

let promptCache;
let promptMapCache;

function loadPrompts() {
  if (!promptCache) {
    const filePath = path.join(process.cwd(), "data", "prompts.json");
    promptCache = JSON.parse(fs.readFileSync(filePath, "utf8"));
    promptMapCache = new Map(promptCache.map((prompt) => [prompt.id, prompt]));
  }
  return promptCache;
}

function cleanText(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function buildSnippet(prompt, query) {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (!query) return text.slice(0, 260) + (text.length > 260 ? "…" : "");

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text.slice(0, 260) + (text.length > 260 ? "…" : "");

  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + query.length + 180);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function relevance(prompt, query) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const title = prompt.title.toLowerCase();
  const body = prompt.prompt.toLowerCase();
  let score = 0;
  if (title === q) score += 100;
  if (title.startsWith(q)) score += 50;
  if (title.includes(q)) score += 25;
  const occurrences = body.split(q).length - 1;
  score += Math.min(occurrences, 10);
  return score;
}

export function getMeta() {
  const prompts = loadPrompts();
  const counts = prompts.reduce((acc, prompt) => {
    acc[prompt.category] = (acc[prompt.category] || 0) + 1;
    return acc;
  }, {});

  return {
    total: prompts.length,
    categories: Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

export function getPromptById(id) {
  loadPrompts();
  return promptMapCache.get(id) || null;
}

export function searchPrompts({
  query = "",
  category = "All",
  sort = "relevance",
  page = 1,
  limit = 24,
  ids = [],
}) {
  const prompts = loadPrompts();
  const q = cleanText(query).toLowerCase();
  const selectedCategory = cleanText(category, 60);
  const selectedIds = new Set(ids.filter(Boolean));

  let results = prompts.filter((prompt) => {
    if (selectedIds.size && !selectedIds.has(prompt.id)) return false;
    if (selectedCategory !== "All" && prompt.category !== selectedCategory) return false;
    if (!q) return true;
    return prompt.title.toLowerCase().includes(q) || prompt.prompt.toLowerCase().includes(q);
  });

  if (sort === "title") {
    results.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "longest") {
    results.sort((a, b) => b.characters - a.characters || a.title.localeCompare(b.title));
  } else if (sort === "shortest") {
    results.sort((a, b) => a.characters - b.characters || a.title.localeCompare(b.title));
  } else if (q) {
    results.sort((a, b) => relevance(b, q) - relevance(a, q) || a.title.localeCompare(b.title));
  } else {
    results.sort((a, b) => a.title.localeCompare(b.title));
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 24, 60));
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * safeLimit;
  const pageItems = results.slice(start, start + safeLimit).map((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    category: prompt.category,
    tags: prompt.tags,
    characters: prompt.characters,
    words: prompt.words,
    snippet: buildSnippet(prompt.prompt, q),
  }));

  return {
    items: pageItems,
    total: results.length,
    page: safePage,
    limit: safeLimit,
    hasMore: start + safeLimit < results.length,
  };
}
