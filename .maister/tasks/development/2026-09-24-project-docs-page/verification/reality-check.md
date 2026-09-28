## TL;DR
Status: Issues Found (GO after one small fix). Project page, sidebar row under Dashboard, grouped doc shortcuts, rendered reader and "← Project" back button all exist and are tested.
All suites green: check 62 unit, test:dom 29, test:integration 47 + 1 passing.
TL;DR does pull real text from this repo's INDEX.md, but Tech Stack also shows the trailing "*Not initialized…*" note and a literal "---".
Goal text reads as a description of vision.md ("Problem statement, target users…"), not a statement of what the app is.

## Evidence
- Ran `parseProjectIndex` on the real `.maister/docs/INDEX.md`:
  - goal = "Problem statement, target users and key features for VSC_Maister_plugin, whose first shipped extension is Maister Lens — a read-only view layer…", source project/vision.md
  - techStack = "Technology choices as shipped: TypeScript … via `vsce`.\n\n*Not initialized for this project: roadmap.md, architecture.md. …*\n\n---"
- Sidebar: `src/views/navTree.ts` returns Dashboard and then Project (`maister.openProject`), and an integration test covers it.
- Back button: `PROJECT.back = '← Project'` in `src/strings.ts`, and readerDoc DOM specs pass.

## Issues
1. High | src/model/parseProjectDocs.ts `parseProjectIndex`/`entryText` | The entry body runs until the next heading, so non-heading lines are swallowed: the italic "Not initialized" note and the `---` rule end up in the Tech Stack TL;DR on this repo. Fixable (quick: stop at `---` and at lines wrapped in `*…*`, or take only the first paragraph). Add a unit test that uses the real INDEX.md shape.
2. Medium | src/model/parseProjectDocs.ts (goal source) | The goal is the INDEX.md description *of* vision.md, not the project goal. It is usable but awkward ("Problem statement, target users and key features for…"). Fixable: take the first paragraph of the Problem/Vision section in project/vision.md, or keep the current text as a fallback.
3. Low | test/unit/parseProjectDocs.test.ts | The tests use synthetic fixtures, which is why issue 1 was missed. Fixable.
