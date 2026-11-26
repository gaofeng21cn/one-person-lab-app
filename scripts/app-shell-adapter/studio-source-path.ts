import fs from 'node:fs';
import path from 'node:path';

export function studioSourceRefForCheckout(shellRoot: string, sourceRef: string): string {
  const grouped = /^(plugins\/(?:core|extensions|channels)\/)(opl-[^/]+)(\/.+)$/.exec(sourceRef);
  if (!grouped) return sourceRef;
  const [, group, packageName, tail] = grouped;
  if (fs.existsSync(path.join(shellRoot, group, packageName))) return sourceRef;
  if (fs.existsSync(path.join(shellRoot, 'plugins', packageName))) return `plugins/${packageName}${tail}`;
  return sourceRef;
}

export function resolveStudioSourcePath(shellRoot: string, sourceRef: string): string {
  return path.join(shellRoot, studioSourceRefForCheckout(shellRoot, sourceRef));
}
