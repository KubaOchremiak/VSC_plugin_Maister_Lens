import { strict as assert } from 'node:assert';
import { quoteForShell } from '../../src/launch/launch.ts';

describe('quote/unit', () => {
  it('quotes a composed command for the shell env.shell names (§ 7.5)', () => {
    const plain = '/maister:work .maister/tasks/development/2026-01-01-a';
    const tricky = "/maister:work don't-stop; rm -rf /";

    for (const shell of ['/bin/zsh', '/bin/bash', '/usr/bin/fish', undefined]) {
      assert.equal(quoteForShell(plain, shell), `'${plain}'`, `POSIX ${String(shell)}`);
      assert.equal(
        quoteForShell(tricky, shell),
        "'/maister:work don'\\''t-stop; rm -rf /'",
        `POSIX escaping for ${String(shell)}`
      );
    }

    for (const shell of [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      '/usr/local/bin/pwsh'
    ]) {
      assert.equal(quoteForShell(plain, shell), `'${plain}'`, shell);
      assert.equal(
        quoteForShell(tricky, shell),
        "'/maister:work don''t-stop; rm -rf /'",
        `PowerShell doubles the single quote (${shell})`
      );
    }

    assert.equal(
      quoteForShell('/maister:work say "hi"', 'C:\\WINDOWS\\System32\\cmd.exe'),
      '"/maister:work say ""hi"""',
      'cmd.exe doubles the double quote'
    );
    assert.equal(quoteForShell(tricky, 'C:\\WINDOWS\\System32\\cmd.exe'), `"${tricky}"`);
  });
});
