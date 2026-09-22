# Personas — Maister Viewer VS Code Extension

## TL;DR
There is no reader/writer separation: every contributor is a contributor on their own tasks and a reader of everyone else's, through one identical reading experience.
People differ by **workflow affinity**, not role capability — Marek (engineering: development, migrations), Ada (business: product-design, research), Irena (delivery lead: portfolio oversight).
Marek builds *through* Maister rather than by typing code, which promotes live monitoring from a background convenience to his primary working surface.
Irena adds cross-task aggregation and staleness signalling — the second-largest scope driver after search.
Task attribution comes from git authorship of the task directory, because Maister stores no author field.

## Key Decisions
- No separate reading mode for others' tasks vs. your own — ownership determines *which* tasks you look at, not *how* you read them.
- Personas are differentiated by workflow affinity rather than by read/write role, correcting the operator/reader split drafted in Phase 2.
- Live monitoring is a first-class surface, not a peripheral one, because coding happens through Maister rather than by hand.
- Staleness is expressed observably ("quiet for 3 days") rather than interpreted ("abandoned"), honouring the never-assert-what-you-cannot-observe constraint.

## Open Questions / Risks
- Irena's portfolio view requires cross-task aggregation that Maister provides no support for — every roll-up must be computed by globbing and parsing, compounding the indexing cost already driven by search.
- Maister writes `task.status: completed` only at finalization, so interrupted tasks remain `in_progress` indefinitely; the portfolio view cannot distinguish abandoned from long-running without inference.
- Throughput and duration metrics depend on `created`/`updated` and per-phase `started`/`completed` timestamps being written correctly; these are model-authored and may be missing or malformed in older tasks.
- Ada's needs assume Maister's HTML companions exist, but `html_output: false` removes them entirely — her experience degrades to markdown-only in that configuration.
- Git-derived attribution fails for tasks never committed, and attributes to whoever committed rather than whoever ran the workflow.

---

## Framing: One Role, Two Situations

The design does **not** split users into readers and writers. Every person is both:

- A **contributor** on tasks they run themselves.
- A **reader** on tasks everyone else ran — including other engineers' tasks when you are an engineer.

What actually differentiates people is which *workflow types* they live in. A business-oriented contributor gravitates to `product-design` and `research`; an engineering-oriented one to `development` and `migrations`. This makes **workflow type the primary filtering lens**, and ownership a secondary one.

Crucially, reading someone else's task requires **no different view** from reading your own. There is one reading experience.

---

## Persona 1 — Marek, the Engineering Contributor

**Role.** Senior developer who builds through Maister rather than by typing code. He drives `development` and `migrations` workflows from Claude Code in VS Code's integrated terminal. His craft is framing the task, judging the agent's output, and deciding what to accept. Hand-editing source is the exception, not the routine.

**Goals**
- Follow a running workflow closely — which phase is live, what decision just landed, which artifact just appeared. This is his primary activity, not a background glance.
- Reach the spec, implementation plan, and verification verdict immediately, because judging them is the job.
- Re-launch or resume workflows without recalling exact `/maister:*` invocations and task paths.
- Recover what a past task concluded when related work comes back around.

**Pain points**
- The file explorer gives him twenty files per task with no signal about which is current or which matters.
- The artifacts he most needs to evaluate — verification reports, plans, specs — are buried deepest in the tree.
- While a workflow runs he is effectively blind between terminal messages; the state on disk is richer than what scrolls past.
- Hundreds of accumulated tasks make "that migration from two months ago" a guessing game at folder names.
- Opening a `.html` report shows him markup instead of the report.

**Key journey**
1. Frames a task and launches the workflow from the terminal (or from the plugin, which sends the command there).
2. Turns to the plugin, which becomes his working surface for the duration of the run.
3. Follows phases completing and decisions landing in near-real-time via file watching.
4. Verification finishes with warnings.
5. Opens the verification report **rendered**, reads the issues, clicks through to the relevant spec section.
6. Judges whether to accept; returns to the terminal to answer the gate.

**What he needs from the design:** live phase state with genuine freshness; direct access to hero artifacts per task type; rendered reading; fast recall across hundreds of tasks; workflow launching.

---

## Persona 2 — Ada, the Business-Oriented Contributor

