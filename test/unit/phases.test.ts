import { strict as assert } from 'node:assert';
import { derivePhases } from '../../src/model/parseState.ts';
import { workflowForType } from '../../src/model/workflows.ts';

describe('phases', () => {
  it('derives § 2.4 statuses from completed phases, the registry and the task status', () => {
    // Gaps below the highest completed phase are not_recorded, never guessed as skipped.
    const gapped = derivePhases('development', ['phase-1', 'phase-2', 'phase-5'], 'in_progress');
    assert.deepEqual(
      gapped.slice(0, 7).map((p) => [p.id, p.status]),
      [
        ['phase-1', 'completed'],
        ['phase-2', 'completed'],
        ['phase-3', 'not_recorded'],
        ['phase-4', 'not_recorded'],
        ['phase-5', 'completed'],
        ['phase-6', 'current'],
        ['phase-7', 'upcoming']
      ]
    );
    assert.equal(gapped.filter((p) => p.status === 'current').length, 1);

    // The first phase above the maximum is current only for an unfinished status.
    for (const status of ['in_progress', 'pending', 'blocked'] as const) {
      assert.equal(
        derivePhases('development', ['phase-1'], status).find((p) => p.status === 'current')?.id,
        'phase-2',
        status
      );
    }
    for (const status of ['completed', 'failed', 'unknown'] as const) {
      assert.equal(
        derivePhases('development', ['phase-1'], status).some((p) => p.status === 'current'),
        false,
        status
      );
    }

    // A completed task has no current phase even when phases are missing.
    assert.equal(
      derivePhases('research', ['phase-1', 'phase-2'], 'completed').some((p) => p.status === 'current'),
      false
    );

    // product-design starts at phase 0; every other workflow starts at phase 1.
    assert.equal(derivePhases('product-design', [], 'in_progress')[0].id, 'phase-0');
    assert.equal(derivePhases('product-design', [], 'in_progress')[0].status, 'current');
    for (const type of ['development', 'research', 'migration', 'performance'] as const) {
      assert.equal(derivePhases(type, [], 'in_progress')[0].id, 'phase-1', type);
    }

    // Registry shape is the pinned Maister 2.2.3 table.
    assert.equal(workflowForType('development')?.phases.length, 14);
    assert.equal(workflowForType('product-design')?.phases.length, 9);
    assert.equal(workflowForType('research')?.phases.length, 6);
    assert.equal(workflowForType('migration')?.phases.length, 8);
    assert.equal(workflowForType('migration')?.dirSegment, 'migrations');
    assert.equal(workflowForType('performance')?.phases.length, 9);
    const twelve = workflowForType('development')?.phases.find((p) => p.n === 12);
    assert.equal(twelve?.activeForm, 'Running E2E tests');
    assert.equal(twelve?.icon, 'verify');
  });
});
