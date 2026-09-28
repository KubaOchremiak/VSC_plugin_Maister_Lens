import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DashboardResources } from '../../src/panel/hostDashboard.ts';
import {
  MAX_ARTIFACT_BYTES,
  companionHtml,
  oversizeNotice,
  renderArtifact,
  type RenderTarget
} from '../../src/panel/render.ts';
import { READER, format } from '../../src/strings.ts';

const TARGET: RenderTarget = {
  kind: 'artifact',
  artifactRelPath: 'implementation/implementation-plan.md',
  baseRelPath: '.maister/tasks/development/auth',
  imageUri: (relPath) => `https://webview/${relPath}`
};

function body(markdown: string): string {
  return renderArtifact(markdown, TARGET).bodyHtml;
}

/** Every opening anchor tag, so "the link was removed" is asserted on tags, not on text. */
function anchors(html: string): string[] {
  return html.match(/<a\s[^>]*>/g) ?? [];
}

describe('render/unit', () => {
  it('escapes raw HTML, renders GFM tables and linkifies, with no sanitizer dependency', () => {
    const html = body('<script>alert(1)</script>\n\nplain *em* and "quoted"\n');
    assert.ok(!html.includes('<script'), `raw HTML survived: ${html}`);
    assert.ok(html.includes('&lt;script&gt;'), `raw HTML was not escaped: ${html}`);
    assert.ok(html.includes('<em>em</em>'), 'markdown emphasis did not render');
    assert.ok(html.includes('&quot;quoted&quot;'), 'typographer rewrote the quotes');
    assert.ok(!html.includes('“'), 'typographer produced smart quotes');

    assert.ok(
      body('see https://example.com now').includes('data-external="https://example.com"'),
      'linkify did not turn a bare URL into an external link'
    );

    const table = body('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    assert.ok(table.includes('<table>'), 'GFM table did not render');
    assert.ok(table.includes('<th>'), 'GFM table header cells did not render');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as { dependencies: Record<string, string> };
    assert.deepEqual(
      Object.keys(manifest.dependencies).sort(),
      ['markdown-it', 'yaml'],
      'a sanitizer (or any third dependency) was added instead of relying on html:false'
    );
  });

  it('rewrites links per the § 6.2 table and removes the rest while keeping their text', () => {
    const html = body(
      [
        '[frag](#section-2)',
        '[spec](../analysis/spec.md)',
        '[mock](../analysis/mockups/a.html#top)',
        '[code](../../../../../src/auth/token.ts)',
        '[ext](https://example.com/x)',
        '[fileScheme](file:///etc/passwd)',
        '[commandScheme](command:workbench.action.quit)',
        '[escaping](../../../../../../../../etc/passwd)'
      ].join('\n\n')
    );

    assert.ok(html.includes('href="#section-2"'), `fragment link was rewritten: ${html}`);
    assert.ok(html.includes('data-artifact="analysis/spec.md"'), 'in-task .md was not an artifact link');
    assert.ok(
      html.includes('data-artifact="analysis/mockups/a.html#top"'),
      'in-task .html kept no fragment'
    );
    assert.ok(html.includes('data-file="src/auth/token.ts"'), 'workspace file was not a file link');
    assert.ok(html.includes(READER.opensInEditor), 'file link carries no spoken purpose');
    assert.ok(html.includes('data-external="https://example.com/x"'), 'http(s) was not an external link');
    assert.ok(html.includes(READER.opensInBrowser), 'external link carries no spoken purpose');

    assert.ok(!/href="file:/.test(html), 'a file: link survived');
    assert.ok(!/href="command:/.test(html), 'a command: link survived');
    assert.ok(!/data-(artifact|file|external)="(file|command|javascript):/.test(html));
    assert.ok(!html.includes('data-file="../'), 'a workspace-escaping path survived as a file link');

    for (const text of ['fileScheme', 'commandScheme', 'escaping']) {
      assert.ok(html.includes(text), `${text} lost its text along with its link`);
    }
    assert.equal(anchors(html).length, 5, `unexpected anchors: ${anchors(html).join(' ')}`);
  });

  it('renders checklist glyphs with aria-labels and counts them', () => {
    const rendered = renderArtifact(
      ['- [ ] one', '- [x] two', '- [X] three', '- [~] four', '- plain item'].join('\n'),
      TARGET
    );

    assert.deepEqual(rendered.checklist, { done: 2, total: 4, skipped: 1 });
    assert.ok(rendered.bodyHtml.includes('☐'), 'no ☐ glyph');
    assert.ok(rendered.bodyHtml.includes('☑'), 'no ☑ glyph');
    assert.ok(rendered.bodyHtml.includes('⊘'), 'no ⊘ glyph');
    assert.ok(rendered.bodyHtml.includes(`aria-label="${READER.checkNotDone}"`));
    assert.ok(rendered.bodyHtml.includes(`aria-label="${READER.checkDone}"`));
    assert.ok(rendered.bodyHtml.includes(`aria-label="${READER.checkSkipped}"`));
    assert.ok(rendered.bodyHtml.includes('one'), 'checklist text was dropped');

    assert.equal(renderArtifact('- plain\n- items\n', TARGET).checklist, null);
  });

  it('drops the leading summary region, rewrites in-task images and refuses oversized files', () => {
    const rendered = renderArtifact(
      [
        '# Implementation Plan',
        '',
        '## TL;DR',
        '',
        'Four task groups.',
        '',
        '## Key Decisions',
        '',
        '- Rotate on every use — limits replay',
        '',
        '## Overview',
        '',
        'Body text.'
      ].join('\n'),
      TARGET
    );

    assert.equal(rendered.summary?.tldr, 'Four task groups.');
    assert.ok(
      !rendered.bodyHtml.includes('Four task groups.'),
      `the TL;DR is shown twice: ${rendered.bodyHtml}`
    );
    assert.ok(!rendered.bodyHtml.includes('Key Decisions'), 'the decisions heading stayed in the body');
    assert.ok(rendered.bodyHtml.includes('Body text.'), 'the body after the region was dropped');
    assert.ok(rendered.bodyHtml.includes('id="overview"'), 'headings carry no slug anchors');

    const intact = renderArtifact('# Title\n\n## Overview\n\nOnly a body.\n', TARGET);
    assert.equal(intact.summary, null);
    assert.ok(intact.bodyHtml.includes('Only a body.'));
    assert.ok(intact.bodyHtml.includes('Title'), 'a document with no summary region lost its head');

    const images = body(
      ['![alt one](assets/diagram.png)', '![remote](https://cdn.example.com/x.png)'].join('\n\n')
    );
    assert.ok(
      images.includes('src="https://webview/implementation/assets/diagram.png"'),
      `in-task image was not rewritten: ${images}`
    );
    assert.ok(!images.includes('cdn.example.com'), 'a remote image src survived');
    assert.ok(
      images.includes(`remote ${READER.imageNotLoaded}`),
      `the dropped image kept no alt text: ${images}`
    );

    assert.equal(oversizeNotice(MAX_ARTIFACT_BYTES), null);
    assert.equal(
      oversizeNotice(MAX_ARTIFACT_BYTES + 1),
      format(READER.tooLarge, { size: '2.0 MB' })
    );
  });

  it('re-hosts an HTML companion with the three insertions and refuses a frame or an oversized file (R23, § 6.4)', () => {
    const resources: DashboardResources = {
      cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
      baseHref: 'https://file+.vscode-resource.vscode-cdn.net/w/task/implementation/',
      shimSrc: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/shim.js'
    };
    const source = [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="UTF-8"><title>Plan</title></head>',
      '<body><h1>Implementation Plan</h1><script>render();</script></body></html>'
    ].join('\n');

    const hosted = companionHtml(source, 1_024, resources);
    assert.equal(hosted.ok, true, 'a plain companion was refused');
    if (hosted.ok) {
      assert.ok(hosted.html.includes(`<base href="${resources.baseHref}">`), 'no <base href> insertion');
      assert.ok(hosted.html.includes(resources.shimSrc), 'the shim was not inserted');
      assert.match(hosted.html, /script-src 'nonce-[^']+'/, 'no nonced CSP insertion');
      assert.ok(hosted.html.includes('<h1>Implementation Plan</h1>'), 'the companion body was rewritten');
    }

    const framed = companionHtml(source.replace('<h1>', '<IFRAME src="x.html"></IFRAME><h1>'), 1_024, resources);
    assert.deepEqual(framed, { ok: false, notice: READER.companionIframe }, 'a framed companion was hosted');

    const oversized = companionHtml(source, MAX_ARTIFACT_BYTES + 1, resources);
    assert.deepEqual(
      oversized,
      { ok: false, notice: READER.companionTooLarge },
      'a companion over the 2 MB ceiling was hosted'
    );
  });

  it('R10 — under the docs base a .md link is an artifact link and everything else is a file', () => {
    const docTarget: RenderTarget = {
      kind: 'doc',
      artifactRelPath: 'standards/global/coding-style.md',
      baseRelPath: '.maister/docs',
      imageUri: (relPath) => `https://webview/${relPath}`
    };
    const html = renderArtifact(
      [
        '[css](../frontend/css.md#tokens)',
        '[index](../../INDEX.md)',
        '[page](../../project/overview.html)',
        '[task](../../../tasks/development/x/implementation/spec.md)',
        '[code](../../../../src/panel/render.ts)',
        '[ext](https://example.com/x)',
        '[frag](#naming)',
        '![img](diagram.png)'
      ].join('\n\n'),
      docTarget
    ).bodyHtml;

    assert.ok(html.includes('data-artifact="standards/frontend/css.md#tokens"'), html);
    assert.ok(html.includes('data-artifact="INDEX.md"'), html);
    assert.ok(html.includes('data-file=".maister/docs/project/overview.html"'), html);
    assert.ok(html.includes('data-file=".maister/tasks/development/x/implementation/spec.md"'), html);
    assert.ok(html.includes('data-file="src/panel/render.ts"'), html);
    assert.ok(html.includes('data-external="https://example.com/x"'), html);
    assert.ok(html.includes('href="#naming"'), html);
    assert.ok(html.includes('src="https://webview/standards/global/diagram.png"'), html);
  });
});