**Role.** Product/business analyst who runs her own Maister workflows — `product-design` and `research` both. She reads `development` and `migrations` tasks that others produced. She works in VS Code *because the plugin is there*, not to write code.

**Goals**
- Drive her own product-design and research workflows and see briefs, personas, alternatives, decisions and research reports as documents rather than files.
- Understand what engineering-side work concluded — decisions and risks — without reading code or git.
- Recover the reasoning behind a past decision when it is questioned later.
- Know what is worth reading among hundreds of tasks.

**Pain points**
- A task directory is meaningless to her; `analysis/` / `implementation/` / `verification/` is not a vocabulary she should have to learn.
- Maister's HTML reports are precisely what she wants, and the editor renders them as source code.
- She cannot tell which tasks are hers, which are live, or which ended badly.
- No sense of recency or significance across the task history.

**Key journey**
1. Opens VS Code in the morning.
2. The plugin lists tasks filterable by type, her product-design and research work surfacing first by affinity.
3. Notices a colleague's development task finished yesterday.
4. Opens it and reads the TL;DR and Key Decisions **rendered**.
5. Drills into the full report where a decision surprises her.
6. Later launches her own research workflow from the plugin, which sends the command to the terminal.

**What she needs from the design:** zero exposure to directory structure; rendered documents as the default and only reading mode; the § 7 summary block surfaced prominently as the entry point to any artifact; recency and type-based orientation; her own workflow launching.

---

## Persona 3 — Irena, the Delivery Lead

**Role.** Accountable for the stream of work rather than any single task. Does not run `development` workflows herself (occasionally kicks off `research`), but owns the question of whether the team is delivering. Reads far more than she writes.

**Goals**
- See the whole portfolio at once: what is in flight, what completed, what stalled halfway and was never finished.
- Spot trouble without being told — failed verifications, unresolved risks, tasks abandoned mid-phase.
- Understand throughput and where time goes — which workflow types dominate, how long phases actually take.
- Drill from an aggregate signal straight into the specific artifact that explains it.

**Pain points**
- There is no view above the individual task; every answer today requires opening tasks one at a time.
- Abandoned tasks are indistinguishable from active ones — Maister writes `completed` only at finalization, so anything interrupted sits in `in_progress` forever.
- Risks and failed verifications are recorded faithfully inside each task and are invisible in aggregate.
- She has no way to see who is working on what without asking.

**Key journey**
1. Opens the plugin to a portfolio view.
2. Sees counts by status and type — two tasks live, one quiet for three days.
3. Notices a development task carrying a failed verification verdict.
4. Opens it, reads the verification report rendered, sees the unresolved risks.
5. Identifies the owner via git attribution.
6. Raises it at standup with the specific decision in hand.

**What she needs from the design:** cross-task aggregation and roll-ups; staleness as a first-class, observably-stated signal; verification outcome as filterable metadata; attribution; a path from aggregate straight to artifact.

---

## Cross-Persona Requirements

Requirements that emerge from more than one persona, and therefore carry the most weight:

| Requirement | Marek | Ada | Irena |
|---|---|---|---|
| Rendered artifact reading (never source) | ✔ | ✔✔ | ✔ |
| Live phase state with real freshness | ✔✔ | ✔ | ✔ |
| Filter by workflow type | ✔ | ✔✔ | ✔ |
| Fast recall across hundreds of tasks | ✔✔ | ✔ | ✔ |
| § 7 summary block (TL;DR / Decisions / Risks) surfaced | ✔ | ✔✔ | ✔✔ |
| Verification outcome visible and filterable | ✔✔ | — | ✔✔ |
| Cross-task aggregation / portfolio roll-up | — | ✔ | ✔✔ |
| Staleness signalling | ✔ | — | ✔✔ |
| Git-derived attribution | ✔ | ✔ | ✔✔ |
| Workflow launching from the UI | ✔✔ | ✔✔ | ✔ |
| No exposure to task directory structure | ✔ | ✔✔ | ✔ |

(✔✔ = central to that persona, ✔ = valuable, — = not a driver.)

**The universal floor:** rendered reading, workflow-type filtering, and the § 7 summary block serve all three. Any design that fails these fails everyone.
