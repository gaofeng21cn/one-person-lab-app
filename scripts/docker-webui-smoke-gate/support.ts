import fs from 'node:fs';
import path from 'node:path';

const secretDetectors = [
  { id: 'openai_secret_key', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai_api_key', pattern: /OPENAI_API_KEY\s*[:=]\s*[^ \n\r]+/i },
  { id: 'anthropic_api_key', pattern: /ANTHROPIC_API_KEY\s*[:=]\s*[^ \n\r]+/i },
  { id: 'opl_webui_password', pattern: /OPL_WEBUI_PASSWORD\s*[:=]\s*[^ \n\r]+/i },
  { id: 'opl_gateway_api_key', pattern: /OPL_GATEWAY_API_KEY\s*[:=]\s*[^ \n\r]+/i },
  { id: 'gflab_token', pattern: /GFLABTOKEN\s*[:=]\s*[^ \n\r]+/i },
  { id: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
];

export function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function resolveEvidenceMember(evidenceDir: string, value: unknown, label: string, errors: string[]): string {
  if (!isNonEmptyString(value)) {
    errors.push(`${label} must be a relative path string`);
    return '';
  }
  if (path.isAbsolute(value) || value.includes('\0')) {
    errors.push(`${label} must be relative to the evidence directory`);
    return '';
  }
  const resolved = path.resolve(evidenceDir, value);
  const relative = path.relative(evidenceDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push(`${label} must stay inside the evidence directory`);
    return '';
  }
  return resolved;
}

export function scanDirectoryForSecretMarkers(rootDir: string, scanRoot = rootDir): string[] {
  const markers: string[] = [];
  if (!fs.existsSync(rootDir)) return markers;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      markers.push(...scanDirectoryForSecretMarkers(fullPath, scanRoot));
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(scanRoot, fullPath);
    const text = fs.readFileSync(fullPath).toString('utf8');
    for (const detector of secretDetectors) {
      if (detector.pattern.test(text)) markers.push(`${relativePath}:${detector.id}`);
    }
  }
  return markers;
}

export function readKeyValue(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^([^=\s]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export function fileStatus(filePath: string): 'present' | 'missing' {
  return fs.existsSync(filePath) ? 'present' : 'missing';
}
