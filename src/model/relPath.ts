/**
 * One containment rule for every surface that turns task-authored text into a path: decode
 * first, normalize second, and refuse anything that still leaves the folder. Keeping it in
 * one place is what stops a caller from doing the two steps in the wrong order.
 *
 * This module is free of `vscode` and of every other module, so both the model and the
 * message boundary can use it.
 */

const SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

/**
 * The normalized folder-relative form of `text`, or `null` when it names a scheme, an
 * absolute path, a Windows-separated path or anything that climbs out of the folder.
 */
export function containedRelPath(text: string): string | null {
  if (text === '' || SCHEME.test(text) || text.includes('\\') || text.startsWith('/')) {
    return null;
  }
  const parts: string[] = [];
  for (const segment of text.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.length > 0 ? parts.join('/') : null;
}
