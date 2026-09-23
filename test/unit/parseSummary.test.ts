import { strict as assert } from 'node:assert';
import { parseSummary } from '../../src/model/parseSummary.ts';
import { readSummaryFixture } from '../helpers/fixtures.ts';

const PLAN = 'implementation/implementation-plan.md';

describe('parseSummary', () => {
  it('extracts TL;DR, Key Decisions and Risks from the leading region only', () => {
    const slash = parseSummary(readSummaryFixture('slash.md'), PLAN);
    assert.ok(slash);
    assert.equal(slash.tldr, 'Twelve task groups, bottom-up, de-risking first.');

    // Decision bullets split on ' — ', then ' – ', then ' - '.
    assert.deepEqual(slash.decisions, [
      {
        text: 'Group 1 is the de-risking group',
        rationale: 'the probe must run before any feature code',
        source: PLAN
      },
      {
        text: 'package.json ownership is split',
        rationale: 'group 1 owns dependencies',
        source: PLAN
      },
      {
        text: 'Views depend only on the index',
        rationale: 'three groups run concurrently',
        source: PLAN
      },
      { text: 'A decision with no separator at all', rationale: null, source: PLAN }
    ]);

    // N11's resolved rule applies to risk bullets.
    assert.deepEqual(slash.risks, [
      {
        text: 'the toolchain question was settled on Node 26',
        resolved: true,
        source: PLAN
      },
      {
        text: 'The hosted dashboard resolution is unverified (resolved in group 1)',
        resolved: true,
        source: PLAN
      },
      {
        text: 'src/strings.ts serializes three otherwise-parallel groups',
        resolved: false,
        source: PLAN
      }
    ]);

    // '&' and 'and' spellings match too, at level 2 or 3, case-insensitively.
    const amp = parseSummary(readSummaryFixture('amp.md'), PLAN);
    assert.equal(amp?.risks.length, 1);
    assert.equal(amp?.decisions[0].rationale, 'it doubles as the security allowlist');
    const and = parseSummary(readSummaryFixture('and.md'), PLAN);
    assert.equal(and?.tldr, 'Lowercase heading spelling is matched case-insensitively.');
    assert.equal(and?.risks.length, 1);

    // A Risks heading past the fourth heading or a thematic break is not matched.
    assert.equal(parseSummary(readSummaryFixture('deep.md'), PLAN), null);
    assert.equal(
      slash.risks.some((r) => r.text.includes('thematic break')),
      false
    );

    // None of the three sections present yields null, which is normal, not an error.
    assert.equal(parseSummary(readSummaryFixture('none.md'), PLAN), null);

    // TL;DR is capped at 1,000 characters.
    const overflow = parseSummary(readSummaryFixture('overflow.md'), PLAN);
    assert.equal(overflow?.tldr?.length, 1000);
    assert.equal(overflow?.decisions.length, 1);
  });
});
