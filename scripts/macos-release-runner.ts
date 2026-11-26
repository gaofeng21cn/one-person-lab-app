import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { runGitHubCli } from './release-file-helpers.ts';

export const ownedMacReleaseRunner = 'opl-release-macos-arm64';
export const hostedMacReleaseRunner = 'macos-latest';

type RunnerInventoryPage = {
  runners?: Array<{ status?: string; labels?: Array<{ name: string }> }>;
};

export function selectMacReleaseRunner(pages: RunnerInventoryPage[] | null, configuredPool?: string) {
  if (configuredPool !== ownedMacReleaseRunner) {
    return hostedMacReleaseRunner;
  }
  if (pages === null) {
    return ownedMacReleaseRunner;
  }
  const requiredLabels = ['self-hosted', 'macos', 'arm64', ownedMacReleaseRunner];
  return pages.some((page) => page.runners?.some((runner) => {
    if (runner.status !== 'online') return false;
    const labels = new Set(runner.labels?.map((label) => label.name.toLowerCase()));
    return requiredLabels.every((label) => labels.has(label));
  })) ? ownedMacReleaseRunner : hostedMacReleaseRunner;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pages: RunnerInventoryPage[] | null = null;
  const configuredPool = process.env.OPL_MACOS_RELEASE_RUNNER;
  const repository = process.env.GITHUB_REPOSITORY ?? 'gaofeng21cn/one-person-lab-app';
  if (configuredPool === ownedMacReleaseRunner) {
    try {
      if (repository !== 'gaofeng21cn/one-person-lab-app') throw new Error('Unexpected release repository');
      const inventory = runGitHubCli([
        'api', '--paginate', '--slurp', '-H', 'Cache-Control: no-cache',
        `repos/${repository}/actions/runners?per_page=100`,
      ], 'Read macOS release runner inventory');
      const response = JSON.parse(inventory);
      if (!Array.isArray(response) || !response.every((page) => Array.isArray(page?.runners))) {
        throw new Error('Unexpected runner inventory');
      }
      pages = response;
    } catch {
      process.stderr.write('Could not read the release runner inventory. Using the configured fallback.\n');
    }
  }
  const runner = selectMacReleaseRunner(pages, configuredPool);
  console.log(`macOS release runner: ${runner}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `macos_release_runner=${runner}\n`);
  }
}
