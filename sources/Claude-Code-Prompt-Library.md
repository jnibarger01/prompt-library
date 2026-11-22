# Imported prompt collection: Claude Code prompt library

- **Source:** https://code.claude.com/docs/en/prompt-library
- **Publisher:** Anthropic, Claude Code Docs
- **Imported on:** 2026-11-21
- **Imported items:** 52 copy-paste prompts from the documented library

## Import notes

Each prompt keeps the wording published on the Claude Code prompt library page. Fill-in slots written as `{name}` were stored as `${name}` so this library's variable highlighter can see them. The page's example slot values are kept on an `Example:` line.

No new categories were added. Each prompt is filed in one of the existing 14 categories, chosen from what the prompt actually does:

- Development: codebase orientation, implementation, tests, refactors, git, CI, and debugging
- Design & Image: mockups, screenshot matching, visual bugs, and design edge cases
- Writing: specs, docs, release notes, and content review
- Marketing & Social: product copy and ad variations
- Data & Research: data-file analysis
- Security & IT: security review, infrastructure plans, incidents, and log queries
- Productivity: meeting-to-tickets and session memory

The card label is the tag list. The first tag is the source page's filter label (`understand`, `plan`, `prototype`, `build`, `test`, `refactor`, `review`, `steer`, `git`, `release`, `debug`, `data`, `automate`). When the page category is more specific than that label, it is the next tag (`onboard`, `incident`). Role labels from the page (`pm`, `design`, `docs`, `marketing`, `security`, `ops`, `data`) follow. Every entry also carries `claude-code`.

These prompts are starting points published for copy-paste use. They are attributed to Anthropic and are not relicensed by this repository.
