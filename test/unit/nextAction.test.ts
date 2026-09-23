import { strict as assert } from 'node:assert';
import { nextActionCommand } from '../../src/launch/launch.ts';
import { deriveNextAction } from '../../src/model/workflows.ts';
import type { TaskStatus, WorkflowType } from '../../src/model/types.ts';

const TYPES: readonly WorkflowType[] = [
  'development',
  'product-design',
  'research',
  'migration',
  'performance'
];

const UNFINISHED: readonly TaskStatus[] = ['in_progress', 'pending', 'blocked', 'failed'];

describe('nextAction/unit', () => {
  it('follows the § 7.2 table for every task state (AC12)', () => {
    for (const type of TYPES) {
      for (const status of UNFINISHED) {
        assert.equal(
          deriveNextAction(type, status, false).id,
          'resume',
          `${type}/${status} is unfinished and must offer Resume`
        );
      }
    }

    assert.equal(deriveNextAction('product-design', 'completed', true).id, 'startDevelopment');
    assert.equal(
      deriveNextAction('product-design', 'completed', false).id,
      'none',
      'a completed design without outputs/product-brief.md has no next action'
    );

    assert.equal(deriveNextAction('research', 'completed', false).id, 'fromResearch');
    assert.equal(
      nextActionCommand({
        action: 'fromResearch',
        relPath: '.maister/tasks/research/2026-01-02-caching',
        research: { kind: 'design', description: 'Design the cache layer' }
      }),
      '/maister:product-design Design the cache layer --research=.maister/tasks/research/2026-01-02-caching'
    );
    assert.equal(
      nextActionCommand({
        action: 'fromResearch',
        relPath: '.maister/tasks/research/2026-01-02-caching',
        research: { kind: 'develop', description: 'Build the cache layer' }
      }),
      '/maister:development Build the cache layer --research=.maister/tasks/research/2026-01-02-caching'
    );

    for (const type of ['development', 'migration', 'performance'] as const) {
      assert.equal(deriveNextAction(type, 'completed', false).id, 'none', `${type} completed`);
      assert.equal(deriveNextAction(type, 'unknown', false).id, 'none', `${type} unreadable`);
    }
    assert.equal(nextActionCommand({ action: 'none', relPath: 'x' }), null);
  });

  it('composes Resume as /maister:work {relPath} for all five types (AC12, A7)', () => {
    const paths: Record<WorkflowType, string> = {
      development: '.maister/tasks/development/2026-01-01-a',
      'product-design': '.maister/tasks/product-design/2026-01-01-b',
      research: '.maister/tasks/research/2026-01-01-c',
      migration: '.maister/tasks/migrations/2026-01-01-d',
      performance: '.maister/tasks/performance/2026-01-01-e',
      unknown: '.maister/tasks/unknown/2026-01-01-f'
    };

    for (const type of TYPES) {
      const relPath = paths[type];
      const command = nextActionCommand({ action: 'resume', relPath });
      assert.equal(command, `/maister:work ${relPath}`, `${type} composed ${String(command)}`);
      assert.ok(
        !/^\/maister:(development|product-design|research|migration|performance)\b/.test(command ?? ''),
        'Resume must never compose /maister:{type}'
      );
    }

    assert.equal(
      nextActionCommand({ action: 'startDevelopment', relPath: paths['product-design'] }),
      `/maister:development ${paths['product-design']}`
    );
  });
});
