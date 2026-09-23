import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { readAuthors } from '../../src/index/attribution.ts';
import { TaskIndex } from '../../src/index/taskIndex.ts';
import { AUTHOR, OVERVIEW } from '../../src/strings.ts';
import { OverviewViewProvider, resetSharedFilter } from '../../src/views/overviewView.ts';
import { createTwoAuthorRepo, type GeneratedRepo } from '../helpers/gitRepo.ts';
import {
  folderStubs,
  folderUriOf,
  makeTempDir,
  removeTempDirs,
  stubContext,
  waitFor
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

const ATTRIBUTION_SOURCE = path.resolve(__dirname, '..', '..', '..', 'src', 'index', 'attribution.ts');

function stateFileOf(taskDir: string): string {
  return path.join(taskDir, 'orchestrator-state.yml');
}

describe('attribution/integration', () => {
  it('attributes earliest additions, matches isMe case-insensitively and degrades to null without a notification (AC16)', async function () {
    this.timeout(120_000);

    let repo: GeneratedRepo | undefined;
    try {
      repo = createTwoAuthorRepo();

      const lines: string[] = [];
      const authors = await readAuthors(repo.root, (line) => lines.push(line));
      assert.deepEqual(lines, [], `a healthy repository logged: ${lines.join(' | ')}`);

      const mine = authors.get(stateFileOf(repo.mineTaskDir));
      assert.ok(mine, 'the committed task owned by me was not attributed');
      assert.equal(mine.email, repo.myCommitEmail, 'a later commit by somebody else stole the task');
      assert.equal(mine.name, 'Me');
      assert.equal(
        mine.isMe,
        true,
        `isMe did not match ${repo.myConfiguredEmail} against ${mine.email} case-insensitively`
      );
      assert.ok(mine.addedAt instanceof Date && !Number.isNaN(mine.addedAt.getTime()), 'addedAt is not a date');

      const theirs = authors.get(stateFileOf(repo.othersTaskDir));
      assert.ok(theirs, 'the committed task owned by somebody else was not attributed');
      assert.equal(theirs.email, repo.otherEmail);
      assert.equal(theirs.isMe, false);

      assert.equal(
        authors.get(stateFileOf(repo.uncommittedTaskDir)),
        undefined,
        'a task that was never committed was attributed to somebody'
      );

      const degradedLines: string[] = [];
      const degraded = await readAuthors(
        repo.root,
        (line) => degradedLines.push(line),
        'git-maister-lens-does-not-exist'
      );
      assert.equal(degraded.size, 0, 'a missing git binary still produced authors');
      assert.equal(
        degradedLines.length,
        1,
        `expected exactly one logged line, got: ${degradedLines.join(' | ')}`
      );
      assert.match(degradedLines[0], /git-maister-lens-does-not-exist/);

      assert.doesNotMatch(
        fs.readFileSync(ATTRIBUTION_SOURCE, 'utf8'),
        /from 'vscode'/,
        'attribution.ts reaches the window API, so a degraded lookup could notify the user'
      );
    } finally {
      repo?.dispose();
    }
  });

  it("lists only my tasks under Mine and groups an uncommitted task as 'Not committed' (AC16)", async function () {
    this.timeout(120_000);

    let repo: GeneratedRepo | undefined;
    resetSharedFilter();
    let index: TaskIndex | undefined;
    let provider: OverviewViewProvider | undefined;
    try {
      repo = createTwoAuthorRepo();
      const mine = folderUriOf(repo.mineTaskDir);
      const theirs = folderUriOf(repo.othersTaskDir);
      const uncommitted = folderUriOf(repo.uncommittedTaskDir);

      index = new TaskIndex({
        storageUri: vscode.Uri.file(makeTempDir('attribution-overview-storage')),
        log: () => undefined,
        folders: () => folderStubs([repo?.root ?? '']),
        attributionEnabled: () => true
      });
      await index.load();
      await waitFor(
        () => index?.snapshot.tasks.get(mine)?.author !== null,
        30_000,
        'the index never attributed the committed task'
      );

      provider = new OverviewViewProvider(stubContext(), index, () => undefined);
      assert.deepEqual(
        [...index.snapshot.tasks.keys()].sort(),
        [mine, theirs, uncommitted].sort(),
        'the generated repository did not index as three tasks'
      );

      await provider.handleMessage({ type: 'setFilter', patch: { author: 'me' } });
      assert.deepEqual(
        provider.buildPayload().groups.flatMap((group) => group.rows.map((row) => row.folderUri)),
        [mine],
        'the Mine toggle listed a task the current user did not add'
      );

      await provider.handleMessage({ type: 'clearFilter' });
      await provider.setGroupBy('author');
      const groups = provider.buildPayload().groups;
      const notCommitted = groups.find((group) => group.key === AUTHOR.notCommitted);
      assert.ok(notCommitted, `an uncommitted task carries no ${AUTHOR.notCommitted} group`);
      assert.deepEqual(
        notCommitted.rows.map((row) => row.folderUri),
        [uncommitted],
        'the Not committed group does not hold exactly the uncommitted task'
      );
      assert.equal(
        groups[0]?.label,
        OVERVIEW.authorMe,
        'the current user is not the first author group'
      );
      assert.deepEqual(
        groups[0]?.rows.map((row) => row.folderUri),
        [mine]
      );
    } finally {
      provider?.dispose();
      index?.dispose();
      repo?.dispose();
      resetSharedFilter();
    }
  });
});
