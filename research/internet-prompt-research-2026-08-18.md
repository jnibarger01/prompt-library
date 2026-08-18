# Internet Prompt Research Report

**Date:** 2026-08-18
**Repository:** `jnibarger01/prompt-library`
**Branch:** `feat/internet-prompt-research`

## Executive summary

The repository contains 2,084 prompts in a deliberately simple corpus schema: `id`, `title`, `prompt`, `category`, `tags`, `characters`, and `words`. It has strong breadth and a working static/API delivery path, but its most important gap is depth: the corpus is dominated by standalone role prompts and has little explicit support for evidence, verification, bounded execution, incident recovery, agent orchestration, memory/skill extraction, or evaluation loops.

This research added **10 original prompts** focused on those gaps. They are implementations of researched techniques, not copied prompt text. The additions preserve the existing schema and are mirrored into both `data/prompts.json` and `public/prompts.json`.

## Repository intelligence and gap analysis

Observed before editing:

- Existing corpus: 2,084 records; 14 inferred categories documented in `README.md`.
- Existing record shape: `id`, `title`, `prompt`, `category`, `tags`, `characters`, `words`; no provenance field exists in the established schema.
- Validation: `npm run validate` checks array shape, required fields, unique IDs, non-empty titles/bodies, and tag arrays.
- API import validation checks required identity/content fields and unique IDs; PostgreSQL does not currently have a provenance column.
- Duplicate protection before this change was primarily unique IDs; the addition script adds a token-Jaccard semantic-duplicate guard for the new candidates.
- Existing strengths: broad coverage, client search/filtering, deterministic IDs for generated prompts, API validation, and a human-reviewed publishing path.

| Existing library gap | Researched technique | Prompt added |
|---|---|---|
| Generic research prompts without claim-level evidence discipline | Primary-source retrieval, claim decomposition, conflict reconciliation | Evidence-First Deep Researcher |
| Code review prompts that do not force adversarial disproof or evidence status | Adversarial evaluation and uncertainty separation | Adversarial Code Review Gate |
| Coding prompts that omit inspect/implement/test/verify gates | Verification-first bounded execution | Verification-First Coding Agent |
| Limited operational recovery and incident structure | Hypothesis ranking, safe containment, stop conditions | Production Incident Triage Commander |
| No migration safety/rollback planning specialization | Expand-and-contract, preflight, backfill, abort gates | Safe Database Migration Planner |
| Little agent decomposition/routing guidance | Orchestrator-worker decomposition with output contracts | Agent Task Decomposer and Router |
| No explicit tool-risk and authorization workflow | Tool selection, side-effect classification, post-mutation verification | Tool Selection and Action Safety Gate |
| No durable-learning extraction prompt | Memory/procedure separation and evidence-backed skill promotion | Memory and Skill Extraction Reviewer |
| No reusable evaluator-optimizer loop | Rubric scoring, targeted revision, regression check | Evaluator-Optimizer Refinement Loop |
| Limited decision support under uncertainty | Reversible experiments, assumptions, kill/continue criteria | Decision Memo with Reversible Experiments |

## Research coverage

Investigated high-signal material across:

- Anthropic engineering guidance on composable agent workflows, prompt chaining, routing, parallelization, tool interfaces, and evaluator-optimizer loops.[1]
- OpenAI prompting guidance on explicit instructions, tool-use planning, progress tracking, and reasoning-model differences.[2]
- OpenAI Structured Outputs guidance on schema-constrained responses, refusal handling, and application-level validation.[3]
- Google Gemini Structured Outputs guidance on typed extraction/classification, agentic workflow inputs, schema descriptions, and semantic validation.[4]
- Microsoft Foundry prompting guidance on prompt components, grounding context, “out” paths when evidence is absent, and space efficiency.[5]
- Public GitHub prompt collections and prompt-library indexes, including code-review, agentic coding, research-agent, and evaluation examples. These were used for discovery and comparison, not verbatim redistribution.
- arXiv search results covering prompt design, reflection/introspection, prompt evolution, and auditable agent harnesses. These informed technique selection but were not copied into the corpus.

## Funnel and scoring

| Stage | Count |
|---|---:|
| Candidates discovered | 29 |
| Candidates evaluated | 18 |
| Shortlisted | 12 |
| Semantic/exact duplicates rejected | 2 |
| Low-quality or underspecified candidates rejected | 0 |
| Accepted and implemented | 10 |

Candidates were scored 1–5 for Utility, Reusability, Novelty, Specificity, Reliability, and Adaptability. Acceptance threshold was 24/30; all accepted prompts met or exceeded it.

