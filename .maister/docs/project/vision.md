# Project Vision


## Problem Statement
Maister produces well-structured output in both HTML and JSON. Currently, people with a more analytical profile, who prefer working with visual formats, could also be involved in development work. Changes are also produced very quickly. It would be valuable to review and filter them based on the AI framework's outputs, rather than code and git.

## Target Users
Modern era analythics-developers using Visual Studio Code who want a productivity boost without leaving their editor and diving into a code.

## Key Features
- focus on visual access to all flows and artifacts created by Maister,
- browser of completed tasks with ability to search and filter,
- Top layer view over all Maister tasks.

Repository and git-change browsing is deliberately **out of scope**: git is used only to
attribute a task to whoever first committed its state file.

## Success Criteria
1. **Live answer without leaving the editor.** "What is my task doing?" is answered from the sidebar.
2. **Rendered, always.** No artifact is ever shown as source through the extension's own navigation.
3. **Recall in seconds.** A task or past decision is found among hundreds without the file explorer or grep.
4. **Honest state.** Nothing is displayed that can't be justified from files on disk.

## Differentiators
- To be defined as the feature set takes shape.

---
*Status*: First extension — Maister Lens — implemented. Key feature 3 and the success criteria were corrected at its finalization (spec amendment A11); this vision will be refined further as scope grows.
