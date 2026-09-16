#!/usr/bin/env node

/**
 * Advisory scan for GitHub commit subjects that are not written in English.
 *
 * Read-only by design: it prints a report and exits successfully unless the scan itself fails.
 * No release surface consumes this result, so a finding can never block, delay, or fail a release.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const defaultRepositories = [
  'gaofeng21cn/one-person-lab-app',
  'gaofeng21cn/opl-aion-shell',
  'gaofeng21cn/one-person-lab',
  'gaofeng21cn/opl-studio',
];

// Same boundary the Nightly notes writer applies: scripts that are not written with the Latin
// alphabet used by English commit subjects.
const nonEnglishSubjectPattern =
  /[\u1100-\u11ff\u2e80-\u2eff\u3000-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffee]/;

type Finding = {
  repository: string;
  sha: string;
  date: string;
  subject: string;
};

type RepositoryScan = {
  repository: string;
  scanned: number;
  findings: Finding[];
};

function readGhJson(args: string[]): unknown {
  const result = spawnSync('gh', args, { encoding: 'utf8', stdio: 'pipe', timeout: 120_000 });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return JSON.parse(result.stdout);
}

function scanRepository(repository: string, limit: number): RepositoryScan {
  const commits = readGhJson([
    'api',
    `repos/${repository}/commits?per_page=${limit}`,
  ]) as Array<Record<string, any>>;
  const findings: Finding[] = [];
  for (const commit of Array.isArray(commits) ? commits : []) {
    const sha = String(commit?.sha ?? '');
    const subject = String(commit?.commit?.message ?? '').split('\n')[0]?.trim() ?? '';
    if (!sha || !subject || !nonEnglishSubjectPattern.test(subject)) continue;
    findings.push({
      repository,
      sha: sha.slice(0, 9),
      date: String(commit?.commit?.author?.date ?? '').slice(0, 10),
      subject,
    });
  }
  return { repository, scanned: commits.length, findings };
}

function repositoryTable(scans: RepositoryScan[]): string[] {
  const rows = scans.map((scan) =>
    `| ${scan.repository} | ${scan.scanned} | ${scan.findings.length} |`);
  return [
    '| Repository | Commits scanned | Non-English subjects |',
    '| --- | --- | --- |',
    ...rows,
  ];
}

function renderText(scans: RepositoryScan[], limit: number): string {
  const findings = scans.flatMap((scan) => scan.findings);
  const lines = [
    'Commit message language advisory (read-only, non-blocking).',
    `Checked the newest ${limit} commits on the default branch of each repository.`,
    '',
    `Repositories scanned: ${scans.length}`,
    `Commits scanned: ${scans.reduce((total, scan) => total + scan.scanned, 0)}`,
    `Non-English subjects: ${findings.length}`,
    '',
    ...scans.map((scan) =>
      `${scan.repository}: ${scan.findings.length}/${scan.scanned} non-English subject(s)`),
  ];
  if (findings.length > 0) {
    lines.push('', 'Findings:');
    for (const finding of findings) {
      lines.push(`- ${finding.repository} ${finding.sha} ${finding.date} ${finding.subject}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderMarkdown(scans: RepositoryScan[], limit: number): string {
  const findings = scans.flatMap((scan) => scan.findings);
  const lines = [
    '## Commit message language advisory',
    '',
    `Read-only weekly scan of the newest ${limit} commits on the default branch of each repository.`,
    'Findings here never block a release; new commit subjects are written in English so generated',
    'release notes stay readable. Commit subjects already recorded in another language stay in',
    'history as they are.',
    '',
    `Non-English subjects: **${findings.length}** of ${scans.reduce((total, scan) => total + scan.scanned, 0)} scanned commits.`,
    '',
    ...repositoryTable(scans),
  ];
  for (const scan of scans) {
    if (scan.findings.length === 0) continue;
    lines.push('', `### ${scan.repository}`, '');
    for (const finding of scan.findings) {
      lines.push(`- \`${finding.sha}\` ${finding.date} ${finding.subject}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: 'string', multiple: true },
      limit: { type: 'string', default: '100' },
      format: { type: 'string', default: 'text' },
      output: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const repositories = values.repo?.length ? values.repo : defaultRepositories;
  const limit = Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer between 1 and 100.');
  }
  const format = values.format ?? 'text';
  if (!['text', 'markdown', 'json'].includes(format)) {
    throw new Error('--format must be text, markdown, or json.');
  }
  const scans = repositories.map((repository) => scanRepository(repository, limit));
  const report = format === 'json'
    ? `${JSON.stringify({ schema: 'opl_commit_message_language_report.v1', limit, scans }, null, 2)}\n`
    : format === 'markdown'
      ? renderMarkdown(scans, limit)
      : renderText(scans, limit);
  if (values.output) {
    fs.writeFileSync(path.resolve(values.output), report, 'utf8');
  } else {
    process.stdout.write(report);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
