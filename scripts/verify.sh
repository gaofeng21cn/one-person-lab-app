#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage:
  scripts/verify.sh [lane...]

Lanes:
  smoke             Active shell structural quick check. This is the default.
  active-shell      Full active shell validation commands from the shell adapter.
  release-boundary  App release-boundary validator and parallel release tests.
  candidate-shell   Minimal fixed-role registry check; candidate detail remains explicit.
  structure         Active shell and App release-boundary static checks without release packaging.
  full              active-shell + release-boundary + role registry; candidate detail is not a default gate.
  release-preflight Run every locally reproducible Stable release gate and seal nonlocal gaps.

This wrapper intentionally does not publish releases or run VM smoke tests. Use
the explicit release:* and test:opl-first-run-vm:* commands for those lanes.
USAGE
}

write_preflight_summary() {
  local summary_path="$1"
  local status="$2"
  node - "$summary_path" "$status" <<'NODE'
const fs = require('node:fs');
const [summaryPath, status] = process.argv.slice(2);
const existing = fs.existsSync(summaryPath)
  ? JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  : {};
const payload = {
  schema: 'opl_app_local_release_preflight.v1',
  status,
  entrypoint: 'scripts/verify.sh release-preflight',
  public_mutation_allowed: false,
  local_checks: [
    'actionlint',
    'typecheck',
    'active_shell',
    'release_boundary',
    'candidate_shell',
    'standard_package_build',
  ],
  remote_only: [
    'github_hosted_required_macos_linux_matrix',
    'github_hosted_desktop_artifacts_matrix_required',
    'protected_signing_and_notarization_credentials',
    'public_mutation',
    'owner_authoritative_remote_readback',
  ],
  optional_deferred: ['post_publication_clean_machine_certification'],
  ...existing,
  status,
};
fs.writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
NODE
}

run_release_boundary_profile() {
  local profile="$1"
  local -a test_files=()

  case "${OPL_RELEASE_SKIP_MODEL_POLICY_CHECK:-false}" in
    false)
      npm run codex:model-policy:check
      ;;
    true)
      ;;
    *)
      printf 'OPL_RELEASE_SKIP_MODEL_POLICY_CHECK must be true or false.\n' >&2
      return 2
      ;;
  esac
  OPL_RELEASE_VALIDATION_PROFILE="$profile" npm run validate:release-boundary
  while IFS= read -r file_path; do test_files+=("$file_path"); done < <(
    node --experimental-strip-types --input-type=module - "$profile" <<'NODE'
  import fs from 'node:fs';
  import path from 'node:path';
  const profile = process.argv[2];
  const contract = JSON.parse(fs.readFileSync('contracts/app-release-channel.json', 'utf8'));
  const ownership = contract.release_platform_matrix?.validation_ownership;
  const windowsOwned = ownership?.windows?.owned_test_paths;
  if (!Array.isArray(windowsOwned) || windowsOwned.length === 0) {
    throw new Error('Windows test ownership is missing from the release platform contract.');
  }
  const releaseTests = fs.readdirSync('tests/release', { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => path.posix.join('tests/release', entry.name));
  const boundaryTests = fs.readdirSync('tests/release/app-release-boundary-cases', { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => path.posix.join('tests/release/app-release-boundary-cases', entry.name));
  const allTests = [...releaseTests, ...boundaryTests].sort();
  const owned = new Set(windowsOwned);
  for (const file of owned) {
    if (!allTests.includes(file)) throw new Error(`Owned release test does not exist: ${file}.`);
  }
  const selected = profile === 'aggregate'
    ? allTests
    : profile === 'stable'
      ? allTests.filter((file) => !owned.has(file))
      : profile === 'windows'
        ? allTests.filter((file) => owned.has(file))
        : null;
  if (!selected) throw new Error(`Unsupported release validation profile: ${profile}.`);
  process.stdout.write(`${selected.join('\n')}\n`);
NODE
  )
  test "${#test_files[@]}" -gt 0
  node --experimental-strip-types --test --test-concurrency=4 --test-timeout=120000 \
    --test-force-exit "${test_files[@]}"
}

run_lane() {
  local lane="$1"
  case "$lane" in
    smoke)
      npm run ensure:shell
      npm run validate:active-shell -- --quick
      ;;
    active-shell)
      npm run ensure:shell
      npm run validate:active-shell
      ;;
    release-boundary)
      npm run ensure:shell
      if [ -n "${OPL_RELEASE_VALIDATION_PROFILE:-}" ]; then
        run_release_boundary_profile "$OPL_RELEASE_VALIDATION_PROFILE"
      else
        npm run test:release-boundary
      fi
      ;;
    candidate-shell)
      npm run ensure:shell
      npm run validate:shell-candidates
      ;;
    structure)
      npm run ensure:shell
      npm run validate:active-shell -- --quick
      npm run validate:release-boundary
      ;;
    full)
      run_lane active-shell
      run_lane release-boundary
      run_lane candidate-shell
      ;;
    release-preflight)
      OPL_PREFLIGHT_SUMMARY_PATH="${OPL_RELEASE_LOCAL_PREFLIGHT_SUMMARY:-artifacts/release-local-preflight.json}"
      OPL_PREFLIGHT_FINAL_STATUS=failed
      mkdir -p "$(dirname "$OPL_PREFLIGHT_SUMMARY_PATH")"
      write_preflight_summary "$OPL_PREFLIGHT_SUMMARY_PATH" running
      trap 'rc=$?; write_preflight_summary "$OPL_PREFLIGHT_SUMMARY_PATH" "$OPL_PREFLIGHT_FINAL_STATUS"; trap - EXIT; exit "$rc"' EXIT
      npm run ensure:shell
      actionlint -shellcheck= -pyflakes=
      npm run typecheck
      npm run validate:active-shell
      OPL_RELEASE_VALIDATION_PROFILE=stable run_release_boundary_profile stable
      npm run validate:shell-candidates
      npm run build-mac:arm64
      OPL_PREFLIGHT_FINAL_STATUS=passed
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      printf 'Unknown verify lane: %s\n\n' "$lane" >&2
      usage >&2
      return 2
      ;;
  esac
}

if [ "$#" -eq 0 ]; then
  set -- smoke
fi

for lane in "$@"; do
  run_lane "$lane"
done
