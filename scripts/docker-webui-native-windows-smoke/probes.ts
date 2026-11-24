import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digestFile, fail, record } from './receipt.ts';

type JsonRecord = Record<string, unknown>;

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export type CommandResult = {
  command: string[];
  status: number;
  timed_out: boolean;
  duration_ms: number;
  stdout_path: string;
  stderr_path: string;
  stdout: string;
  stderr: string;
};

export function cleanupEvidence(
  composeDown: Pick<CommandResult, 'status'>,
  remainingContainers: Pick<CommandResult, 'status' | 'stdout'>,
  remainingNetworks: Pick<CommandResult, 'status' | 'stdout'>,
  runtimeDirectoryRemaining: boolean,
) {
  const containerCount = remainingContainers.stdout.split(/\r?\n/).filter(Boolean).length;
  const networkCount = remainingNetworks.stdout.split(/\r?\n/).filter(Boolean).length;
  return {
    status: composeDown.status === 0 &&
      remainingContainers.status === 0 &&
      remainingNetworks.status === 0 &&
      containerCount === 0 &&
      networkCount === 0 &&
      !runtimeDirectoryRemaining ? 'passed' : 'failed',
    owned_containers_remaining: containerCount,
    owned_networks_remaining: networkCount,
    runtime_directory_remaining: runtimeDirectoryRemaining,
  };
}

