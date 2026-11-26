#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OFFICIAL_SOFTWARE_CATALOG, officialSoftwareCatalogIndexUrl, readOfficialSoftwareCatalog,
} from './official-software-catalog.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioPluginGroups = ['core', 'extensions', 'channels'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const args = { studioRoot: path.resolve(appRoot, '..', 'opl-studio') };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--studio-root' || value === '--catalog-index') {
      const key = value === '--studio-root' ? 'studioRoot' : 'catalogIndex';
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a path`);
      args[key] = path.resolve(next);
      index += 1;
      continue;
    }
    if (value === '--help' || value === '-h') {
      console.log('Usage: node scripts/plugin-composition-inventory.mjs [--studio-root PATH] [--catalog-index PATH]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function listDirectories(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

function readStudioInventory(root) {
  const pluginsRoot = path.join(root, 'plugins');
  const pluginDirectories = listDirectories(pluginsRoot).flatMap(directory => {
    if (!studioPluginGroups.includes(directory)) return [{ directory, group: null }];
    return listDirectories(path.join(pluginsRoot, directory)).map(name => ({ directory: name, group: directory }));
  });
  const plugins = pluginDirectories.flatMap(({ directory, group }) => {
    const relativeDirectory = group ? path.join('plugins', group, directory) : path.join('plugins', directory);
    const packagePath = path.join(root, relativeDirectory, 'package.json');
    if (!fs.existsSync(packagePath)) return [];
    const packageJson = readJson(packagePath);
    return [{
      directory,
      group,
      package_name: packageJson.name ?? null,
      description: packageJson.description ?? null,
      has_host_entry: Boolean(packageJson.exports?.['.']),
      has_client_entry: Boolean(packageJson.exports?.['./client']),
      dsh_manifest: packageJson.dsh ?? null,
      source_path: path.join(relativeDirectory, 'package.json'),
    }];
  });
  const profilePath = path.join(root, 'contracts', 'opl-studio-profile.json');
  const profile = fs.existsSync(profilePath) ? readJson(profilePath) : null;
  const cordis = fs.existsSync(path.join(root, 'src/host/dsh/cordis.yml'))
    ? fs.readFileSync(path.join(root, 'src/host/dsh/cordis.yml'), 'utf8') : '';
  const webPatch = fs.existsSync(path.join(root, 'src/host/dsh/web.patch.yml'))
    ? fs.readFileSync(path.join(root, 'src/host/dsh/web.patch.yml'), 'utf8') : '';
  return {
    root,
    source_kind: 'dsh_application_host_repository',
    plugin_directories: plugins,
    profile_plugins: profile?.application_host?.studio_plugins ?? [],
    profile_source: profile?.application_host?.profile_source ?? null,
    cordis_plugin_names: [...cordis.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?/gm)].map(match => match[1]),
    web_overlay_plugin_names: [...webPatch.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?/gm)].map(match => match[1]),
  };
}

function readAppOwnedPackages(root) {
  const packagesRoot = path.join(root, 'packages');
  return listDirectories(packagesRoot).flatMap(directory => {
    const manifestPath = path.join(packagesRoot, directory, 'opl-package.json');
    if (!fs.existsSync(manifestPath)) return [];
    const manifest = readJson(manifestPath);
    return [{
      package_id: manifest.package_id ?? null,
      source_repo: manifest.source_repo ?? null,
      package_role: manifest.package_role ?? null,
      integration_kind: manifest.integration_kind ?? null,
      codex_interaction_mode: manifest.codex_surface?.interaction_mode ?? null,
      carrier_kind: manifest.codex_surface?.configured_codex_plugin_carrier?.kind ?? null,
      app_contribution_count: manifest.app_contributions?.views?.length ?? 0,
      source_path: path.relative(root, manifestPath),
    }];
  });
}

function readCatalogPackages(index) {
  return index.packages.map(entry => {
    const manifest = entry.manifest;
    const carrier = manifest?.codex_surface?.configured_codex_plugin_carrier;
    return {
      package_id: entry.package_id,
      software_type: entry.software_type,
      visibility: entry.visibility,
      source_repo: manifest?.source_repo ?? null,
      package_role: manifest?.package_role ?? null,
      management_scope: manifest?.management_scope ?? null,
      has_app_contributions: manifest ? Boolean(manifest.app_contributions) : null,
      app_contribution_count: manifest ? manifest.app_contributions?.views?.length ?? 0 : null,
      carrier_kind: carrier?.kind ?? null,
      carrier_selector: carrier?.plugin_selector ?? carrier?.plugin_id ?? null,
      interaction_mode: manifest?.codex_surface?.interaction_mode ?? null,
      source_path: entry.manifest_path ?? null,
    };
  });
}

async function readCatalogIndex(indexPath) {
  if (indexPath) return readOfficialSoftwareCatalog(fs.readFileSync(indexPath));
  const response = await fetch(officialSoftwareCatalogIndexUrl(), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Read pinned official software catalog: HTTP ${response.status}`);
  return readOfficialSoftwareCatalog(Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const studio = readStudioInventory(args.studioRoot);
  const appOwnedPackages = readAppOwnedPackages(appRoot);
  const catalogIndex = await readCatalogIndex(args.catalogIndex);
  const catalogPackages = readCatalogPackages(catalogIndex);
  const result = {
    schema_version: 'opl_plugin_composition_inventory.v2',
    generated_at: new Date().toISOString(),
    authority: 'source_manifests_and_declared_composition_only',
    installation_or_callability_claim: false,
    taxonomy_contract: 'contracts/app-plugin-composition-taxonomy.json',
    repositories: {
      app: appRoot,
      studio: studio.root,
      catalog: OFFICIAL_SOFTWARE_CATALOG.repository,
    },
    dsh_host: studio,
    app_owned_packages: {
      count: appOwnedPackages.length,
      packages: appOwnedPackages,
    },
    catalog_packages: {
      source: OFFICIAL_SOFTWARE_CATALOG,
      count: catalogPackages.length,
      with_app_contributions: catalogPackages.filter(packageEntry => packageEntry.has_app_contributions).length,
      with_native_carrier: catalogPackages.filter(packageEntry => packageEntry.carrier_kind !== null).length,
      packages: catalogPackages,
    },
    interpretation: {
      dsh_host_plugins_are_not_framework_packages: true,
      codex_plugin_carrier_is_not_dsh_profile_admission: true,
      user_surface_is_functional_and_carrier_neutral: true,
    },
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

await main();
