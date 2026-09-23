import { strict as assert } from 'node:assert';
import {
  CLAUDE_CODE_EXTENSION_ID,
  CLAUDE_CODE_OPEN_COMMAND,
  COPILOT_CHAT_EXTENSION_ID,
  COPILOT_CHAT_OPEN_COMMAND,
  DEFAULT_TARGET_ORDER,
  dispatch,
  normalizeTargetOrder
} from '../../src/launch/launch.ts';
import { LAUNCH } from '../../src/strings.ts';
import { fakeHost, fakeTerminal } from '../helpers/launchHost.ts';

const COMMAND = '/maister:work .maister/tasks/development/2026-01-01-a';

describe('targetOrder/unit', () => {
  it('walks targetOrder, advances past a throwing target and always reaches the clipboard (§ 7.4)', async () => {
    const first = fakeHost({
      order: ['copilotChat', 'clipboard'],
      extensions: [COPILOT_CHAT_EXTENSION_ID],
      commands: [COPILOT_CHAT_OPEN_COMMAND]
    });
    assert.equal(await dispatch(COMMAND, first), 'copilotChat');
    assert.deepEqual(first.copied, [], 'the first available target did not end the chain');

    const throwing = fakeHost({
      order: ['copilotChat', 'clipboard'],
      extensions: [COPILOT_CHAT_EXTENSION_ID],
      commands: [COPILOT_CHAT_OPEN_COMMAND],
      execute: async () => {
        throw new Error('chat is closed');
      }
    });
    assert.equal(await dispatch(COMMAND, throwing), 'clipboard');
    assert.deepEqual(throwing.copied, [COMMAND]);
    assert.equal(throwing.logs.length, 1, 'the throwing target was not logged');
    assert.match(throwing.logs[0], /copilotChat/);
    assert.deepEqual(throwing.statuses, [LAUNCH.statusClipboard]);

    const terminal = fakeTerminal('claude');
    const terminalHost = fakeHost({ order: ['terminal'], terminals: [terminal] });
    assert.equal(await dispatch(COMMAND, terminalHost), 'terminal');
    assert.deepEqual(terminal.sent, [{ text: COMMAND, submit: false }]);

    for (const raw of [[], ['nonsense'], 'claudeCode', null, ['clipboard', 'clipboard']]) {
      const normalized = normalizeTargetOrder(raw);
      assert.deepEqual(
        normalized.order,
        [...DEFAULT_TARGET_ORDER],
        `${JSON.stringify(raw)} should fall back to the default order`
      );
      assert.ok(normalized.warning !== null, `${JSON.stringify(raw)} should warn`);
    }
    assert.deepEqual(normalizeTargetOrder(['terminal', 'clipboard']), {
      order: ['terminal', 'clipboard'],
      warning: null
    });

    const invalid = fakeHost({ order: 'claudeCode' });
    await dispatch(COMMAND, invalid);
    assert.equal(invalid.logs.length, 1, 'an invalid targetOrder was not warned about');
  });

  it('runs the A7 claudeCode chain: command, URI fallback, then the next target', async () => {
    const working = fakeHost({
      order: ['claudeCode', 'clipboard'],
      extensions: [CLAUDE_CODE_EXTENSION_ID],
      commands: [CLAUDE_CODE_OPEN_COMMAND]
    });
    assert.equal(await dispatch(COMMAND, working), 'claudeCode');
    assert.deepEqual(working.executed, [
      { id: CLAUDE_CODE_OPEN_COMMAND, args: [undefined, COMMAND] }
    ]);
    assert.deepEqual(working.opened, [], 'the URI fallback ran although the command worked');
    assert.deepEqual(working.statuses, [LAUNCH.statusClaudeCode]);

    const missingCommand = fakeHost({
      order: ['claudeCode', 'clipboard'],
      extensions: [CLAUDE_CODE_EXTENSION_ID],
      commands: [],
      uriScheme: 'vscode-insiders'
    });
    assert.equal(await dispatch(COMMAND, missingCommand), 'claudeCode');
    assert.deepEqual(missingCommand.opened, [
      `vscode-insiders://anthropic.claude-code/open?prompt=${encodeURIComponent(COMMAND)}`
    ]);
    assert.deepEqual(missingCommand.copied, [], 'the URI fallback did not end the chain');
    assert.deepEqual(missingCommand.statuses, [LAUNCH.statusClaudeCodeUri]);

    const throwingCommand = fakeHost({
      order: ['claudeCode', 'clipboard'],
      extensions: [CLAUDE_CODE_EXTENSION_ID],
      commands: [CLAUDE_CODE_OPEN_COMMAND],
      execute: async () => {
        throw new Error('signature changed');
      }
    });
    assert.equal(await dispatch(COMMAND, throwingCommand), 'claudeCode');
    assert.equal(throwingCommand.opened.length, 1, 'a throwing command did not take the URI fallback');
    assert.deepEqual(throwingCommand.copied, []);

    const absent = fakeHost({ order: ['claudeCode', 'clipboard'], extensions: [] });
    assert.equal(await dispatch(COMMAND, absent), 'clipboard');
    assert.deepEqual(absent.opened, [], 'an absent extension must not be reached by URI');
    assert.deepEqual(absent.copied, [COMMAND]);
  });

  it('dispatches copilotChat as a partial query and shows its one-time caveat (A7)', async () => {
    const host = fakeHost({
      order: ['copilotChat'],
      extensions: [COPILOT_CHAT_EXTENSION_ID],
      commands: [COPILOT_CHAT_OPEN_COMMAND],
      noticePressed: true
    });
    assert.equal(await dispatch(COMMAND, host), 'copilotChat');
    assert.deepEqual(host.executed, [
      { id: COPILOT_CHAT_OPEN_COMMAND, args: [{ query: COMMAND, isPartialQuery: true }] }
    ]);
    assert.deepEqual(host.notices, [
      { message: LAUNCH.copilotCaveat, action: LAUNCH.adjustLaunchOrder }
    ]);
    assert.equal(host.copilotNoticeShown, true, 'the notice was not tracked in globalState');
    assert.deepEqual(host.settingsOpened, ['maisterLens.launch.targetOrder']);

    assert.equal(await dispatch(COMMAND, host), 'copilotChat');
    assert.equal(host.notices.length, 1, 'the caveat notice was shown a second time');

    const submitting = fakeHost({
      order: ['copilotChat'],
      extensions: [COPILOT_CHAT_EXTENSION_ID],
      commands: [COPILOT_CHAT_OPEN_COMMAND],
      autoSubmit: true,
      copilotNoticeShown: true
    });
    assert.equal(await dispatch(COMMAND, submitting), 'copilotChat');
    assert.deepEqual(submitting.executed, [
      { id: COPILOT_CHAT_OPEN_COMMAND, args: [{ query: COMMAND, isPartialQuery: false }] }
    ]);
    assert.deepEqual(submitting.notices, [], 'a tracked notice was shown again');

    const uninstalled = fakeHost({ order: ['copilotChat', 'clipboard'], extensions: [] });
    assert.equal(await dispatch(COMMAND, uninstalled), 'clipboard');
    const unregistered = fakeHost({
      order: ['copilotChat', 'clipboard'],
      extensions: [COPILOT_CHAT_EXTENSION_ID],
      commands: []
    });
    assert.equal(await dispatch(COMMAND, unregistered), 'clipboard');
  });
});
