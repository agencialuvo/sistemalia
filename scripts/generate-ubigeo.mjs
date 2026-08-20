// Regenerates src/lib/data/ubigeo-peru.json from the `ubigeos` package
// (INEI/SUNAT-derived, already a dependency of this app and the source used by
// /api/onboarding/ubigeo).
//
// Why a generated file instead of importing `ubigeos` in the browser: the
// package is CommonJS and exposes its data through class instances, neither of
// which tree-shakes or serialises well into a client bundle. Dumping it once
// into a plain nested JSON gives Step 2 a single dynamic import with no server
// round-trips, and keeps the official codes as the source of truth instead of a
// hand-maintained table (~1,800 districts is too many to curate by hand).
//
// Run: node scripts/generate-ubigeo.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Region, Province } = require('ubigeos');

// INEI numbers the 24 departamentos plus the Callao constitutional province
// 01..25.
const REGION_CODES = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0'));

const regions = REGION_CODES.map((code) => {
  const region = Region.instance(code);
  return {
    code: region.getCode(),
    name: region.getName(),
    provinces: region.getProvincies().map((p) => {
      const province = Province.instance(p.getCode());
      return {
        code: p.getCode(),
        name: p.getName(),
        districts: province.getDistricts().map((d) => ({ code: d.getCode(), name: d.getName() })),
      };
    }),
  };
});

const provinceCount = regions.reduce((n, r) => n + r.provinces.length, 0);
const districtCount = regions.reduce(
  (n, r) => n + r.provinces.reduce((m, p) => m + p.districts.length, 0),
  0,
);

const out = 'src/lib/data/ubigeo-peru.json';
writeFileSync(out, JSON.stringify(regions), 'utf8');
console.log(`${out}: ${regions.length} departamentos, ${provinceCount} provincias, ${districtCount} distritos`);
