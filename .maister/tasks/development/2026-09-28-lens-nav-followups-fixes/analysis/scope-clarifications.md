# Scope Clarifications (Phase 2)

## TL;DR
All recommended options accepted: rename every Risks entry point to Follow-ups, parse dashboard-data.js safely, completed tasks only, fields + narrow phrase for deferred items, show a message on refused navigation, group by task.

## Key Decisions
- Entry points: rename maister.openRisks command, Now tree node and 'risks' panel mode to Follow-ups (no backward compatibility)
- dashboard-data.js: strip the `window.MAISTER_DATA =` prefix, parse with yaml, skip on failure, never execute
- Scope: completed tasks only
- Deferred detection: explicit fields (e2e_followup) + narrow "defer…follow-up" phrase match
- Refused navigate: show a VS Code warning message
- Grouping: by task, collapsible (fixed expander)
- Risks remain searchable in Tasks search (unchanged default)
