import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The AC7/AC9 performance set (A10): realistic task folders written into a temp directory at
 * run time and never committed. Every folder carries the state file, two registered artifacts
 * and a recorded decision and risk, so the index does the same parsing, statting and
 * summary-reading work it does over a real working copy.
 */

export interface GeneratedTasks {
  readonly root: string;
  readonly count: number;
  /** A decision phrase present in exactly one task — the AC7 search needle. */
  readonly needle: string;
  dispose(): void;
}

const WORKFLOWS = ['development', 'product-design', 'research', 'migration', 'performance'];
const STATUSES = ['in_progress', 'completed', 'pending', 'blocked', 'failed'];
const VERDICTS = ['passed', 'passed_with_issues', 'failed'];
const DAY_MS = 24 * 60 * 60 * 1000;
const NEEDLE = 'Pin the connection pool to the read replica';

function stateFile(index: number, created: Date, updated: Date): string {
  const workflow = WORKFLOWS[index % WORKFLOWS.length];
  const status = STATUSES[index % STATUSES.length];
  const verdict = VERDICTS[index % VERDICTS.length];
  return [
    'task:',
    `  title: Generated task ${index}`,
    `  status: ${status}`,
    `  description: a generated ${workflow} task used only to measure index and query cost`,
    '  tags:',
    `    - ${workflow}`,
    `  created_at: ${created.toISOString()}`,
    `  updated_at: ${updated.toISOString()}`,
    'orchestrator:',
    '  started_phase: phase-3',
    '  completed_phases:',
    '    - phase-1',
    '    - phase-2',
    'verification:',
    `  verdict: ${verdict}`,
    'task_context:',
    '  phase_summaries:',
    '    specification:',
    `      summary: generated summary for task ${index}`,
    '      decisions:',
    `        - decision: ${index === 0 ? NEEDLE : `Keep decision ${index} in the state file`}`,
    '          rationale: recorded at the phase gate',
    '      risks:',
    `        - Risk ${index} is recorded as text only, with no severity and no date`,
    '      artifacts:',
    '        - path: implementation/spec.md',
    '          label: Specification',
    '        - path: implementation/implementation-plan.md',
    '          label: Implementation Plan',
    ''
  ].join('\n');
}

function artifact(index: number, label: string): string {
  return [
    `# ${label} ${index}`,
    '',
    '## 7. Summary',
    '',
    '**TL;DR**: a generated artifact head, read by the index for its summary block.',
    '',
    '### Key decisions',
    '',
    `- Keep artifact decision ${index} in the document`,
    '',
    '### Open questions & risks',
    '',
    `- Artifact risk ${index} stays open`,
    ''
  ].join('\n');
}

/** Writes `count` task folders spread over the last two years of activity. */
export function generateTasks(count: number): GeneratedTasks {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maister-lens-perf-')));
  const now = Date.now();

  for (let index = 0; index < count; index += 1) {
    const created = new Date(now - (count - index) * 2 * DAY_MS);
    const updated = new Date(now - (index % 40) * DAY_MS);
    const dir = path.join(
      root,
      '.maister',
      'tasks',
      WORKFLOWS[index % WORKFLOWS.length],
      `${created.toISOString().slice(0, 10)}-generated-task-${index}`
    );
    fs.mkdirSync(path.join(dir, 'implementation'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'orchestrator-state.yml'),
      stateFile(index, created, updated),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'implementation', 'spec.md'),
      artifact(index, 'Specification'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'implementation', 'implementation-plan.md'),
      artifact(index, 'Implementation Plan'),
      'utf8'
    );
    fs.utimesSync(path.join(dir, 'orchestrator-state.yml'), updated, updated);
  }

  return {
    root,
    count,
    needle: NEEDLE,
    dispose: () => fs.rmSync(root, { recursive: true, force: true })
  };
}
