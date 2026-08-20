import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_LOCALE } from './request';

// Sistema LIA ships in Spanish only: src/i18n/request.ts imports es.json
// statically and pins the locale, so es.json is the source of truth and the
// only catalogue the app ever loads.
//
// This test used to assert the opposite — en.json as the source, with es.json
// required to mirror it key for key — from when the locale came from
// NEXT_PUBLIC_APP_LOCALE and fell back to English. That fallback no longer
// exists, so requiring en.json to grow a translation for every new
// Spanish-only module would only mean writing English nobody reads.
//
// What still matters, and is what this checks: the dormant catalogues must not
// drift AHEAD of the live one. A key in en.json or ko.json with no counterpart
// in es.json is either a leftover from a deleted feature or a string somebody
// added to the wrong file, and the app would render neither.

const MESSAGES_DIR = join(process.cwd(), 'messages');
const SOURCE_LOCALE = 'es';
const DORMANT_LOCALES = ['en', 'ko'];

function loadKeys(locale: string): Set<string> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  const out = new Set<string>();
  const walk = (node: unknown, path: string) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
      return;
    }
    out.add(path);
  };
  walk(JSON.parse(raw), '');
  return out;
}

describe('message catalogue', () => {
  const source = loadKeys(SOURCE_LOCALE);

  it('the app is pinned to the catalogue this test treats as the source', () => {
    expect(APP_LOCALE).toBe(SOURCE_LOCALE);
  });

  it('the live catalogue is not empty', () => {
    expect(source.size).toBeGreaterThan(1000);
  });

  it.each(DORMANT_LOCALES)('%s.json has no keys absent from es.json', (locale) => {
    const dormant = loadKeys(locale);
    const orphaned = [...dormant].filter((k) => !source.has(k)).sort();
    expect(orphaned, `${locale}.json has keys that es.json does not`).toEqual([]);
  });
});
