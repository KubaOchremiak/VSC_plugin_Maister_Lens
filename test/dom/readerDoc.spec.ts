import { expect, test } from '@playwright/test';
import { PROJECT, READER, format } from '../../src/strings.ts';
import { focusables, openSurface, readerDocPayload } from './harness.ts';

/** R7/R8 — the reader in doc mode: back control, breadcrumb and docs-root link routing. */

const DOCS = 'file:///workspace/maister-lens/.maister/docs';
const EDIT = `${READER.edit} coding-style.md`;

test('dom: doc mode leads with the "← Project" back control, then a breadcrumb labelled with the doc path; both post openProject', async ({
  page
}) => {
  const surface = await openSurface(page, 'reader', readerDocPayload());

  const controls = await focusables(page);
  expect(controls.map((control) => control.name).slice(1, 3)).toEqual([
    PROJECT.back,
    PROJECT.breadcrumb
  ]);
  await expect(page.locator('nav.rd-crumbs')).toHaveAttribute(
    'aria-label',
    `${PROJECT.breadcrumb} › standards/global/coding-style.md`
  );

  await page.getByRole('button', { name: PROJECT.back }).click();
  await page.locator('nav.rd-crumbs button').click();

  const posted = (await surface.posted()).filter(
    (message) => (message as { type: string }).type === 'openProject'
  );
  expect(posted).toEqual([{ type: 'openProject' }, { type: 'openProject' }]);
});

test('dom: a docs-root link posts openDoc with its anchor split off, and a workspace file link posts openFile', async ({
  page
}) => {
  const surface = await openSurface(page, 'reader', readerDocPayload());

  await page.locator('a', { hasText: 'commenting.md' }).click();
  await page.locator('a', { hasText: 'eslint.config.mjs' }).click();

  const posted = await surface.posted();
  expect(posted).toContainEqual({
    type: 'openDoc',
    docsFolderUri: DOCS,
    docRelPath: 'standards/global/commenting.md',
    anchor: 'rules'
  });
  expect(posted).toContainEqual({ type: 'openFile', workspaceRelPath: 'eslint.config.mjs' });
});

test('dom: doc mode has no Source button and never posts task-scoped messages', async ({ page }) => {
  const surface = await openSurface(page, 'reader', readerDocPayload());

  await expect(page.getByRole('button', { name: READER.openSource })).toHaveCount(0);
  await expect(page.locator('.rd-chips')).toHaveCount(0);
  for (const control of await page.locator('button, a[data-artifact], a[data-file]').all()) {
    await control.click();
  }
  const types = (await surface.posted()).map((message) => (message as { type: string }).type);
  expect(types).not.toContain('openSource');
  expect(types).not.toContain('openArtifact');
  expect(types).not.toContain('openTask');
});

test('dom: a refused doc shows its notice without a Source button', async ({ page }) => {
  await openSurface(page, 'reader', readerDocPayload({ refused: true, notice: 'Too large', bodyHtml: '' }));

  await expect(page.locator('main p.empty')).toHaveText('Too large');
  await expect(page.getByRole('button', { name: READER.openSource })).toHaveCount(0);
});

test('dom: doc mode shows one Edit button outside any nav, right after the back control and breadcrumb', async ({
  page
}) => {
  await openSurface(page, 'reader', readerDocPayload());

  const edit = page.getByRole('button', { name: EDIT, exact: true });
  await expect(edit).toHaveCount(1);
  await expect(page.locator('nav').getByRole('button', { name: EDIT, exact: true })).toHaveCount(0);
  await expect(edit).toHaveAttribute('title', format(READER.editTitle, { file: 'coding-style.md' }));

  const controls = await focusables(page);
  expect(controls.map((control) => control.name).slice(1, 4)).toEqual([
    PROJECT.back,
    PROJECT.breadcrumb,
    EDIT
  ]);
});

test('dom: the doc Edit button posts editDoc for the shown document', async ({ page }) => {
  const surface = await openSurface(page, 'reader', readerDocPayload());

  await page.getByRole('button', { name: EDIT, exact: true }).click();

  const posted = (await surface.posted()).filter(
    (message) => (message as { type: string }).type === 'editDoc'
  );
  expect(posted).toEqual([
    { type: 'editDoc', docsFolderUri: DOCS, docRelPath: 'standards/global/coding-style.md' }
  ]);
});

test('dom: a refused doc still shows Edit and no Source button', async ({ page }) => {
  await openSurface(page, 'reader', readerDocPayload({ refused: true, notice: 'Too large', bodyHtml: '' }));

  await expect(page.getByRole('button', { name: EDIT, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: READER.openSource })).toHaveCount(0);
});
