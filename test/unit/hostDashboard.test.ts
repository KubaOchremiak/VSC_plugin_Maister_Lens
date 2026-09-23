import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FIXTURE_ROOT } from '../helpers/fixtures.ts';
import {
  DashboardRecognizer,
  hostDashboardHtml,
  type DashboardResources
} from '../../src/panel/hostDashboard.ts';

const RESOURCES: DashboardResources = {
  cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
  baseHref: 'https://file+.vscode-resource.vscode-cdn.net/w/task/',
  shimSrc: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/shim.js'
};

const DASHBOARD = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="UTF-8">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
  '<title>Maister Workflow Dashboard</title>',
  '<style>.kpi{color:red}</style>',
  '</head>',
  '<body>',
  '<div style="display:flex"></div>',
  '<script>',
  'const s = document.createElement("script");',
  's.src = "dashboard-data.js?t=" + Date.now();',
  'document.head.appendChild(s);',
  'function render(){ return window.MAISTER_DATA; }',
  '</script>',
  '</body>',
  '</html>'
].join('\n');

/** The same document with no head of its own, for the vectors that forge one in the body. */
const HEADLESS = DASHBOARD.replace('<head>\n', '')
  .replace('</head>\n', '')
  .replace('<meta charset="UTF-8">\n', '');

/** Every assertion below is about a document that must be hostable. */
function hosted(source: string): string {
  const html = hostDashboardHtml(source, RESOURCES);
  assert.ok(html !== null, 'a hostable document was refused');
  return html;
}

function nonceOf(html: string): string {
  const match = /script-src 'nonce-([^']+)'/.exec(html);
  assert.ok(match, 'the hosted html carries no script-src nonce');
  return match[1];
}

