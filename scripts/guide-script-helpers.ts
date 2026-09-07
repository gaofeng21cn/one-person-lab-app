import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const forbiddenSecretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /OPENAI_API_KEY/,
  /CODEX_API_KEY/,
  /OPL_CODEX_API_KEY\s*=\s*[^`\s]+/,
  /opl-first-run-smoke-guide-key/,
];

export function createGuideScriptHelpers(appRoot: string) {
  return {
    run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
      const result = spawnSync(command, args, {
        cwd: options.cwd ?? appRoot,
        encoding: 'utf8',
        stdio: 'pipe',
        env: options.env ?? process.env,
      });
      if (result.status !== 0) {
        throw new Error([
          `Command failed: ${command} ${args.join(' ')}`,
          result.stdout,
          result.stderr,
        ].filter(Boolean).join('\n'));
      }
      return result;
    },
    relativeToApp(filePath: string) {
      return path.relative(appRoot, filePath);
    },
    readJson<T>(filePath: string): T {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    },
    hashFile(filePath: string) {
      return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    },
    readPngDimensions(filePath: string, label = 'Guide asset') {
      const buf = fs.readFileSync(filePath);
      if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
        throw new Error(`${label} is not a PNG file: ${path.relative(appRoot, filePath)}`);
      }
      return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
      };
    },
    expandTemplate(text: string, values: Record<string, string | undefined>, download: Record<string, string> = {}) {
      let expanded = text;
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
          expanded = expanded.replaceAll(`{{${key}}}`, value);
        }
      }
      for (const [key, value] of Object.entries(download)) {
        expanded = expanded.replaceAll(`{{download.${key}}}`, value);
      }
      return expanded;
    },
    scanText(label: string, text: string) {
      const secretHits = forbiddenSecretPatterns.filter((pattern) => pattern.test(text)).map(String);
      if (secretHits.length > 0) {
        throw new Error(`${label} contains forbidden sensitive marker(s): ${secretHits.join(', ')}`);
      }
      if (/\{\{[^}]+\}\}/.test(text)) {
        throw new Error(`${label} contains unresolved template placeholder(s).`);
      }
    },
    withGeneratedLifecycleFrontMatter(markdown: string, lifecycle: string) {
      return markdown.startsWith('---\n')
        ? markdown.replace('---\n', `---\n${lifecycle}\n`)
        : `${lifecycle}\n\n${markdown}`;
    },
  };
}