export function commandRunner(artifactDir: string, baseEnv: NodeJS.ProcessEnv, commandTimeoutSeconds: number) {
  let sequence = 0;
  return (command: string, args: string[], label: string, timeoutSeconds = commandTimeoutSeconds, allowFailure = false): CommandResult => {
    sequence += 1;
    const prefix = `${String(sequence).padStart(2, '0')}-${label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`;
    const stdoutPath = path.join(artifactDir, `${prefix}.stdout.txt`);
    const stderrPath = path.join(artifactDir, `${prefix}.stderr.txt`);
    const started = Date.now();
    const result = spawnSync(command, args, {
      cwd: appRoot,
      encoding: 'utf8',
      env: baseEnv,
      timeout: timeoutSeconds * 1000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    fs.writeFileSync(stdoutPath, stdout);
    fs.writeFileSync(stderrPath, stderr);
    const recordResult: CommandResult = {
      command: [command, ...args],
      status: result.status ?? (result.error ? 1 : 0),
      timed_out: (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
      duration_ms: Date.now() - started,
      stdout_path: path.relative(artifactDir, stdoutPath),
      stderr_path: path.relative(artifactDir, stderrPath),
      stdout,
      stderr,
    };
    if (!allowFailure && (recordResult.status !== 0 || recordResult.timed_out)) {
      fail(`${label} failed${recordResult.timed_out ? ' by timeout' : ''}: ${stderr.trim() || stdout.trim()}`);
    }
    return recordResult;
  };
}

export function parseJsonOutput(result: CommandResult, label: string): unknown {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function httpProbe(url: string, cookie = '', timeoutSeconds = 10) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  return fetch(url, {
    redirect: 'follow',
    signal: controller.signal,
    headers: cookie ? { Cookie: cookie } : {},
  }).finally(() => clearTimeout(timer));
}

function cookieHeader(response: Response): string {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : response.headers.get('set-cookie') ? [String(response.headers.get('set-cookie'))] : [];
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ');
}

function windowsChromePath() {
  const candidates = [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) fail('Windows Chrome or Edge is required for native UI rendering evidence');
  return found;
}

function windowsPath(run: ReturnType<typeof commandRunner>, linuxPath: string, label: string) {
  return run('wslpath', ['-w', linuxPath], label).stdout.trim();
}

function visibleTextLength(dom: string) {
  return dom
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

export function renderWindowsUi(options: {
  run: ReturnType<typeof commandRunner>;
  artifactDir: string;
  runtimeDir: string;
  url: string;
  timeoutSeconds: number;
}) {
  const browserPath = windowsChromePath();
  const profilePath = path.join(options.runtimeDir, 'windows-browser-profile');
  const screenshotPath = path.join(options.artifactDir, 'windows-ui.png');
  fs.mkdirSync(profilePath, { recursive: true });
  const profileWindowsPath = windowsPath(options.run, profilePath, 'browser-profile-path');
  const screenshotWindowsPath = windowsPath(options.run, screenshotPath, 'browser-screenshot-path');
  const commonArgs = [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-default-browser-check',
    '--no-first-run',
    '--virtual-time-budget=15000',
    `--user-data-dir=${profileWindowsPath}`,
  ];
  const domResult = options.run(browserPath, [...commonArgs, '--dump-dom', options.url], 'windows-ui-dom', options.timeoutSeconds);
  const emptyRoot = /<(?:div|main)[^>]+id=["']root["'][^>]*>\s*<\/(?:div|main)>/i.test(domResult.stdout);
  const hasRoot = /<(?:div|main)[^>]+id=["']root["']/i.test(domResult.stdout);
  const textChars = visibleTextLength(domResult.stdout);
  if (!hasRoot || emptyRoot || textChars < 20) fail('Windows Chrome rendered an empty or unhydrated WebUI root');
  options.run(browserPath, [
    ...commonArgs,
    '--window-size=1440,1000',
    `--screenshot=${screenshotWindowsPath}`,
    options.url,
  ], 'windows-ui-screenshot', options.timeoutSeconds);
  if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size < 1000) fail('Windows Chrome did not produce a usable UI screenshot');
  return {
    status: 'passed',
    browser: 'windows_chrome_headless',
    url: options.url,
    root_hydrated: true,
    visible_text_chars: textChars,
    screenshot: {
      path: path.relative(options.artifactDir, screenshotPath),
      bytes: fs.statSync(screenshotPath).size,
      sha256: digestFile(screenshotPath),
    },
  };
}

function passedProbe(url: string, response: Response) {
  if (response.status < 200 || response.status >= 400) fail(`HTTP probe ${url} returned ${response.status}`);
  return {
    status: 'passed',
    url,
    http_status: response.status,
    content_type: response.headers.get('content-type'),
  };
}

async function probeWebuiOnce(baseUrl: string) {
  const rootResponse = await httpProbe(`${baseUrl}/`);
  if (rootResponse.status < 200 || rootResponse.status >= 400) fail(`WebUI root returned HTTP ${rootResponse.status}`);
  const rootCookie = cookieHeader(rootResponse);
  const rootHtml = await rootResponse.text();
  if (!/<(?:div|main)[^>]+id=["']root["']/i.test(rootHtml)) fail('WebUI root HTML has no root mount element');
  const assetPaths = [...rootHtml.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/gi)]
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 3);
  if (assetPaths.length < 1) fail('WebUI root HTML exposes no JS or CSS asset');
  const assets = [];
  for (const assetPath of assetPaths) {
    const assetUrl = new URL(assetPath, `${baseUrl}/`).toString();
    const response = await httpProbe(assetUrl, rootCookie);
    assets.push(passedProbe(assetUrl, response));
    await response.arrayBuffer();
  }

  const manifestUrl = `${baseUrl}/manifest.webmanifest`;
  const manifestResponse = await httpProbe(manifestUrl, rootCookie);
  const webmanifest = passedProbe(manifestUrl, manifestResponse);
  const manifestBody = await manifestResponse.json();
  record(manifestBody, 'webmanifest response');

  const authUrl = `${baseUrl}/api/auth/user`;
  const authResponse = await httpProbe(authUrl, rootCookie);
  const authCookie = cookieHeader(authResponse);
  const login = {
    ...passedProbe(authUrl, authResponse),
    session_cookie_observed: Boolean(rootCookie || authCookie),
    json_object: false,
  };
  const authBody = await authResponse.json();
  record(authBody, 'login session response');
  login.json_object = true;
  if (!login.session_cookie_observed) fail('WebUI local login did not issue a session cookie');
  return {
    root: passedProbe(`${baseUrl}/`, rootResponse),
    webmanifest,
    assets,
    login_session: login,
  };
}

export async function probeWebui(baseUrl: string, healthTimeoutSeconds: number) {
  const deadline = Date.now() + healthTimeoutSeconds * 1000;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      return await probeWebuiOnce(baseUrl);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  fail(`WebUI qualification timed out: ${lastError}`);
}
