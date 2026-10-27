> Historical architecture setup snapshot, before GOAL 008. For GOAL 009 use baseline `f7fdda3e75a1d93b053da2e5ad941618547793da`, `docs/GOAL-008.md`, and current source. The original report is retained as history.

# Assigning and integrating specialist work

## Persistent definitions and runtime capabilities

| Role | Definition | Default scope |
| --- | --- | --- |
| Gameplay Engineer | [gameplay_engineer.toml](../.codex/agents/gameplay_engineer.toml) | Core simulation, movement, tennis, AI and input |
| Character & Graphics Engineer | [character_graphics_engineer.toml](../.codex/agents/character_graphics_engineer.toml) | PlayCanvas, characters, GLB/rigs, animation and presentation |
| Mobile Performance Engineer | [mobile_performance_engineer.toml](../.codex/agents/mobile_performance_engineer.toml) | Measured browser/device, loading, frame, CPU/GPU and memory work |
| QA & Regression Engineer | [qa_regression_engineer.toml](../.codex/agents/qa_regression_engineer.toml) | Targeted regression plans, tests, evidence and release reporting |

These are native standalone Codex TOML definitions with `name`, `description`
and `developer_instructions`. They contain the role instructions once; there is
no duplicate `agents/` directory or external orchestrator. Definitions and
knowledge persist in Git once approved and committed. Agent processes and their
conversation state are not guaranteed to persist between sessions.

`.codex/config.toml` enables on-demand agents and caps concurrent spawned threads
at four (excluding the coordinator). It does not spawn anything, set models,
raise reasoning effort, change permissions, install tools or schedule work.
Host-level limits and applicable instructions still apply. The current hosted
collaboration tool has its own session limits; do not assume the CLI config
reconfigures an already-running hosted session.

