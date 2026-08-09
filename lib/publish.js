"use client";

/**
 * Layer 2: publishing a local prompt to the shared library.
 *
 * A static site has no server and can hold no credentials, so submission goes
 * through GitHub's issue form: the page builds a prefilled URL, the user
 * submits it under their own account, and .github/workflows/ingest-prompt.yml
 * validates, categorises and commits it. GitHub Actions is the middle tier —
 * no service to run, no token in the bundle.
 */

const REPO_SLUG = process.env.NEXT_PUBLIC_REPO_SLUG || "jnibarger01/prompt-library";
const ISSUE_TEMPLATE = "add-prompt.yml";

/**
 * Practical ceiling for a prefilled issue URL. Browsers and GitHub both accept
 * more than this, but proxies start truncating well before the theoretical
 * limit, and a silently truncated prompt is worse than a copy-paste fallback.
 */
const MAX_URL_LENGTH = 7000;

export function buildIssueUrl({ title, prompt, category, tags }) {
  const params = new URLSearchParams({
    template: ISSUE_TEMPLATE,
    title: `Add prompt: ${title}`,
    "prompt-title": title,
    "prompt-body": prompt,
    "prompt-category": category || "",
    "prompt-tags": (tags || []).join(", "),
  });

  return `https://github.com/${REPO_SLUG}/issues/new?${params.toString()}`;
}

/** Plain-text fallback matching the issue form's field order. */
export function buildFallbackText({ title, prompt, category, tags }) {
  return [
    `### Title`,
    title,
    ``,
    `### Prompt`,
    prompt,
    ``,
    `### Category`,
    category || "Other",
    ``,
    `### Tags`,
    (tags || []).join(", ") || "none",
  ].join("\n");
}

/**
 * Opens the prefilled issue form, or reports that the prompt is too long to
 * carry in a URL so the caller can offer the copy-paste route instead.
 *
 * @returns {{ok: true} | {ok: false, reason: "too-long", url: string}}
 */
export function openIssueForm(entry) {
  const url = buildIssueUrl(entry);
  if (url.length > MAX_URL_LENGTH) {
    return { ok: false, reason: "too-long", url: `https://github.com/${REPO_SLUG}/issues/new?template=${ISSUE_TEMPLATE}` };
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}

export function repoSlug() {
  return REPO_SLUG;
}
