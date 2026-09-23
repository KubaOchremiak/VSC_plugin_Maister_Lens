import { strict as assert } from 'node:assert';
import { parseState } from '../../src/model/parseState.ts';
import { parseSummary } from '../../src/model/parseSummary.ts';
import { collectRisks, openRiskCount } from '../../src/model/risks.ts';
import type { Task } from '../../src/model/types.ts';
import { fixtureInput, readSummaryFixture, taskFixtureNames } from '../helpers/fixtures.ts';

/** The index populates artifact summaries at tier 2 (§ 3.1); this stands in for that step. */
function withArtifactSummaries(task: Task): Task {
  return {
    ...task,
    artifacts: task.artifacts.map((artifact) => ({
      ...artifact,
      summary: parseSummary(readSummaryFixture('slash.md'), artifact.relPath)
    }))
  };
}

describe('risks', () => {
  it('keeps openRiskCount equal to the unresolved rows collectRisks returns, on every fixture (step 3.9)', () => {
    for (const name of taskFixtureNames()) {
      const task = withArtifactSummaries(parseState(fixtureInput(name)));
      const risks = collectRisks(task);
      assert.equal(
        openRiskCount(task),
        risks.filter((r) => !r.resolved).length,
        `${name}: openRiskCount disagrees with collectRisks`
      );
      assert.ok(
        risks.every((r) => r.folderUri === task.ref.folderUri),
        `${name}: a risk is not attributed to its task`
      );
      const texts = risks.map((r) => r.text.trim().replace(/\s+/g, ' ').toLowerCase());
      assert.equal(new Set(texts).size, texts.length, `${name}: duplicate risk text`);
    }
  });

  it('merges state and artifact risks per A5, with the artifact winning as source', () => {
    const task = withArtifactSummaries(parseState(fixtureInput('both-level-options')));
    const risks = collectRisks(task);

    assert.ok(risks.some((r) => r.sourceKind === 'state'));
    assert.ok(risks.some((r) => r.sourceKind === 'artifact'));

    const shared = risks.find((r) => r.text === 'the positional key question');
    assert.equal(shared?.resolved, true);

    const fromArtifact = risks.find((r) => r.text === 'src/strings.ts serializes three otherwise-parallel groups');
    assert.equal(fromArtifact?.sourceKind, 'artifact');
    assert.equal(fromArtifact?.source, 'implementation/spec.md');
  });
});
