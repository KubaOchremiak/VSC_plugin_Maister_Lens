import { strict as assert } from 'node:assert';
import * as strings from '../../src/strings.ts';

const FORBIDDEN = /\b(running|waiting|stalled|abandoned)\b/i;

function collectStrings(value: unknown, path: string, into: Map<string, string>): void {
  if (typeof value === 'string') {
    into.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, into));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, `${path}.${key}`, into);
    }
  }
}

describe('strings', () => {
  it('exports no user-facing copy matching /\\b(running|waiting|stalled|abandoned)\\b/i (AC13)', () => {
    const found = new Map<string, string>();
    collectStrings(strings, 'strings', found);

    assert.ok(found.size > 0, 'src/strings.ts exports no strings at all');

    const offenders = [...found].filter(([, text]) => FORBIDDEN.test(text));
    assert.deepEqual(offenders, [], `forbidden wording in src/strings.ts: ${JSON.stringify(offenders)}`);
  });
});
