import { expect, test } from '@playwright/test';
import { PROJECT, format } from '../../src/strings.ts';
import { headings, openSurface, projectPayload, projectSection, texts } from './harness.ts';

/** R5/R6 — the Project page: TL;DR card, grouped doc rows, multi-root sections and the empty state. */

test('dom: a single root shows h1, the TL;DR card with plain-text stack and no chips, then the groups in order', async ({
  page
}) => {
  await openSurface(page, 'projectMode', projectPayload());

  expect(await headings(page, 'h1')).toEqual([PROJECT.heading]);
  await expect(page.locator('h2')).toHaveCount(0);
  await expect(page.locator('.chip, .chips')).toHaveCount(0);

  const tldr = page.locator('section.project-tldr');
  expect(await texts(page, 'section.project-tldr .summary-label')).toEqual([
    PROJECT.goalLabel,
    PROJECT.techStackLabel
  ]);
  await expect(tldr.locator('.summary-value').nth(1)).toHaveText(
    'TypeScript on the VS Code Extension API.'
  );
  await expect(page.locator('.missing-note')).toHaveCount(0);

  expect(await headings(page, 'h3.group-heading')).toEqual([
    'Index (1)',
    'Project (2)',
    'Standards · Global (1)'
  ]);
  expect(await texts(page, 'li.trow .trow-title')).toEqual([
    'Index',
    'Tech stack',
    'Vision',
    'Coding style'
  ]);
});

test('dom: a doc row click and a TL;DR source link post openDoc with the folder and doc path', async ({
  page
}) => {
  const surface = await openSurface(page, 'projectMode', projectPayload());

  await page.locator('li.trow .trow-title', { hasText: 'Coding style' }).click();
  await page.locator('section.project-tldr button.link').first().click();

  const posted = await surface.posted();
  expect(posted).toContainEqual({
    type: 'openDoc',
    docsFolderUri: 'file:///workspace/maister-lens',
    docRelPath: 'standards/global/coding-style.md'
  });
  expect(posted).toContainEqual({
    type: 'openDoc',
    docsFolderUri: 'file:///workspace/maister-lens',
    docRelPath: 'project/vision.md'
  });
});

test('dom: multi-root shows one section per folder headed by its name, and a partial TL;DR carries the missing note', async ({
  page
}) => {
  await openSurface(
    page,
    'projectMode',
    projectPayload({
      multiRoot: true,
      sections: [
        projectSection(),
        projectSection({
          folderName: 'api-server',
          docsFolderUri: 'file:///workspace/api-server',
          tldr: { goal: 'Serve the API.', goalSource: 'project/vision.md' }
        })
      ]
    })
  );

  expect(await headings(page, 'h2')).toEqual(['maister-lens', 'api-server']);
  const second = page.locator('section.project-folder').nth(1);
  expect(await second.locator('.summary-label').allTextContents()).toEqual([PROJECT.goalLabel]);
  await expect(second.locator('.missing-note')).toHaveText(
    format(PROJECT.missing, { field: PROJECT.techStackLabel })
  );
  expect(await second.locator('section.project-tldr > *').last().getAttribute('class')).toContain('missing-note');
  await expect(page.locator('section.project-folder').first().locator('.missing-note')).toHaveCount(0);
});

test('dom: with no docs anywhere the page shows h1 and one empty block with the /maister:init hint', async ({
  page
}) => {
  await openSurface(page, 'projectMode', projectPayload({ sections: [], empty: true }));

  expect(await headings(page, 'h1')).toEqual([PROJECT.heading]);
  const empty = page.locator('.empty');
  await expect(empty).toHaveCount(1);
  await expect(empty).toContainText(PROJECT.empty);
  await expect(empty.locator('code')).toHaveText('/maister:init');
  await expect(empty).toContainText(PROJECT.initHint);
  await expect(page.locator('li.trow')).toHaveCount(0);
});

test('dom: a group header collapses its rows', async ({ page }) => {
  await openSurface(page, 'projectMode', projectPayload());

  const header = page.locator('button.group-header').first();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('li.trow', { hasText: 'INDEX.md' })).toBeHidden();
});

test('dom: a missing goal is named and shown in the goal slot, before the tech stack', async ({ page }) => {
  await openSurface(
    page,
    'projectMode',
    projectPayload({
      sections: [projectSection({ tldr: { techStack: 'Rust.', techStackSource: 'project/tech-stack.md' } })]
    })
  );

  const tldr = page.locator('section.project-tldr');
  await expect(tldr.locator('.missing-note')).toHaveText(
    format(PROJECT.missing, { field: PROJECT.goalLabel })
  );
  expect(await tldr.locator('> *').first().getAttribute('class')).toContain('missing-note');
});