describe('hostDashboard/unit', () => {
  it('makes exactly the three insertions, places the CSP meta after <meta charset> (audit I5) and nonces every inline script', () => {
    const html = hosted(DASHBOARD);
    const nonce = nonceOf(html);

    assert.equal(
      Buffer.from(nonce, 'base64').length,
      32,
      'the nonce is not a fresh 32-byte value'
    );
    assert.notEqual(
      nonceOf(hosted(DASHBOARD)),
      nonce,
      'the nonce is not regenerated per render'
    );

    const charsetAt = html.indexOf('<meta charset="UTF-8">');
    const cspAt = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    const headAt = html.indexOf('<head>');
    assert.ok(cspAt > charsetAt, 'the CSP meta was inserted before the charset declaration (I5)');
    assert.equal(
      html.slice(charsetAt + '<meta charset="UTF-8">'.length).trimStart().indexOf('<meta http-equiv'),
      0,
      'the CSP meta does not sit immediately after the charset declaration'
    );
    assert.ok(headAt < charsetAt, 'the head element was rewritten');

    assert.equal(
      (html.match(/http-equiv="Content-Security-Policy"/g) ?? []).length,
      1,
      "the dashboard's own CSP meta was not removed"
    );
    assert.ok(!html.includes("default-src 'self'"), "the dashboard's own policy survived");
    assert.ok(
      html.includes(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${RESOURCES.cspSource} data:; style-src ${RESOURCES.cspSource} 'unsafe-inline'; font-src ${RESOURCES.cspSource}; script-src 'nonce-${nonce}';">`
      ),
      'the policy is not the § 5.3 policy'
    );
    assert.ok(html.includes(`<base href="${RESOURCES.baseHref}">`), 'no <base href> insertion');
    assert.ok(
      html.includes(`<script nonce="${nonce}" src="${RESOURCES.shimSrc}"></script>`),
      'no nonced shim insertion'
    );

    assert.ok(html.includes(`<script nonce="${nonce}">`), 'the inline script did not gain the nonce');
    assert.equal(
      (html.match(/<script/g) ?? []).length,
      2,
      'the hosted html gained or lost a script element'
    );

    const untouched = html
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g, '')
      .replace(/<base href="[^"]*">/, '')
      .replace(new RegExp(`<script nonce="[^"]*" src="[^"]*"></script>`), '')
      .replace(new RegExp(`<script nonce="[^"]*">`), '<script>')
      .replace(/\n+/g, '\n');
    assert.equal(
      untouched.replace(/\n/g, ''),
      DASHBOARD.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/\n/g, ''),
      'the dashboard markup, styles or script logic changed beyond the three insertions'
    );
  });

  it('recognize() requires the four structural signals, states its reason and caches per (mtime, size)', async () => {
    const recognizer = new DashboardRecognizer();
    const stat = { mtime: 1, size: DASHBOARD.length };

    assert.deepEqual(await recognizer.recognize('a', stat, async () => DASHBOARD), {
      recognized: true
    });

    const cases: [string, string, RegExp][] = [
      ['no-loader', DASHBOARD.replace(/dashboard-data\.js/g, 'data.js'), /dashboard-data\.js/],
      ['no-global', DASHBOARD.replace(/MAISTER_DATA/g, 'OTHER_DATA'), /MAISTER_DATA/],
      [
        'no-inline',
        DASHBOARD.replace(
          /<script>[\s\S]*?<\/script>/,
          '<script src="dashboard-data.js"></script><!-- MAISTER_DATA -->'
        ),
        /inline/i
      ],
      ['iframe', DASHBOARD.replace('<body>', '<body><iframe src="x.html"></iframe>'), /iframe/i]
    ];
    for (const [key, source, reason] of cases) {
      const result = await recognizer.recognize(key, stat, async () => source);
      assert.equal(result.recognized, false, `${key} was recognized as hostable`);
      assert.match(result.recognized ? '' : result.reason, reason);
    }

    let reads = 0;
    const counting = async (): Promise<string> => {
      reads += 1;
      return DASHBOARD;
    };
    await recognizer.recognize('b', stat, counting);
    await recognizer.recognize('b', stat, counting);
    assert.equal(reads, 1, 'an unchanged (mtime, size) pair was read twice');

    const changed = await recognizer.recognize(
      'b',
      { mtime: 2, size: stat.size },
      async () => DASHBOARD.replace(/MAISTER_DATA/g, 'OTHER_DATA')
    );
    assert.equal(changed.recognized, false, 'a changed mtime did not invalidate the cache');
  });
  it('never nonces a <script src> whose quoted attribute value hides a > (the only route out of default-src none)', () => {
    const remote = '<script data-x=">" src="https://evil.example/x.js"></script>';
    const html = hosted(DASHBOARD.replace('<body>', `<body>${remote}`));

    assert.ok(html.includes(remote), 'the remote script tag was rewritten');
    assert.equal(
      (html.match(/nonce=/g) ?? []).length,
      2,
      'a nonce reached a tag other than the shim and the inline script'
    );
    assert.ok(
      !new RegExp(`<script nonce="[^"]*"[^>]*evil\\.example`).test(html),
      'the remote script was authorized by the nonce'
    );
  });

  it('removes a CSP meta whose earlier attribute value contains a >', () => {
    const html = hosted(
      DASHBOARD.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        '<meta content="a>b" http-equiv="Content-Security-Policy">'
      )
    );
    assert.equal(
      (html.match(/http-equiv="Content-Security-Policy"/g) ?? []).length,
      1,
      'the foreign CSP meta survived removal'
    );
    assert.ok(!html.includes('content="a>b"'), 'the foreign CSP meta survived removal');
  });

  it('refuses a document with no <head>, where a CSP meta would be ignored (fails closed)', async () => {
    const headless =
      '<!DOCTYPE html><html><body><div></div>' +
      '<script>/*MAISTER_DATA dashboard-data.js*/</script></body></html>';

    const recognition = await new DashboardRecognizer().recognize(
      'headless',
      { mtime: 1, size: headless.length },
      async () => headless
    );
    assert.equal(recognition.recognized, false, 'a headless document was recognized as hostable');
    assert.match(recognition.recognized ? '' : recognition.reason, /head/i);
    assert.equal(
      hostDashboardHtml(headless, RESOURCES),
      null,
      'a headless document was hosted without a placeable policy'
    );
  });

  it("refuses every document whose <head> is not the head Chromium would build (the policy would be ignored there)", async () => {
    // Each body below made a scanner believe it had found a head; in Chromium none of them is
    // head content, so the inserted policy was ignored and the document ran with none at all.
    const vectors: [string, string][] = [
      ['noscript', '<noscript><head></noscript>'],
      ['template', '<template><head></template>'],
      ['after body content', '<p>hi</p><head>'],
      ['attribute value', '<div title="<head>"></div>'],
      ['script raw text', '<script>var poison = "</scriptx <head>";</script>']
    ];

    for (const [key, body] of vectors) {
      const source = HEADLESS.replace('<body>', `<body>${body}`);
      assert.equal(hostDashboardHtml(source, RESOURCES), null, `${key} was hosted`);
      const recognition = await new DashboardRecognizer().recognize(
        key,
        { mtime: 1, size: source.length },
        async () => source
      );
      assert.equal(recognition.recognized, false, `${key} was recognized as hostable`);
    }
  });

  it('accepts only a head reached by the opening grammar, and hosts both committed dashboards', async () => {
    const accepted = [
      DASHBOARD,
      DASHBOARD.replace('<!DOCTYPE html>', ''),
      DASHBOARD.replace('<!DOCTYPE html>', '﻿<!doctype   HTML >'),
      DASHBOARD.replace('<head>', '<!-- banner --><head data-v="1">'),
      DASHBOARD.replace('<html lang="en">', '<html\nlang="en"\n>')
    ];
    for (const source of accepted) {
      assert.notEqual(
        hostDashboardHtml(source, RESOURCES),
        null,
        `a conforming document was refused: ${source.slice(0, 60)}`
      );
    }

    const refused = [
      DASHBOARD.replace('<!DOCTYPE html>', '<!DOCTYPE html SYSTEM "about:legacy-compat">'),
      DASHBOARD.replace('<!DOCTYPE html>', '<p>stray</p>'),
      DASHBOARD.replace('<html lang="en">\n', ''),
      DASHBOARD.replace('<head>', '<body><head>'),
      DASHBOARD.replace('<head>', '<!-- unterminated comment <head>')
    ];
    for (const source of refused) {
      assert.equal(
        hostDashboardHtml(source, RESOURCES),
        null,
        `a non-conforming document was hosted: ${source.slice(0, 60)}`
      );
    }

    // The grammar must not cost the feature: Maister's own committed dashboards still host.
    for (const task of ['dev-real', 'pd-real']) {
      const real = fs.readFileSync(path.join(FIXTURE_ROOT, task, 'dashboard.html'), 'utf8');
      const recognition = await new DashboardRecognizer().recognize(
        task,
        { mtime: 1, size: real.length },
        async () => real
      );
      assert.deepEqual(recognition, { recognized: true }, `${task} is no longer recognized`);
      assert.notEqual(hostDashboardHtml(real, RESOURCES), null, `${task} is no longer hostable`);
    }
  });

  it('refuses a document whose tags cannot be read attribute by attribute', async () => {
    const malformed = `${DASHBOARD}\n<script src="unterminated`;

    assert.equal(hostDashboardHtml(malformed, RESOURCES), null, 'a malformed tag was hosted');
    const recognition = await new DashboardRecognizer().recognize(
      'malformed',
      { mtime: 1, size: malformed.length },
      async () => malformed
    );
    assert.equal(recognition.recognized, false, 'a malformed document was recognized');
  });
});
