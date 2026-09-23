import { strict as assert } from 'node:assert';
import { runNextAction, startWorkflow } from '../../src/launch/launch.ts';
import { LAUNCH } from '../../src/strings.ts';
import { fakeHost } from '../helpers/launchHost.ts';

const TASK = {
  relPath: '.maister/tasks/development/2026-01-01-a',
  title: 'Auth token rotation',
  action: 'resume' as const
};

function untrusted(): ReturnType<typeof fakeHost> {
  const host = fakeHost({ order: ['clipboard'] });
  return Object.assign(host, { isTrusted: () => false });
}

describe('launchGate/unit', () => {
  it('refuses both launch flows in an untrusted workspace, reaching no target at all (AC15, A2.2)', async () => {
    const forNextAction = untrusted();
    await runNextAction(TASK, forNextAction);
    assert.deepEqual(forNextAction.copied, [], 'an untrusted workspace still reached the clipboard');
    assert.deepEqual(forNextAction.executed, [], 'an untrusted workspace still executed a command');
    assert.deepEqual(forNextAction.createdTerminals, [], 'an untrusted workspace still opened a terminal');
    assert.deepEqual(forNextAction.logs, [LAUNCH.logUntrusted], 'the refusal was not logged');

    const forStartWorkflow = untrusted();
    let picked = false;
    const withPick = Object.assign(forStartWorkflow, {
      pick: async () => {
        picked = true;
        return undefined;
      }
    });
    await startWorkflow(withPick);
    assert.equal(picked, false, 'Start Workflow prompted for a type in an untrusted workspace');
    assert.deepEqual(forStartWorkflow.copied, []);
    assert.deepEqual(forStartWorkflow.logs, [LAUNCH.logUntrusted]);
  });

  it('dispatches only the action the host recomputed, and nothing at all when there is none (§ 7.2, A2)', async () => {
    const none = fakeHost({ order: ['clipboard'] });
    await runNextAction({ ...TASK, action: 'none' }, none);
    assert.deepEqual(none.copied, [], 'a task with no next action still launched something');
    assert.deepEqual(none.statuses, [LAUNCH.noNextAction], 'no visible outcome for a task with no action');

    const resume = fakeHost({ order: ['clipboard'] });
    await runNextAction(TASK, resume);
    assert.deepEqual(
      resume.copied,
      [`/maister:work ${TASK.relPath}`],
      'the composed command is not the one § 7.2 derives from the task'
    );
  });
});
