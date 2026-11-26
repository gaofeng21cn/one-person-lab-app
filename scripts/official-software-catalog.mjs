import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OFFICIAL_SOFTWARE_CATALOG = Object.freeze(JSON.parse(fs.readFileSync(
  new URL('../contracts/app-software-catalog-source.json', import.meta.url), 'utf8',
)));

export function officialSoftwareCatalogIndexUrl(source = OFFICIAL_SOFTWARE_CATALOG) {
  if (source.repository !== 'gaofeng21cn/opl-catalog' || !/^[a-f0-9]{40}$/.test(source.ref)) {
    throw new Error('Full source requires an exact official software catalog commit.');
  }
  return `https://raw.githubusercontent.com/${source.repository}/${source.ref}/catalog-index.json`;
}

export function readOfficialSoftwareCatalog(bytes, source = OFFICIAL_SOFTWARE_CATALOG) {
  const actual = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== source.index_sha256) throw new Error('Official software catalog index bytes differ from the frozen SHA-256.');
  const index = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (index.schema_version !== 'opl_software_catalog_index.v1' || !Array.isArray(index.packages)
      || new Set(index.packages.map((entry) => entry.package_id)).size !== index.packages.length) {
    throw new Error('Official software catalog index is invalid.');
  }
  return index;
}

export function requireCatalogSourceSeed(index, id) {
  const entry = index.packages.find((candidate) => candidate.package_id === id);
  const manifest = entry?.manifest;
  if (manifest?.package_id !== id || !/^[a-f0-9]{40}$/.test(manifest.codex_surface?.carrier_source_commit ?? '')) {
    throw new Error(`Frozen software catalog has no exact source seed for ${id}.`);
  }
  return manifest;
}

export function stageOfficialSoftwareCatalog(indexPath, destination) {
  const bytes = fs.readFileSync(indexPath);
  const index = readOfficialSoftwareCatalog(bytes);
  for (const entry of index.packages) {
    for (const field of ['manifest', 'payload', 'allowlist']) {
      if (!entry[field]) continue;
      const relative = entry[`${field}_path`];
      if (typeof relative !== 'string' || !/^(?:packages\/(?:agents|applications|extensions|channels|dependencies|payloads)|allowlists)\/[A-Za-z0-9._-]+\.json$/.test(relative)) {
        throw new Error(`Official software catalog has an invalid ${field} path for ${entry.package_id}.`);
      }
      const target = path.join(destination, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(entry[field], null, 2)}\n`);
    }
  }
  fs.writeFileSync(path.join(destination, 'catalog-index.json'), bytes);
}
