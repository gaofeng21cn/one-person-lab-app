import fs from 'node:fs';
import path from 'node:path';
import { durationSeconds, monotonicSeconds } from './process.ts';

// Observational only: no stage here admits a build, checkpoint or publication.
export function createFullBuildTiming(filePath, metadata) {
  const startedAt = monotonicSeconds();
  const timings: Record<string, number> = {};
  const stages: Array<Record<string, any>> = [];
  let active: { name: string; started: number } | null = null;
  function write(status) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({
      schema: 'opl_full_package_build_timing.v1', ...metadata, status,
      current_stage: active?.name ?? null, stages,
      duration_seconds: {
        full_package_build: durationSeconds(startedAt, monotonicSeconds()),
        full_package_build_breakdown: timings,
      },
    }, null, 2)}\n`);
  }
  function close(status) {
    if (!active) return;
    timings[active.name] = durationSeconds(active.started, monotonicSeconds());
    Object.assign(stages.at(-1), { status, completed_at: new Date().toISOString(), duration_seconds: timings[active.name] });
    if (process.env.GITHUB_ACTIONS === 'true') console.error('::endgroup::');
  }
  return {
    timings, metadata,
    start(name) {
      close('completed');
      active = { name, started: monotonicSeconds() };
      stages.push({ stage: name, status: 'running', started_at: new Date().toISOString() });
      if (process.env.GITHUB_ACTIONS === 'true') console.error(`::group::Full: ${name}`);
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), event: 'release_stage', stage: `full_${name}` }));
      write('running');
    },
    finish(status) {
      close(status === 'completed' ? 'completed' : 'failed');
      if (status === 'completed') active = null;
      write(status);
    },
  };
}
