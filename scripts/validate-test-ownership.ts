#!/usr/bin/env node
// Every test file under tests/ has to be reachable from an npm test script,
// otherwise it silently stops gating anything. Three candidate suites had drifted
// out of every script this way; this check keeps that from recurring.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = packageJson.scripts ?? {};
const testFilePattern = /\.(?:test|spec)\.(?:mjs|mts|cjs|cts|js|jsx|ts|tsx)$/;

function collectTestFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files.push(...collectTestFiles(entryPath));
      continue;
    }
    if (testFilePattern.test(entry.name)) {
      files.push(path.relative(root, entryPath).split(path.sep).join('/'));
    }
  }
  return files;
}

function expandScript(name: string, seen: Set<string>): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const command = scripts[name];
  if (typeof command !== 'string') return [];
  const expanded: string[] = [];
  for (const part of command.split(/&&|\|\|/)) {
    const segment = part.trim();
    const delegated = segment.match(/^(?:npm|bun) run ([@\w:.-]+)$/);
    if (delegated) {
      expanded.push(...expandScript(delegated[1], seen));
      continue;
    }
    expanded.push(segment);
  }
  return expanded;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${body}$`);
}

function ownedPatterns(): string[] {
  const patterns = new Set<string>();
  const testScripts = Object.keys(scripts).filter((name) => name === 'test' || name.startsWith('test'));
  for (const name of testScripts) {
    for (const segment of expandScript(name, new Set())) {
      for (const match of segment.matchAll(/([\w@./-]*(?:\*[\w@./-]*)+|[\w@./-]+\.(?:test|spec)\.\w+)/g)) {
        const token = match[1];
        if (testFilePattern.test(token) || token.includes('*')) {
          patterns.add(token.replace(/^\//, ''));
        }
      }
      for (const match of segment.matchAll(/(?:node --test|node\s+.*--test)\s+([^&|]+)/g)) {
        for (const token of match[1].trim().split(/\s+/)) {
          if (testFilePattern.test(token) || token.includes('*') || token.startsWith('-')) continue;
          const target = token.replace(/\/$/, '');
          const absolute = path.join(root, target);
          if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
            patterns.add(`${target}/**/*.test.*`);
            patterns.add(`${target}/**/*.spec.*`);
          }
        }
      }
    }
  }
  return [...patterns];
}

const matchers = ownedPatterns().map(globToRegExp);
const testFiles = collectTestFiles(path.join(root, 'tests')).sort();
const unowned = testFiles.filter((file) => !matchers.some((matcher) => matcher.test(file)));

if (unowned.length > 0) {
  process.stderr.write('Test files are not reachable from any npm test script:\n');
  process.stderr.write(unowned.map((file) => `- ${file}\n`).join(''));
  process.exit(1);
}

process.stdout.write(`All ${testFiles.length} App test files are reachable from a test script.\n`);
