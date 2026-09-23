import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

// A layout preview, not a screenshot of an installed VS Code instance.
const svg = await readFile(new URL('../media/maister.svg', import.meta.url), 'utf8');
const png = await readFile(new URL('../media/icon.png', import.meta.url));
const out = new URL('../docs/branding/preview.png', import.meta.url);
await mkdir(new URL('../docs/branding/', import.meta.url), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 440 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box } body { margin:0; font:15px system-ui; display:flex }
    section { width:50%; height:440px; padding:32px; background:#fff; color:#202020 }
    section.dark { background:#181818; color:#eee }
    h1 { font-size:22px; margin:0 0 24px } h2 { font-size:14px; font-weight:500 }
    .icons { display:flex; align-items:center; gap:32px; height:64px }
    img { width:128px; height:128px; border-radius:8px }
    small { display:block; margin-top:20px; opacity:.7 }
    .large svg { width:48px; height:48px }
  </style></head><body>${['Light', 'Dark'].map(t => `<section class="${t.toLowerCase()}">
    <h1>${t} theme · icon preview</h1><h2>Activity Bar · 24px / 48px</h2>
    <div class="icons">${svg}<span class="large">${svg}</span></div>
    <h2>Marketplace artwork · 128px</h2><img alt="Maister Lens" src="data:image/png;base64,${png.toString('base64')}">
    <small>Design preview — not an installed VS Code screenshot</small></section>`).join('')}</body></html>`);
  await page.screenshot({ path: out.pathname });
  console.log(out.pathname);
} finally {
  await browser.close();
}
