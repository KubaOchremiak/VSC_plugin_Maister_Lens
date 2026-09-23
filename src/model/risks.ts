import type { CollectedRisk, Task } from './types.ts';

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * A5 — the one definition of a task's risks: the state file's risks plus every registered
 * artifact's § 7 risks, deduplicated per task on normalized text with the artifact winning
 * as `source`. Every surface that shows a risk count reads this, so the number always
 * equals the number of rows a click reveals (AC18).
 */
export function collectRisks(task: Task): CollectedRisk[] {
  const byText = new Map<string, CollectedRisk>();

  for (const risk of task.risks) {
    const key = normalize(risk.text);
    if (!byText.has(key)) {
      byText.set(key, { ...risk, sourceKind: 'state', folderUri: task.ref.folderUri });
    }
  }

  for (const artifact of task.artifacts) {
    for (const risk of artifact.summary?.risks ?? []) {
      const key = normalize(risk.text);
      const existing = byText.get(key);
      if (existing !== undefined && existing.sourceKind === 'artifact') {
        continue;
      }
      byText.set(key, {
        ...risk,
        source: artifact.relPath,
        sourceKind: 'artifact',
        folderUri: task.ref.folderUri
      });
    }
  }

  return [...byText.values()];
}

export function openRiskCount(task: Task): number {
  return collectRisks(task).filter((risk) => !risk.resolved).length;
}
