import { strict as assert } from 'node:assert';
import { validate, type MessageContext } from '../../src/panel/messages.ts';

const TASK = 'file:///w/.maister/tasks/development/alpha';
const OTHER_TASK = 'file:///w/.maister/tasks/development/beta';

function context(overrides: Partial<MessageContext> = {}): MessageContext {
  return {
    isIndexed: (folderUri) => folderUri === TASK || folderUri === OTHER_TASK,
    isTrusted: true,
    hostFolderUri: TASK,
    workspaceRootUri: 'file:///w',
    workspaceFolderUris: ['file:///w', 'file:///second'],
    ...overrides
  };
}

function accepted(raw: unknown, overrides: Partial<MessageContext> = {}): unknown {
  const result = validate(raw, context(overrides));
  assert.equal(result.ok, true, `refused a well-formed message: ${result.ok ? '' : result.reason}`);
  return result.ok ? result.message : null;
}

function refused(raw: unknown, overrides: Partial<MessageContext> = {}): string {
  const result = validate(raw, context(overrides));
  assert.equal(result.ok, false, `accepted a message the A2 table forbids: ${JSON.stringify(raw)}`);
  return result.ok ? '' : result.reason;
}

describe('messages/unit', () => {
  it('accepts every type in the A2 table and drops an unlisted type, a wrong primitive, a missing key and an over-long text patch', () => {
    assert.deepEqual(accepted({ type: 'ready' }), { type: 'ready' });
    assert.deepEqual(accepted({ type: 'clearFilter' }), {
      type: 'clearFilter'
    });
    assert.deepEqual(accepted({ type: 'openDashboard' }), {
      type: 'openDashboard'
    });
    assert.deepEqual(accepted({ type: 'startWorkflow' }), {
      type: 'startWorkflow'
    });
    assert.deepEqual(accepted({ type: 'openTask', folderUri: TASK }), {
      type: 'openTask',
      folderUri: TASK
    });
    assert.deepEqual(accepted({ type: 'runNextAction', folderUri: TASK }), {
      type: 'runNextAction',
      folderUri: TASK
    });
    assert.deepEqual(accepted({ type: 'openFollowUps' }), { type: 'openFollowUps' });
    assert.deepEqual(accepted({ type: 'openFollowUps', folderUri: TASK }), {
      type: 'openFollowUps',
      folderUri: TASK
    });
    assert.deepEqual(
      accepted({
        type: 'openArtifact',
        folderUri: TASK,
        artifactRelPath: 'implementation/spec.md',
        variant: 'md',
        anchor: 'section-5.1'
      }),
      {
        type: 'openArtifact',
        folderUri: TASK,
        artifactRelPath: 'implementation/spec.md',
        variant: 'md',
        anchor: 'section-5.1'
      }
    );
    assert.deepEqual(accepted({ type: 'openSource', folderUri: TASK }), {
      type: 'openSource',
      folderUri: TASK,
      artifactRelPath: 'orchestrator-state.yml'
    });
    assert.deepEqual(accepted({ type: 'openFile', workspaceRelPath: 'src/extension.ts' }), {
      type: 'openFile',
      folderUri: 'file:///w',
      workspaceRelPath: 'src/extension.ts'
    });
    assert.deepEqual(accepted({ type: 'openExternal', url: 'https://example.test/a' }), {
      type: 'openExternal',
      url: 'https://example.test/a'
    });
    assert.deepEqual(
      accepted({
        type: 'openInBrowser',
        folderUri: TASK,
        artifactRelPath: 'dashboard.html'
      }),
      {
        type: 'openInBrowser',
        folderUri: TASK,
        artifactRelPath: 'dashboard.html'
      }
    );
    assert.deepEqual(accepted({ type: 'navigate', href: 'implementation/spec.md' }), {
      type: 'navigate',
      href: 'implementation/spec.md',
      targetRelPath: 'implementation/spec.md'
    });
    assert.deepEqual(accepted({ type: 'setFilter', patch: { text: 'rotate', types: null } }), {
      type: 'setFilter',
      patch: { text: 'rotate', types: null }
    });

    // Audit I2 — grouping is a native title-bar command, so `setGroupBy` is not in the table.
    assert.ok(refused({ type: 'setGroupBy', groupBy: 'status' }).length > 0);
    refused({ type: 'evaluate', script: 'process.exit(0)' });
    refused({ type: 'openTask', folderUri: 42 });
    refused({ type: 'openArtifact', folderUri: TASK, variant: 'md' });
    refused({ type: 'setFilter', patch: { text: 'x'.repeat(201) } });
    refused('openTask');
    refused(null);
  });

  it('enforces path containment, index membership, the anchor shape and the http(s) scheme allowlist', () => {
    refused({
      type: 'openArtifact',
      folderUri: TASK,
      artifactRelPath: '../beta/dashboard.html',
      variant: 'html'
    });
    refused({
      type: 'openArtifact',
      folderUri: TASK,
      artifactRelPath: '/etc/passwd',
      variant: 'md'
    });
    refused({
      type: 'openArtifact',
      folderUri: 'file:///w/.maister/tasks/development/gamma',
      artifactRelPath: 'spec.md',
      variant: 'md'
    });
    refused({
      type: 'openArtifact',
      folderUri: TASK,
      artifactRelPath: 'spec.md',
      variant: 'md',
      anchor: 'a b'
    });
    refused({
      type: 'openArtifact',
      folderUri: TASK,
      artifactRelPath: 'spec.md',
      variant: 'md',
      anchor: 'a'.repeat(129)
    });
    refused({ type: 'openExternal', url: 'file:///etc/passwd' });
    refused({ type: 'openExternal', url: 'javascript:alert(1)' });
    refused({ type: 'openExternal', url: 'not a url' });
    refused({ type: 'openFile', workspaceRelPath: '../../etc/passwd' });
    refused({
      type: 'openInBrowser',
      folderUri: TASK,
      artifactRelPath: 'notes.md'
    });
    refused({
      type: 'openInBrowser',
      folderUri: TASK,
      artifactRelPath: '../beta/dashboard.html'
    });

    for (const trustGated of [
      { type: 'startWorkflow' },
      { type: 'runNextAction', folderUri: TASK },
      {
        type: 'openInBrowser',
        folderUri: TASK,
        artifactRelPath: 'dashboard.html'
      }
    ]) {
      assert.match(
        refused(trustGated, { isTrusted: false }),
        /trusted/,
        `${JSON.stringify(trustGated)} was not trust-gated (A2.2)`
      );
    }
    assert.ok(
      validate({ type: 'openExternal', url: 'https://example.test' }, context({ isTrusted: false }))
        .ok,
      'openExternal is the recorded trust exception (A2.2) and must still validate'
    );
  });

  it('decodes before it normalizes, so percent-encoded ../ never survives containment', () => {
    for (const encoded of [
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%2f..%2fx.md',
      'sub/%2e%2e%2f%2e%2e%2fsecret.md',
      'a/../../../b.md',
      '%2e%2e%5cwindows%5csystem32',
      '%2f%2fetc%2fpasswd'
    ]) {
      assert.match(
        refused({ type: 'navigate', href: encoded }),
        /outside/,
        `navigate accepted ${encoded}`
      );
      refused({
        type: 'openArtifact',
        folderUri: TASK,
        artifactRelPath: encoded,
        variant: 'md'
      });
      refused({
        type: 'openSource',
        folderUri: TASK,
        artifactRelPath: encoded
      });
      refused({ type: 'openFile', workspaceRelPath: encoded });
      refused({
        type: 'openInBrowser',
        folderUri: TASK,
        artifactRelPath: `${encoded}.html`
      });
    }

    // A percent-encoded name that stays inside is still delivered decoded.
    assert.deepEqual(accepted({ type: 'navigate', href: 'analysis/a%20b.md' }), {
      type: 'navigate',
      href: 'analysis/a%20b.md',
      targetRelPath: 'analysis/a b.md'
    });
  });

  it("openFile carries the surface's own workspace folder and the decoded, normalized path", () => {
    assert.deepEqual(
      accepted(
        { type: 'openFile', workspaceRelPath: 'notes/a%20b.md' },
        { workspaceRootUri: 'file:///second' }
      ),
      {
        type: 'openFile',
        folderUri: 'file:///second',
        workspaceRelPath: 'notes/a b.md'
      },
      'openFile did not name its folder or decode its path'
    );
    assert.deepEqual(
      accepted(
        { type: 'openFile', workspaceRelPath: './docs/../notes/x.md' },
        { workspaceRootUri: 'file:///second' }
      ),
      {
        type: 'openFile',
        folderUri: 'file:///second',
        workspaceRelPath: 'notes/x.md'
      }
    );

    // No root to contain against is a refusal, not a guess at the first folder.
    assert.match(
      refused({ type: 'openFile', workspaceRelPath: 'x.md' }, { workspaceRootUri: undefined }),
      /workspace folder/
    );
  });

  it('A2.1 — a navigate href leaving the hosting task folder is refused, including another task dashboard', () => {
    assert.match(refused({ type: 'navigate', href: '../beta/dashboard.html' }), /outside/);
    assert.match(
      refused({ type: 'navigate', href: `${OTHER_TASK}/dashboard.html` }),
      /outside/,
      'an absolute link to another indexed task is still out-of-folder'
    );
    refused({ type: 'navigate', href: 'https://example.test/x' });
    refused({ type: 'navigate', href: '/etc/passwd' });
    refused({ type: 'navigate', href: 'implementation/spec.md' }, { hostFolderUri: undefined });

    assert.deepEqual(accepted({ type: 'navigate', href: 'dashboard.html' }), {
      type: 'navigate',
      href: 'dashboard.html',
      targetRelPath: 'dashboard.html'
    });
    assert.deepEqual(accepted({ type: 'navigate', href: './analysis/notes.md#top' }), {
      type: 'navigate',
      href: './analysis/notes.md#top',
      targetRelPath: 'analysis/notes.md'
    });
  });

  it('a companion page navigates relative to its own folder, so ../dashboard.html reaches the task dashboard', () => {
    const companion = {
      hostBaseRelDir: 'implementation'
    } as Partial<MessageContext>;
    assert.deepEqual(accepted({ type: 'navigate', href: '../dashboard.html' }, companion), {
      type: 'navigate',
      href: '../dashboard.html',
      targetRelPath: 'dashboard.html'
    });
    assert.match(
      refused({ type: 'navigate', href: '../../beta/dashboard.html' }, companion),
      /outside/
    );
  });

  it('FR2 — a companion navigate decodes before joining and refuses a scheme, an absolute path and a backslash on the href alone', () => {
    const companion = {
      hostBaseRelDir: 'implementation'
    } as Partial<MessageContext>;
    assert.deepEqual(accepted({ type: 'navigate', href: '../dashboard.html#top' }, companion), {
      type: 'navigate',
      href: '../dashboard.html#top',
      targetRelPath: 'dashboard.html'
    });
    assert.deepEqual(accepted({ type: 'navigate', href: 'work-log.md' }, companion), {
      type: 'navigate',
      href: 'work-log.md',
      targetRelPath: 'implementation/work-log.md'
    });
    for (const href of [
      '../../x',
      '%2e%2e/%2e%2e/x',
      'https://example.com/x',
      '/abs',
      '..\\x',
      '%2fabs'
    ]) {
      assert.match(refused({ type: 'navigate', href }, companion), /outside/, href);
    }
  });

  it('FR2 — with an empty base (task mode) navigate behaves as before', () => {
    const task = { hostBaseRelDir: '' } as Partial<MessageContext>;
    assert.deepEqual(accepted({ type: 'navigate', href: 'implementation/spec.md' }, task), {
      type: 'navigate',
      href: 'implementation/spec.md',
      targetRelPath: 'implementation/spec.md'
    });
    for (const href of ['../dashboard.html', '%2e%2e/x', 'https://x', '/abs', 'a\\b']) {
      assert.match(refused({ type: 'navigate', href }, task), /outside/, href);
    }
  });

  it('R9 — openProject is accepted and openDoc needs a workspace root, a contained .md path and a valid anchor', () => {
    assert.deepEqual(accepted({ type: 'openProject' }), {
      type: 'openProject'
    });
    assert.deepEqual(
      accepted({
        type: 'openDoc',
        docsFolderUri: 'file:///second',
        docRelPath: './standards/global/../frontend/css.md',
        anchor: 'design-tokens'
      }),
      {
        type: 'openDoc',
        docsFolderUri: 'file:///second',
        docRelPath: 'standards/frontend/css.md',
        anchor: 'design-tokens'
      }
    );
    assert.deepEqual(
      accepted({
        type: 'openDoc',
        docsFolderUri: 'file:///w',
        docRelPath: 'INDEX.MD'
      }),
      { type: 'openDoc', docsFolderUri: 'file:///w', docRelPath: 'INDEX.MD' }
    );

    const doc = (patch: Record<string, unknown>): Record<string, unknown> => ({
      type: 'openDoc',
      docsFolderUri: 'file:///w',
      docRelPath: 'INDEX.md',
      ...patch
    });
    assert.match(refused(doc({ docsFolderUri: 'file:///elsewhere' })), /workspace folder/);
    assert.match(refused(doc({ docsFolderUri: 'file:///w/' })), /workspace folder/);
    assert.match(refused(doc({ docsFolderUri: TASK })), /workspace folder/);
    assert.match(refused(doc({}), { workspaceFolderUris: undefined }), /workspace folder/);
    for (const docRelPath of [
      '../tasks/x/spec.md',
      '%2e%2e/secrets.md',
      'standards\\global\\css.md',
      '/etc/passwd.md',
      'file:///w/.maister/docs/INDEX.md',
      'project/vision.html',
      '',
      '.',
      42
    ]) {
      refused(doc({ docRelPath }));
    }
    assert.match(refused(doc({ anchor: 'a b' })), /anchor/);
    assert.match(refused(doc({ anchor: 7 })), /anchor/);
  });
});
