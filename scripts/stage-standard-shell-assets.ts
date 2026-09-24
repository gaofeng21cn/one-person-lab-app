import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export function stageStudioStandardAssets(artifactsDir: string, outputDir: string): void {
  const sources: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Release staging refuses symlink ${target}`);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) sources.push(target);
    }
  };
  visit(artifactsDir);
  const assets = sources.filter((file) => /^One-Person-Lab-.+-mac-arm64\.(?:dmg|zip)(?:\.blockmap)?$/.test(path.basename(file)));
  const candidates = sources.filter((file) => path.basename(file) === 'latest-mac.yml').filter((file) => {
    const metadata = parseYaml(fs.readFileSync(file, 'utf8'));
    return Array.isArray(metadata?.files)
      ? metadata.files.some((entry) => typeof entry.url === 'string' && /-mac-arm64\.zip$/.test(entry.url))
      : file.includes('macos') || path.dirname(file) === path.resolve(artifactsDir);
  });
  if (!assets.some((file) => file.endsWith('.dmg')) || !assets.some((file) => file.endsWith('.zip')) || candidates.length !== 1) {
    throw new Error('Studio Standard staging requires one arm64 updater feed and matching DMG/ZIP assets.');
  }
  const names = assets.map((file) => path.basename(file));
  if (new Set(names).size !== names.length) throw new Error('Duplicate Studio Standard assets would overwrite each other.');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const file of assets) fs.copyFileSync(file, path.join(outputDir, path.basename(file)));
  for (const name of ['latest-mac.yml', 'latest-arm64-mac.yml']) fs.copyFileSync(candidates[0], path.join(outputDir, name));
}

export function validateStandardAssetInventory(outputDir: string): void {
  const primary = path.join(outputDir, 'latest-mac.yml');
  const compatibility = path.join(outputDir, 'latest-arm64-mac.yml');
  if (!fs.existsSync(primary) || !fs.existsSync(compatibility) || !fs.readFileSync(primary).equals(fs.readFileSync(compatibility))) {
    throw new Error('Stable updater metadata must be present and byte-identical.');
  }
  const metadata = parseYaml(fs.readFileSync(primary, 'utf8'));
  if (!Array.isArray(metadata?.files) || metadata.files.length === 0) throw new Error('Stable updater metadata has no files.');
  for (const entry of metadata.files) {
    if (typeof entry.url !== 'string' || path.basename(entry.url) !== entry.url || !/^One-Person-Lab-.+-mac-arm64\.(?:dmg|zip)$/.test(entry.url)
      || !fs.existsSync(path.join(outputDir, entry.url))) throw new Error('Stable updater references an invalid or missing arm64 asset.');
  }
  const names = fs.readdirSync(outputDir);
  if (!names.some((name) => /-mac-arm64\.dmg$/.test(name)) || !names.some((name) => /-mac-arm64\.zip$/.test(name))) {
    throw new Error('Stable release requires arm64 DMG and ZIP distributables.');
  }
}
