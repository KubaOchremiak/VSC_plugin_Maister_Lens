import { strict as assert } from 'node:assert';
import { MAX_STATE_BYTES, oversizedStateTask, parseState } from '../../src/model/parseState.ts';
import type { ParseIssue, Task } from '../../src/model/types.ts';
import { fixtureInput, taskFixtureNames } from '../helpers/fixtures.ts';

function parseFixture(name: string): Task {
  return parseState(fixtureInput(name));
}

function issuesFor(task: Task, fieldPrefix: string): ParseIssue[] {
  return task.parseIssues.filter((issue) => issue.field.startsWith(fieldPrefix));
}

describe('parseState', () => {
  it('reads verification_context.e2e_followup as a string or a list of strings, ignoring other shapes', () => {
    const e2eOf = (value: string): string[] =>
      parseState({
        ...fixtureInput('no-dashboard'),
        text: `task:\n  status: completed\nverification_context:\n  e2e_followup: ${value}\n`
      }).e2eFollowUp;
    assert.deepEqual(e2eOf('Run the suite'), ['Run the suite']);
    assert.deepEqual(e2eOf('[One, 2, "", Two]'), ['One', 'Two']);
    assert.deepEqual(e2eOf('{a: b}'), []);
    assert.deepEqual(parseFixture('dev-real').e2eFollowUp, []);
  });

  it('extracts the four A14 clarifications from this development task in file order', () => {
    const task = parseFixture('dev-real');
    const clarifications = task.decisions.filter((d) => d.source === 'clarifications');

    assert.deepEqual(
      clarifications.map((d) => d.text),
      [
        'Scope: full spec AC1-AC18',
        'Tests: mocha unit + test-electron integration; perf as benchmark script',
        'Claude Code launch: editor.open then URI fallback then next target',
        'publisher placeholder maister, MIT'
      ]
    );
    assert.ok(clarifications.every((d) => d.rationale === 'user choice'));
    assert.equal(task.risks.filter((r) => r.source === 'clarifications').length, 0);
    assert.equal(task.artifacts.filter((a) => a.source === 'clarifications').length, 0);
    assert.deepEqual(issuesFor(task, 'phase_summaries.clarifications'), []);

    assert.equal(task.type, 'development');
    assert.equal(task.title, 'Maister Lens — VS Code extension');
    assert.equal(task.status, 'in_progress');
    assert.equal(task.currentPhaseId, 'phase-8');
  });

  it('lands the classifiable siblings of a mixed list entry and warns about the rest', () => {
    const task = parseFixture('list-mixed');

    assert.deepEqual(
      task.decisions.filter((d) => d.source === 'clarifications').map((d) => d.text),
      ['A classifiable decision', 'A bare string decision']
    );
    assert.deepEqual(
      task.risks.filter((r) => r.source === 'clarifications'),
      [
        { text: 'a classifiable risk', resolved: true, source: 'clarifications' },
        { text: 'An open risk in text form', resolved: false, source: 'clarifications' }
      ]
    );
    assert.deepEqual(
      task.artifacts.filter((a) => a.source === 'clarifications').map((a) => a.relPath),
      ['implementation/spec.md']
    );

    const warnings = issuesFor(task, 'phase_summaries.clarifications');
    assert.equal(warnings.length, 4, JSON.stringify(warnings));
    assert.ok(warnings.every((w) => w.severity === 'warning'));
    assert.deepEqual(
      warnings.map((w) => w.field),
      [
        'phase_summaries.clarifications[5]',
        'phase_summaries.clarifications[6]',
        'phase_summaries.clarifications[7]',
        'phase_summaries.clarifications[8]'
      ]
    );
    assert.ok(warnings[0].message.includes('not recognized'));

    // A scalar entry becomes that entry's summary and contributes nothing else (A14).
    assert.equal(task.decisions.filter((d) => d.source === 'handoff').length, 0);
  });

  it('tolerates every row of the A8 drift matrix', () => {
    const both = parseFixture('both-level-options');
    // N7 — options read at both levels, orchestrator.options winning on conflict.
    assert.equal(both.options.html_output, false);
    assert.equal(both.options.sequential, true);
    assert.equal(both.options.mockup_format, 'ascii');
    assert.equal(both.options.spec_audit_enabled, true);
    assert.equal(both.hasDashboard, false);
    // N6 — every accepted phase-id spelling canonicalizes.
    assert.deepEqual(
      both.phases.filter((p) => p.status === 'completed').map((p) => p.id),
      ['phase-1', 'phase-2', 'phase-3', 'phase-5', 'phase-6']
    );
    // N9 — a positional key is kept verbatim as the decision source.
    assert.ok(both.decisions.some((d) => d.source === 'phase-3'));
    // N4 — a scalar tag becomes a single-element array; an out-of-enum priority is dropped.
    assert.deepEqual(both.tags, ['parser']);
    assert.equal(both.priority, null);
    // N12 — an escaping path is dropped with a warning, a duplicate path is deduplicated.
    assert.deepEqual(both.artifacts.map((a) => a.relPath), ['implementation/spec.md']);
    assert.equal(both.artifacts[0].htmlRelPath, 'implementation/spec.html');
    assert.equal(both.artifacts[0].isHero, true);
    assert.equal(issuesFor(both, 'phase_summaries.phase-3.artifacts').length, 1);

    // N8 — the first present *_context key wins and more than one records a warning.
    const multi = parseFixture('multi-context');
    assert.deepEqual(multi.decisions.map((d) => d.text), ['First context wins']);
    assert.equal(issuesFor(multi, 'design_context').length, 1);
    // N14 — only boolean and string characteristics are kept.
    assert.deepEqual(multi.characteristics, { ui_heavy: true, risk_level: 'medium' });

    // N1 — the directory segment maps through the registry, never the folder name.
    const migration = parseFixture('migration-dir');
    assert.equal(migration.type, 'migration');
    assert.equal(migration.phases[0].name, 'Analyze current state');
    assert.equal(migration.verdict, 'passed_with_issues');

    // N5 — a date-only timestamp is accepted at midnight UTC with a warning.
    const dateOnly = parseFixture('date-only');
    assert.equal(dateOnly.created?.toISOString(), '2026-01-09T00:00:00.000Z');
    assert.equal(dateOnly.updated, null);
    assert.equal(issuesFor(dateOnly, 'created').length, 1);
    assert.equal(issuesFor(dateOnly, 'updated').length, 1);
    // N3 — an out-of-enum status degrades to unknown with a warning.
    assert.equal(dateOnly.status, 'unknown');
    assert.equal(issuesFor(dateOnly, 'status').length, 1);

    // N1 — an unmapped directory segment yields type unknown, still listed, warning recorded.
    const unknown = parseFixture('unknown-segment');
    assert.equal(unknown.type, 'unknown');
    assert.equal(unknown.title, 'An experimental workflow');
    assert.equal(issuesFor(unknown, 'type').length, 1);
    assert.deepEqual(unknown.decisions.map((d) => d.text), ['Recorded even for an unknown workflow']);

    // § 2.2 — phase ids outside the pinned registry render by raw id with a warning.
    const extra = parseFixture('extra-phase');
    const ids = extra.phases.map((p) => p.id);
    assert.ok(ids.includes('phase-15'));
    assert.ok(ids.includes('sprint-review'));
    assert.equal(extra.phases.find((p) => p.id === 'sprint-review')?.name, 'sprint-review');
    assert.ok(issuesFor(extra, 'completed_phases').length >= 1);
  });

  it('never throws: corrupt, truncated and empty state files each yield an unknown task', () => {
    for (const name of ['corrupt', 'truncated', 'empty']) {
      const task = parseFixture(name);
      assert.equal(task.status, 'unknown', name);
      assert.equal(task.currentPhaseId, null, name);
      assert.equal(
        task.parseIssues.filter((i) => i.severity === 'error').length,
        1,
        `${name}: ${JSON.stringify(task.parseIssues)}`
      );
      assert.equal(task.ref.folderUri, task.ref.folderUri);
    }
    assert.equal(parseFixture('corrupt').title, 'Corrupt');
    assert.equal(parseFixture('empty').title, 'Empty');
    assert.equal(parseFixture('truncated').title, 'Truncated');

    // The governing rule, asserted over the whole corpus.
    for (const name of taskFixtureNames()) {
      assert.doesNotThrow(() => parseFixture(name), name);
    }
  });

  it('surfaces failed_phases, auto_fix_attempts and a disagreeing started_phase as warnings (A17)', () => {
    const task = parseFixture('failed-phases');

    const failed = issuesFor(task, 'orchestrator.failed_phases');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].severity, 'warning');
    assert.ok(failed[0].message.includes('phase-3'));
    assert.ok(failed[0].message.includes('phase-7'));

    const autoFix = issuesFor(task, 'orchestrator.auto_fix_attempts');
    assert.equal(autoFix.length, 1);
    assert.equal(autoFix[0].severity, 'warning');
    assert.ok(autoFix[0].message.includes('phase-3'));
    assert.ok(!autoFix[0].message.includes('phase-1'), 'zero-attempt phases are not claimed');

    const started = issuesFor(task, 'orchestrator.started_phase');
    assert.equal(started.length, 1);
    assert.equal(started[0].severity, 'warning');
    assert.ok(started[0].message.includes('phase-11'));
    assert.ok(started[0].message.includes('phase-8'));

    // No phase gains a failed status; the derivation still wins.
    assert.deepEqual(
      [...new Set(task.phases.map((p) => p.status))].sort(),
      ['completed', 'current', 'upcoming']
    );
    assert.equal(task.currentPhaseId, 'phase-8');

    // Absent and empty are ignored without an issue (N15).
    const quiet = parseFixture('dev-real');
    assert.deepEqual(issuesFor(quiet, 'orchestrator.failed_phases'), []);
    assert.deepEqual(issuesFor(quiet, 'orchestrator.auto_fix_attempts'), []);
    assert.deepEqual(issuesFor(quiet, 'orchestrator.started_phase'), []);
  });
  it("keeps yaml's alias guard on, so an alias bomb is refused instead of expanded", () => {
    const bomb = [
      'task:',
      '  title: bomb',
      "a: &a ['x','x','x','x','x','x','x','x','x']",
      'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]',
      'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]',
      'd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c]',
      'e: &e [*d, *d, *d, *d, *d, *d, *d, *d, *d]',
      'f: &f [*e, *e, *e, *e, *e, *e, *e, *e, *e]',
      'g: [*f, *f, *f, *f, *f, *f, *f, *f, *f]',
      ''
    ].join('\n');

    const startedAt = Date.now();
    const task = parseState({ ...fixtureInput('dev-real'), text: bomb });
    const elapsed = Date.now() - startedAt;

    const errors = task.parseIssues.filter((issue) => issue.severity === 'error');
    assert.ok(
      errors.some((issue) => /alias/i.test(issue.message)),
      `no alias-count error was recorded: ${JSON.stringify(errors)}`
    );
    assert.ok(elapsed < 1_000, `the alias bomb was expanded for ${elapsed}ms`);
    assert.equal(task.status, 'unknown');
  });

  it('reports an oversized state file rather than reading it', () => {
    const task = oversizedStateTask(fixtureInput('dev-real'), MAX_STATE_BYTES + 1);
    const errors = task.parseIssues.filter((issue) => issue.severity === 'error');

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /KB/);
    assert.equal(task.status, 'unknown');
    assert.equal(task.title, 'Dev real', 'the task is not titled from its folder');
  });
});
