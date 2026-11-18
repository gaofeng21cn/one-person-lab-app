import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const temp = process.env.RUNNER_TEMP;
if (!temp || !path.isAbsolute(temp)) throw new Error('A runner temporary directory is required');
const statePath = path.join(temp, 'opl-release-keychain-state.json');
const keychain = path.join(temp, 'opl-build.keychain-db');

function security(...args: string[]) {
  return execFileSync('/usr/bin/security', args, { encoding: 'utf8' });
}

function readKeychains(command: string) {
  return security(command, '-d', 'user').trim().split('\n').filter(Boolean).map((line) => {
    const match = /^\s*"([^"]+)"\s*$/.exec(line);
    if (!match || !path.isAbsolute(match[1])) throw new Error('Invalid macOS user keychain path');
    return match[1];
  });
}

function readState() {
  return JSON.parse(readFileSync(statePath, 'utf8')) as { defaultKeychain: string; searchList: string[] };
}

switch (process.argv[2]) {
  case 'capture': {
    const [defaultKeychain] = readKeychains('default-keychain');
    if (!defaultKeychain || existsSync(keychain)) throw new Error('Cannot safely replace the macOS build keychain');
    const searchList = readKeychains('list-keychains');
    writeFileSync(statePath, JSON.stringify({ defaultKeychain, searchList }), { mode: 0o600, flag: 'wx' });
    break;
  }
  case 'activate': {
    const { searchList } = readState();
    security('list-keychains', '-d', 'user', '-s', keychain, ...searchList);
    break;
  }
  case 'restore': {
    if (!existsSync(statePath)) break;
    const { defaultKeychain, searchList } = readState();
    security('default-keychain', '-d', 'user', '-s', defaultKeychain);
    security('list-keychains', '-d', 'user', '-s', ...searchList);
    if (existsSync(keychain)) security('delete-keychain', keychain);
    unlinkSync(statePath);
    break;
  }
  default:
    throw new Error('Expected capture, activate, or restore');
}
