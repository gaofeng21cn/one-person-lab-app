import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function verifyArchive(file, artifact) {
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '')) throw new Error('GitHub artifact has no SHA-256 digest');
  const bytes = fs.readFileSync(file);
  if (bytes.length !== artifact.size_in_bytes) throw new Error('Artifact archive size mismatch');
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== artifact.digest) throw new Error('Artifact archive digest mismatch');
}

export function validateEntries(entries) {
  if (!entries.length || new Set(entries).size !== entries.length) throw new Error('Empty or duplicate archive entries');
  for (const entry of entries) {
    if (!entry || entry === '.' || entry === '..' || /[/\\\x00-\x1f\x7f]/.test(entry)) throw new Error('Only flat artifact files are admitted');
  }
  return entries;
}

async function runDownload(url, file) {
  let hasAria = false;
  try { execFileSync('aria2c', ['--version'], { stdio: 'ignore' }); hasAria = true; } catch {}
  const args = hasAria
    ? ['--input-file=-', '--split=16', '--max-connection-per-server=16', '--min-split-size=1M', '--file-allocation=none', '--continue=true', '--allow-overwrite=true', '--auto-file-renaming=false', '--max-tries=3', '--retry-wait=2', '--timeout=30', '--connect-timeout=15', '--summary-interval=10', '--download-result=hide', '--console-log-level=error', '--dir', path.dirname(file), '--out', path.basename(file)]
    : ['--config', '-', '--fail', '--location', '--silent', '--show-error', '--retry', '3', '--connect-timeout', '15', '--max-time', '900', '--output', file];
  console.log(JSON.stringify({ stage: 'download_artifact', transport: hasAria ? 'aria2_16_connections' : 'curl', archive: path.basename(file) }));
  await new Promise((resolve, reject) => {
    const child = spawn(hasAria ? 'aria2c' : 'curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let lastProgressAt = 0;
    // Signed URLs stay in stdin; neither subprocess errors nor URLs are logged.
    child.stdout.on('data', chunk => {
      for (const line of String(chunk).split(/[\r\n]/)) {
        if (/^\[#[a-f0-9]+ .*DL:/.test(line) && !/https?:|\?/.test(line) && Date.now() - lastProgressAt >= 10000) {
          console.log(line);
          lastProgressAt = Date.now();
        }
      }
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Artifact transport could not start')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Artifact transport failed with exit ${code}`)));
    // aria2 ignores global --out with --input-file; bind the name to this input entry.
    child.stdin.end(hasAria ? `${url}\n  out=${path.basename(file)}\n` : `url = ${JSON.stringify(url)}\n`);
  });
}

export async function downloadArtifact(env = process.env) {
  const { GITHUB_REPOSITORY: repo, OPL_ARTIFACT_RUN_ID: run, OPL_ARTIFACT_NAME: name, OPL_ARTIFACT_DEST: destination, OPL_ARTIFACT_CACHE: cacheRoot } = env;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^\d+$/.test(run ?? '') || !name || !destination || !cacheRoot) throw new Error('Exact repository, run, artifact name, destination and cache are required');
  const token = env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'OPL-exact-artifact-download', 'X-GitHub-Api-Version': '2022-11-28' };
  const matches = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run}/artifacts?per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub artifact listing returned ${response.status}`);
    const data = await response.json();
    matches.push(...data.artifacts.filter(artifact => artifact.name === name && !artifact.expired));
    if (data.artifacts.length < 100) break;
  }
  if (matches.length !== 1) throw new Error(`Expected one live exact artifact; found ${matches.length}`);
  const artifact = matches[0];
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '')) throw new Error('GitHub artifact has no SHA-256 digest');
  const cache = path.resolve(cacheRoot);
  fs.mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, `${artifact.digest.slice(7)}.zip`);
  let cacheHit = false;
  if (fs.existsSync(archive)) {
    try { verifyArchive(archive, artifact); cacheHit = true; } catch {
      // An aria2 control file records partial ranges; a complete corrupt file must be replaced.
      if (!fs.existsSync(`${archive}.aria2`)) fs.unlinkSync(archive);
    }
  }
  if (!cacheHit) {
    const redirect = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts/${artifact.id}/zip`, { headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const url = redirect.headers.get('location');
    if (redirect.status !== 302 || !url || new URL(url).protocol !== 'https:') throw new Error('GitHub did not return an HTTPS artifact download');
    await runDownload(url, archive);
    verifyArchive(archive, artifact);
  }
  const entries = validateEntries(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trimEnd().split('\n'));
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  for (const entry of entries) {
    const fd = fs.openSync(path.join(output, entry), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
    try { execFileSync('unzip', ['-p', archive, entry], { stdio: ['ignore', fd, 'pipe'] }); }
    finally { fs.closeSync(fd); }
  }
  console.log(JSON.stringify({ stage: 'artifact_verified', repository: repo, run_id: run, artifact_id: artifact.id, name, digest: artifact.digest, size_bytes: artifact.size_in_bytes, cache_hit: cacheHit, entries }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  downloadArtifact().catch(error => { console.error(error.message.replace(/https?:\/\/\S+/g, '[url]')); process.exitCode = 1; });
}