| Prompt | U | R | N | S | Rel | A | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Evidence-First Deep Researcher | 5 | 5 | 4 | 5 | 5 | 5 | **29** |
| Adversarial Code Review Gate | 5 | 5 | 4 | 5 | 5 | 4 | **28** |
| Verification-First Coding Agent | 5 | 5 | 4 | 5 | 5 | 5 | **29** |
| Production Incident Triage Commander | 5 | 5 | 5 | 5 | 5 | 4 | **29** |
| Safe Database Migration Planner | 5 | 5 | 4 | 5 | 5 | 4 | **28** |
| Agent Task Decomposer and Router | 5 | 5 | 5 | 5 | 4 | 5 | **29** |
| Tool Selection and Action Safety Gate | 5 | 5 | 5 | 5 | 5 | 5 | **30** |
| Memory and Skill Extraction Reviewer | 5 | 5 | 5 | 5 | 4 | 5 | **29** |
| Evaluator-Optimizer Refinement Loop | 5 | 5 | 4 | 5 | 5 | 5 | **29** |
| Decision Memo with Reversible Experiments | 5 | 5 | 4 | 5 | 5 | 4 | **28** |

## Top 10 additions

1. **Tool Selection and Action Safety Gate** — turns tool use into an explicit risk and authorization decision rather than an unbounded call loop.
2. **Verification-First Coding Agent** — connects implementation to observable acceptance checks and honest failure reporting.
3. **Evidence-First Deep Researcher** — makes claim-level provenance and unresolved uncertainty first-class outputs.
4. **Production Incident Triage Commander** — provides safe containment and hypothesis-driven recovery structure.
5. **Memory and Skill Extraction Reviewer** — prevents temporary task state and unverified claims from becoming durable memory.
6. **Agent Task Decomposer and Router** — gives each delegated unit an owner, boundary, output contract, and acceptance test.
7. **Evaluator-Optimizer Refinement Loop** — forces measurable improvement and regression checking rather than cosmetic rewriting.
8. **Adversarial Code Review Gate** — asks the reviewer to try to disprove the change with concrete counterexamples.
9. **Safe Database Migration Planner** — covers compatibility, backfill, irreversible points, and abort criteria.
10. **Decision Memo with Reversible Experiments** — improves decisions by identifying information-gathering experiments and kill criteria.

## New techniques captured

- Claim decomposition and claim-to-evidence ledgers.
- Primary-source preference and conflict reconciliation.
- Adversarial review separated from implementation.
- Inspect → plan → implement → test → re-read → verify execution loops.
- Facts/inferences/unknowns separation.
- Side-effect classification and authorization gates for tools.
- Orchestrator-worker routing with explicit acceptance contracts.
- Evidence-backed promotion of memories and reusable skills.
- Rubric-based evaluator-optimizer refinement with regression checks.
- Reversible experiments for uncertain decisions.
- Expand-and-contract database migration planning and explicit irreversible points.

## Provenance and licensing

The sources above were used to identify techniques and patterns. The ten corpus entries were written from scratch for this repository; no substantial source prompt was copied. Official documentation was preferred where available. The report retains source URLs and numbered citations so the research basis is auditable. Because the repository schema has no provenance field, per-prompt provenance is recorded here rather than silently changing the public/API data contract.

## Validation

Commands run for this change:

- `node scripts/add-researched-prompts.mjs` — added 10 records and rejected any new candidate with token-Jaccard similarity ≥ 0.45 against the existing corpus.
- `npm run validate` — **PASS**; validated 2,094 prompts, 2,094 unique IDs, and 16 categories.
- `npm run build` — **PASS**; Next.js compiled, typechecked, and generated all static pages. It emitted a pre-existing multiple-lockfile workspace-root warning.
- `npm test` in `api/` — **BLOCKED** before test execution because `TEST_DATABASE_URL` is not set; the suite intentionally refuses to guess or fall back to `DATABASE_URL`.
- Mirror/derivation check — **PASS**; `data/prompts.json` and `public/prompts.json` contain identical 2,094-record arrays, and the ten new records have matching character/word counts.

The branch was created from the repository's current `HEAD` without modifying `main`. The working tree already contained unrelated modifications before this mission; they were preserved and are not part of the research changes.

## Remaining research opportunities

- Add first-class provenance/license fields only through a separately reviewed schema migration.
- Add machine-readable quality scores and evaluation fixtures if the repository wants runtime ranking.
- Build benchmark cases for the new prompts across multiple model families.
- Research multimodal, accessibility, legal/compliance, education, and localization prompt gaps.
- Add a canonical near-duplicate detector to CI rather than limiting detection to ingestion scripts.

## Sources

[1] Anthropic, “Building effective agents,” https://www.anthropic.com/engineering/building-effective-agents
[2] OpenAI, “Prompt engineering,” https://developers.openai.com/api/docs/guides/prompt-engineering
[3] OpenAI, “Structured model outputs,” https://developers.openai.com/api/docs/guides/structured-outputs
[4] Google AI for Developers, “Structured outputs,” https://ai.google.dev/gemini-api/docs/structured-output
[5] Microsoft Learn, “Prompt engineering techniques,” https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/prompt-engineering
