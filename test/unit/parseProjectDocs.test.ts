import { strict as assert } from 'node:assert';
import { groupDocs, humanizeDocName, parseProjectIndex, parseVisionGoal } from '../../src/model/parseProjectDocs.ts';

const INDEX = [
  '# Documentation Index',
  '',
  '## Project Documentation',
  '',
  'Located in `.maister/docs/project/`',
  '',
  '#### Vision (`project/vision.md`)',
  'A read-only view layer',
  'over Maister tasks.',
  '',
  'Second paragraph.',
  '',
  '#### Tech Stack (`project/tech-stack.md`)',
  'TypeScript on the VS Code Extension API.',
  '',
  '## Technical Standards',
  '',
  '#### Vision (`elsewhere.md`)',
  'Not project docs.'
].join('\n');

const REAL_INDEX = [
  '# Documentation Index',
  '',
  '## Project Documentation',
  '',
  'Located in `.maister/docs/project/`',
  '',
  '#### Vision (`project/vision.md`)',
  'Problem statement, target users and key features for VSC_Maister_plugin.',
  '',
  '#### Tech Stack (`project/tech-stack.md`)',
  'Technology choices as shipped: TypeScript on the VS Code Extension API.',
  '',
  '*Not initialized for this project: roadmap.md, architecture.md. Add them later via the docs-manager skill.*',
  '',
  '---',
  '',
  '## Technical Standards'
].join('\n');

describe('parseProjectIndex', () => {
  it('stops an entry at the italic note and the thematic break of the real INDEX.md shape', () => {
    assert.deepEqual(parseProjectIndex(REAL_INDEX), {
      goal: 'Problem statement, target users and key features for VSC_Maister_plugin.',
      goalSource: 'project/vision.md',
      techStack: 'Technology choices as shipped: TypeScript on the VS Code Extension API.',
      techStackSource: 'project/tech-stack.md'
    });
  });

  it('ends an entry at a --- break even without a blank line', () => {
    const text = '## Project Documentation\n#### Vision\nGoal line.\n---\n*note*';
    assert.equal(parseProjectIndex(text).goal, 'Goal line.');
  });

  it('reads Vision and Tech Stack with their backticked sources', () => {
    assert.deepEqual(parseProjectIndex(INDEX), {
      goal: 'A read-only view layer over Maister tasks.',
      goalSource: 'project/vision.md',
      techStack: 'TypeScript on the VS Code Extension API.',
      techStackSource: 'project/tech-stack.md'
    });
  });

  it('matches headings regardless of case and without a source suffix', () => {
    const text = '## project documentation\n#### VISION\nGoal.\n#### tech stack notes\nStack.';
    assert.deepEqual(parseProjectIndex(text), {
      goal: 'Goal.',
      techStack: 'Stack.'
    });
  });

  it('gives undefined fields for a missing section, a missing entry and empty input', () => {
    assert.deepEqual(parseProjectIndex('## Technical Standards\n#### Vision\nNo.'), {});
    assert.deepEqual(parseProjectIndex('## Project Documentation\n#### Vision (`v.md`)\nGoal.'), {
      goal: 'Goal.',
      goalSource: 'v.md'
    });
    assert.deepEqual(parseProjectIndex(''), {});
  });
});

describe('groupDocs', () => {
  it('orders INDEX, project, standards domains, then other folders; files alphabetical', () => {
    const groups = groupDocs([
      'zeta/b.md',
      'standards/global/coding-style.md',
      'alpha/a.md',
      'project/vision.md',
      'standards/frontend/css.md',
      'INDEX.md',
      'project/tech-stack.md',
      'standards/global/commenting.md'
    ]);
    assert.deepEqual(
      groups.map((g) => [g.key, g.docs.map((d) => d.relPath)]),
      [
        ['index', ['INDEX.md']],
        ['project', ['project/tech-stack.md', 'project/vision.md']],
        ['standards/frontend', ['standards/frontend/css.md']],
        [
          'standards/global',
          ['standards/global/coding-style.md', 'standards/global/commenting.md']
        ],
        ['alpha', ['alpha/a.md']],
        ['zeta', ['zeta/b.md']]
      ]
    );
    assert.equal(groups[3].label, 'Standards · Global');
  });

  it('humanizes file names', () => {
    assert.equal(humanizeDocName('standards/global/coding-style.md'), 'Coding style');
    assert.equal(humanizeDocName('project/tech_stack.md'), 'Tech stack');
    assert.equal(humanizeDocName('standards/frontend/css.md'), 'CSS');
    assert.equal(humanizeDocName('standards/backend/api-design.md'), 'API design');
    assert.equal(humanizeDocName('standards/frontend/ui-json-apis.md'), 'UI JSON apis');
  });

  it('strips inline-code backticks from the TL;DR text, keeping the inner text', () => {
    const text = [
      '## Project Documentation',
      '#### Vision (`project/vision.md`)',
      'A `read-only` view.',
      '#### Tech Stack (`project/tech-stack.md`)',
      'Deps: `yaml`, `markdown-it`.'
    ].join('\n');
    const tldr = parseProjectIndex(text);
    assert.equal(tldr.goal, 'A read-only view.');
    assert.equal(tldr.techStack, 'Deps: yaml, markdown-it.');
    assert.equal(tldr.goalSource, 'project/vision.md');
    assert.equal(parseVisionGoal('## Problem\nUse `vsce`.'), 'Use vsce.');
  });
});

describe('parseVisionGoal', () => {
  it('reads the first paragraph under the first ## section', () => {
    const text = '# Project Vision\n\n\n## Problem Statement\nMaister produces\nstructured output.\n\nMore.\n\n## Target Users\nUs.';
    assert.equal(parseVisionGoal(text), 'Maister produces structured output.');
  });

  it('falls back to the intro when the first section has no prose', () => {
    const text = '# Vision\n\nThe intro paragraph.\n\n## Problem Statement\n\n## Users\nUs.';
    assert.equal(parseVisionGoal(text), 'The intro paragraph.');
  });

  it('returns undefined for an empty or heading-only file', () => {
    assert.equal(parseVisionGoal(''), undefined);
    assert.equal(parseVisionGoal('# Vision\n\n## Problem\n*todo*'), undefined);
  });
});