The [official Codex subagent documentation](https://developers.openai.com/codex/multi-agent)
describes project-scoped `.codex/agents/*.toml`. Check the installed client's
schema before copying older `[agents.<role>]` examples or obsolete flags.

## How to activate a role

**This hosted session:** native collaboration spawn/message/result tools were
actually used for a bounded read-only graphics audit. The specialist subsequently
read and adopted the persisted `character_graphics_engineer` profile and checked
its asset findings. This verifies coordinator-directed role use. The available
spawn API has task/instruction arguments, not a custom-role selector: the
coordinator must explicitly load the selected TOML instructions into the task.
Do not claim automatic custom-role selection in this host.

**New Codex CLI/app session:** open the repository root in a client supporting
standalone custom agents, trust the project through that client's normal project
trust mechanism, and start/reload the session so it discovers the definitions.
Confirm the four role names are available before relying on automatic dispatch.
Use the user's existing working Codex authentication. No API key or paid service
is introduced by these files.

The inspected CLI is `codex-cli 0.163.0`; its multi-agent feature is enabled.
Its app-server config check reported this fresh checkout untrusted, so the
project config layer was disabled. A second strict-config check supplied four
explicit role-file references as process-only overrides: config readback accepted
all four names/paths and the four-thread cap without requesting model inference.
This validates registration syntax, not automatic discovery or running all roles.
A separate CLI model-catalog refresh also
reported authentication unavailable; this does not prevent the active hosted
collaboration tools from working. Global trust and credentials were not changed.
Automatic CLI discovery and CLI model-backed specialist execution therefore
remain unverified until normal trust/authentication setup is complete. See
[the report](MULTI_AGENT_REPORT.md) for checks actually performed.

**Client without custom-agent support:** use one coordinator and adopt the chosen
role's instructions in the existing session. If its native delegation API is
available, explicitly pass those instructions to a bounded specialist. Otherwise
work sequentially as one agent and disclose that limitation. Markdown/TOML
presence is never evidence that a separate agent ran.

## Coordinator procedure for each GOAL

1. Read root `AGENTS.md`, [PROJECT_BASELINE](PROJECT_BASELINE.md) and the affected
   system maps. Check current branch/worktree status and relevant source changes.
2. State the intended behavior, preserved behavior, success conditions, relevant
   verification and unavailable checks. Resolve necessary unknowns from existing
   evidence; do not rescan the whole repository without cause.
3. Choose the smallest useful team. Isolated task: one agent. Cross-system task:
   coordinator plus one/two specialists. Four specialists only for independent
   work with concrete value; report substantial expected additional usage.
4. Assign bounded work using the template below. Establish dependencies and
   exclusive write ownership before starting agents. A read-only audit can run
   beside independent implementation; QA against a changing shared tree waits
   for integration or uses a pinned worktree.
5. For shared core-system edits, work sequentially or create separate Git
   worktrees/branches from the same baseline. Explicitly exchange commit IDs and
   let the coordinator integrate. In a shared filesystem, disjoint ownership is
   required; separate agent contexts do not isolate writes.
6. Specialists return evidence and focused diffs, not broad rewrites. Stop
   completed agents; no nested delegation, research loops or repeated reviews.
7. Coordinator inspects the combined diff, resolves conflicts, checks dependency
   contracts and updates only the affected knowledge map/history. Re-run tests
   when integration or new changes warrant it; do not repeat unchanged checks.
8. Report exact changes, checks, skips, device limitations and unresolved defects.
   Prepare a reviewable local branch/diff (or a draft PR when authorized). Final
   acceptance/merge/publication remains the user's decision.

## Bounded assignment template

```text
GOAL and role/profile:
Baseline commit and branch/worktree:
Outcome / acceptance criteria:
Relevant documents and entry points:
Task scope and explicit exclusions:
Allowed write files (or READ ONLY):
Shared-file owner / dependencies / sequencing:
Verification commands and manual checks:
Resource bound (attempts, scenarios, agents; no ongoing jobs):
Return: files/findings, evidence, exact results, limitations, integration notes.
```

Load the selected role's `developer_instructions` along with this task. Do not
copy the entire repository or all historical reports into each assignment.

## Ownership and check matrix

| Task | Typical assignment | Relevant verification |
| --- | --- | --- |
| Small docs/config edit | Coordinator only | TOML/links/diff checks; build when configuration could affect it |
| Mobile gesture bug | Gameplay; QA only if independent verification adds value | `npx vitest run tests/input.test.ts tests/shot-gesture.test.ts tests/lob-contact.test.ts`; relevant Playwright `touch`/`play` cases |
| Character integration | Graphics first; gameplay for contact contract, QA after integration | Asset/header/rig checks, `assets`/`hitting`/`tennis-physics`; Playwright `kira`/`tennis`/`visual`; device loading/visual acceptance |
| Frame/load regression | Performance with bounded baseline/candidate; graphics/gameplay only for demonstrated cause | Existing diagnostic export and relevant performance tests, reproducible browser/device scenario |
| Release readiness | Coordinator, optional QA | Existing `npm run check` requirements and affected physical-device/manual checks |

Browser examples: `npm run test:browser -- tests/browser/touch.spec.ts` or
`--project=mobile-webkit`; first build `dist`. Browser binaries/OS libraries must
be installed (CI already uses `npx playwright install --with-deps chromium webkit`).
Do not call emulation physical Safari validation. Record skipped tests separately.

Keep the existing GitHub Actions checks unchanged; targeted local checks do not
waive normal CI. For this infrastructure-only GOAL no browser test or hardware
result is claimed. A full scan/review is not a default prerequisite for the next GOAL.

## Recommended next assignment

Await the next user-defined GOAL; this setup starts no gameplay work. For a new
character integration GOAL, begin with one Graphics Engineer: inspect Nova's
release binary only if needed, compare source rigs and existing animation reuse,
then provide a concrete integration plan preserving quality. Add Gameplay only
if the calibrated contact contract changes; add QA after implementation.
For the currently unresolved simulation timeout, a separate QA-led GOAL can
investigate workload/environment repeatability before proposing any test change.
