# Shipping Maister Lens

The repository can build a Marketplace VSIX. Publication still requires a publisher
account you control and completion of the manual checks below. No Marketplace upload
is performed by any npm script in this repository.

## Identity and release metadata

- Extension name: `maister-lens`; display name: **Maister Lens**.
- Candidate version: `0.1.1`. Local VSIX installation does not reserve a Marketplace version.
- Publisher in `package.json`: `jakub-ochremiak`. **Unregistered placeholder; publication
  is blocked until you register and confirm the final ID.** Confirm this
  ID in [publisher management](https://marketplace.visualstudio.com/manage), or change
  `publisher` to the ID you own before building the final package.
- Repository: https://github.com/KubaOchremiak/VSC_Maister_plugin.
- `private: true` prevents accidental npm publication; it does not make a Marketplace
  extension private. A Marketplace release is public.
- Before uploading, reconcile `CHANGELOG.md`'s Unreleased entries with the version
  being shipped. Increase `package.json` and lockfile versions for subsequent releases.

## Build and check

Use Node.js 22.18 or newer and npm. From a clean checkout:

```sh
npm ci
npx playwright install chromium
npm run verify:release
```

This runs lint, TypeScript checking, unit tests, DOM/theme tests, trusted and untrusted
VS Code integration hosts, minimum-version integration tests, then builds the VSIX.
Integration tests open isolated VS Code windows and may download test hosts.
The minimum-version run currently uses the pinned host for its untrusted pass; see
README's known limitations. Tests are not a substitute for checking a packaged install.

To package without rerunning checks:

```sh
npm run package
```

`vscode:prepublish` builds fresh esbuild bundles. `--no-dependencies` is intentional:
`yaml` and `markdown-it` are bundled. `.vscodeignore` excludes task data, source,
tests, development documentation, dependencies and source maps.

Inspect the package before upload:

```sh
unzip -l maister-lens-0.1.1.vsix
code --install-extension ./maister-lens-0.1.1.vsix
```

Expected contents include `dist/`, `media/`, `package.json`, README, CHANGELOG,
LICENSE and SUPPORT. Review any unexpected files. Reload VS Code after installation.

## Verification recorded on 2026-09-23

Executed on macOS arm64 with Node.js v26:

| Check | Result |
|---|---|
| ESLint and TypeScript | Passed |
| Unit tests | 54 passed |
| Playwright DOM/security/theme tests | 19 passed |
| VS Code 1.138.0 integration | 39 trusted + 1 untrusted passed |
| VS Code 1.90.0 integration | 39 trusted passed; untrusted pass uses 1.138.0 (1 passed) |
| VSIX build and contents | Passed; 18 archive entries, correct PNG/SVG assets, publisher placeholder and MIT holder |
| Icon layout preview | Inspected at 24px/48px (SVG) and 128px (PNG), on light and dark surfaces |

Browser tests needed permission to launch Chromium outside the filesystem sandbox.
The initial integration run exposed a hard-coded old publisher ID in the smoke test;
it now reads the manifest, and both host suites passed on rerun. The preview verifies
asset rendering, not the actual Activity Bar. Publisher registration and the manual
checks below remain outstanding. Rerun verification after changing the final identity
or implementation.

## Manual release sign-off — pending

Record tester, date, OS and VS Code version beside each completed check. These boxes
are intentionally unsigned until a person verifies the packaged extension.

- [ ] Install the VSIX in a fresh profile and open a workspace with Maister tasks.
- [ ] Check the Activity Bar icon at normal and high display scaling in Light Modern,
  Dark Modern, High Contrast Light and High Contrast Dark. Check inactive and selected states.
- [ ] In each theme, inspect Tasks, Now, Dashboard, Risks, fallback Task and Markdown reader;
  verify readable labels, selected/hovered filters, native controls and keyboard focus.
- [ ] Switch themes while a panel is open; verify colors update without reopening it.
- [ ] Check hosted task HTML and HTML companions with the OS and editor themes different.
  Authored pages may use OS preferences or fixed colors; this release does not rewrite
  arbitrary task CSS. Verify Markdown mode as the theme-aware alternative for artifacts.
- [ ] Check keyboard-only navigation and screen-reader labels.
- [ ] Open tasks and artifacts, return to Dashboard, navigate back/forward and refresh.
- [ ] Verify launching against real Claude Code/Copilot/terminal installations, plus clipboard.
- [ ] Verify an untrusted workspace renders safe fallback content and refuses launching.
- [ ] Review README, screenshots, license, changelog, publisher ID and package contents.

## Upload the reviewed VSIX

1. Sign in to [Marketplace publisher management](https://marketplace.visualstudio.com/manage).
2. Create or select the publisher whose ID matches `package.json`.
3. Choose **New extension → Visual Studio Code** and upload the reviewed VSIX.
4. Wait for Marketplace validation; inspect the listing and install it from VS Code.
5. For later releases, increase the version, update the changelog, repeat verification,
   and upload the new VSIX through the existing extension's management page.

Manual browser upload does not require a CLI publishing token. For automated releases,
follow Microsoft's Microsoft Entra ID guidance; global Azure DevOps PATs retire on
December 1, 2026. Do not put credentials in the repository.

References: [publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
[manifest](https://code.visualstudio.com/api/references/extension-manifest),
[webview theming](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content).
