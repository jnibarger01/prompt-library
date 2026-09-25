import fs from "node:fs";
import path from "node:path";

const filePaths = ["prompts.json", "opus55-prompts.json"].map((name) =>
  path.join(process.cwd(), "data", name),
);
const prompts = filePaths.flatMap((filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8")),
);
const required = ["id", "title", "prompt", "category", "tags", "characters", "words"];
const errors = [];
const ids = new Set();

if (!Array.isArray(prompts)) errors.push("Root value must be an array.");

for (const [index, item] of prompts.entries()) {
  for (const field of required) {
    if (!(field in item)) errors.push(`Item ${index} is missing ${field}.`);
  }
  if (!item.id || ids.has(item.id)) errors.push(`Item ${index} has a missing or duplicate ID.`);
  ids.add(item.id);
  if (!item.title?.trim()) errors.push(`Item ${index} has no title.`);
  if (!item.prompt?.trim()) errors.push(`Item ${index} has no prompt body.`);
  if (!Array.isArray(item.tags)) errors.push(`Item ${index} has invalid tags.`);
}

if (errors.length) {
  console.error(errors.slice(0, 30).join("\n"));
  console.error(`Validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

const categories = new Set(prompts.map((item) => item.category));
console.log(`Validated ${prompts.length.toLocaleString()} prompts, ${ids.size.toLocaleString()} unique IDs, ${categories.size} categories.`);
