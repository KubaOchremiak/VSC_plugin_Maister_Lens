import { expect, test, type Page } from '@playwright/test';
import {
  openSurface, overviewPayload, fallbackPayload, readerPayload,
  dashboardPayload, risksPayload
} from './harness.ts';

const themes = [
  { name: 'vscode-light', scheme: 'light', fg: '#202020', bg: '#ffffff', badge: '#404040', badgeFg: '#ffffff' },
  { name: 'vscode-dark', scheme: 'dark', fg: '#eeeeee', bg: '#181818', badge: '#dddddd', badgeFg: '#181818' },
  { name: 'vscode-high-contrast-light', scheme: 'light', fg: '#000000', bg: '#ffffff', badge: '#000000', badgeFg: '#ffffff' },
  { name: 'vscode-high-contrast', scheme: 'dark', fg: '#ffffff', bg: '#000000', badge: '#ffffff', badgeFg: '#000000' }
] as const;

async function applyTheme(page: Page, theme: typeof themes[number]): Promise<void> {
  await page.evaluate((t) => {
    document.body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast-light', 'vscode-high-contrast');
    document.body.classList.add(t.name);
    const tokens: Record<string, string> = {
      foreground: t.fg, 'editor-foreground': t.fg, 'editor-background': t.bg,
      'sideBar-background': t.bg, 'badge-background': t.badge, 'badge-foreground': t.badgeFg,
      'list-hoverBackground': t.bg, 'list-hoverForeground': t.fg,
      'list-activeSelectionBackground': t.fg, 'list-activeSelectionForeground': t.bg,
      focusBorder: t.fg, contrastBorder: t.fg, 'input-background': t.bg,
      'input-foreground': t.fg, 'descriptionForeground': t.fg,
      'font-family': 'sans-serif', 'font-size': '13px'
    };
    for (const [key, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(`--vscode-${key}`, value);
    }
  }, theme);
}

for (const [bundle, payload] of [
  ['overview', overviewPayload()], ['fallbackTask', fallbackPayload()],
  ['reader', readerPayload()], ['dashboardMode', dashboardPayload()], ['risksMode', risksPayload()]
] as const) {
  test(`theme: ${bundle} updates colors and native controls without reload`, async ({ page }) => {
    await openSurface(page, bundle, payload);
    for (const theme of themes) {
      await applyTheme(page, theme);
      await expect(page.locator('body')).toHaveCSS('color-scheme', theme.scheme);
      const colors = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const probe = document.createElement('span');
        probe.style.color = 'var(--vscode-foreground)';
        probe.style.backgroundColor = 'var(--vscode-editor-background)';
        document.body.append(probe);
        const expected = getComputedStyle(probe);
        const result = [body.color, expected.color, body.backgroundColor, expected.backgroundColor];
        probe.remove();
        return result;
      });
      expect(colors[0]).toBe(colors[1]);
      expect(colors[2]).toBe(colors[3]);
      expect(colors[0]).not.toBe(colors[2]);
    }
  });
}

test('theme: filter text and counts share contrasting colors through hover and selection', async ({ page }) => {
  await openSurface(page, 'overview', overviewPayload());
  const tile = page.locator('.tile').first();
  for (const theme of themes) {
    await applyTheme(page, theme);
    await tile.evaluate((el) => el.setAttribute('aria-pressed', 'false'));
    await page.mouse.move(0, 0);
    for (const state of ['default', 'hover', 'selected']) {
      if (state === 'hover') await tile.hover();
      if (state === 'selected') await tile.evaluate((el) => el.setAttribute('aria-pressed', 'true'));
      const result = await tile.evaluate((el) => {
        const style = getComputedStyle(el);
        const count = el.querySelector('.tile-count');
        return { fg: style.color, bg: style.backgroundColor, count: count ? getComputedStyle(count).color : style.color };
      });
      expect(result.fg).not.toBe(result.bg);
      expect(result.count).toBe(result.fg);
    }
    await tile.focus();
    await expect(tile).toHaveCSS('outline-style', 'solid');
  }
});
