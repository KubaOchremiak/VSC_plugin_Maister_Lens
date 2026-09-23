import { strict as assert } from 'node:assert';

interface ToolchainProbe {
  readonly nodeMajor: number;
  readonly label: string;
}

function describeRuntime(): ToolchainProbe {
  const [major] = process.versions.node.split('.');
  return { nodeMajor: Number(major), label: 'typescript' };
}

describe('smoke/unit', () => {
  it('mocha executes a TypeScript test on Node v26', () => {
    const probe: ToolchainProbe = describeRuntime();
    assert.equal(probe.label, 'typescript');
    assert.ok(
      probe.nodeMajor >= 26,
      `expected Node 26 or newer, got ${process.versions.node}`
    );
  });
});
