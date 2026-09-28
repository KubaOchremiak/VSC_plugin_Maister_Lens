import * as path from 'node:path';
import Mocha from 'mocha';

/** The trusted pass runs everything except `trust`, which needs the untrusted host (audit I8). */
const SUITES: Record<string, readonly string[]> = {
  trusted: [
    'a18-resolution',
    'index',
    'attribution',
    'navTree',
    'nowTree',
    'overview',
    'panel',
    'fallbackTask',
    'reader',
    'dashboardMode',
    'followUpsMode',
    'projectMode'
  ],
  untrusted: ['trust']
};

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: false, timeout: 60_000 });
  const suite = SUITES[process.env.MAISTER_TEST_SUITE ?? 'trusted'];
  if (suite === undefined) {
    return Promise.reject(new Error(`unknown test suite ${process.env.MAISTER_TEST_SUITE}`));
  }
  for (const file of suite) {
    mocha.addFile(path.resolve(__dirname, `${file}.test.js`));
  }

  // Lets a single task group verify only its own tests without editing this list.
  const grep = process.env.MAISTER_TEST_GREP;
  if (grep !== undefined && grep !== '') {
    mocha.grep(new RegExp(grep));
  }

  return new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed`));
        return;
      }
      resolve();
    });
  });
}
