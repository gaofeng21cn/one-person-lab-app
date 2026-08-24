import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

const appRoot = process.cwd();
const scriptPath = path.join(
  appRoot,
  "scripts",
  "diagnose-apple-timestamp-authority.ts",
);
const workflowPath = path.join(
  appRoot,
  ".github",
  "workflows",
  "release-diagnostics.yml",
);

function writeExecutable(filePath: string, source: string): void {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function fixture(mode: "passed" | "timeout" | "verify-failed") {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "opl-tsa-diagnostic-test-"),
  );
  const commands = path.join(root, "commands");
  const output = path.join(root, "receipt.json");
  fs.mkdirSync(commands);
  writeExecutable(
    path.join(commands, "curl"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo 'curl 8.0.0 test'
  exit 0
fi
output=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    shift
    output="$1"
  fi
  shift
done
${
  mode === "timeout"
    ? "echo 'curl: timeout' >&2\nexit 28"
    : `printf 'timestamp-response' > "$output"
printf '{"http_code":200,"time_total_seconds":0.125,"remote_ip":"17.1.2.3","remote_port":80,"size_download":18,"url_effective":"http://timestamp.apple.com/ts01"}'`
}
`,
  );
  writeExecutable(
    path.join(commands, "openssl"),
    `#!/bin/sh
if [ "$1" = "version" ]; then
  echo 'OpenSSL 3.0.0 test'
  exit 0
fi
if [ "$1" = "ts" ] && [ "$2" = "-query" ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "-out" ]; then shift; printf 'query' > "$1"; fi
    shift
  done
  exit 0
fi
if [ "$1" = "ts" ] && [ "$2" = "-reply" ]; then
  for arg in "$@"; do
    if [ "$arg" = "-text" ]; then echo 'Status: Granted.'; exit 0; fi
  done
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "-out" ]; then shift; printf 'token' > "$1"; fi
    shift
  done
  exit 0
fi
if [ "$1" = "pkcs7" ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "-out" ]; then shift; printf 'certificate' > "$1"; fi
    shift
  done
  exit 0
fi
if [ "$1" = "ts" ] && [ "$2" = "-verify" ]; then
  ${mode === "verify-failed" ? "echo 'Verification: FAILED'\nexit 1" : "echo 'Verification: OK'\nexit 0"}
fi
exit 2
`,
  );
  writeExecutable(
    path.join(commands, "security"),
    `#!/bin/sh
if [ "$1" = "help" ]; then
  echo 'security test tool'
  exit 0
fi
printf '%s\n' '-----BEGIN CERTIFICATE-----' 'test' '-----END CERTIFICATE-----'
`,
  );
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", scriptPath, "--output", output],
    {
      cwd: appRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        OPL_TSA_DIAGNOSTIC_TEST_MODE: "true",
        OPL_TSA_DIAGNOSTIC_TEST_COMMAND_ROOT: commands,
        GITHUB_ACTIONS: "true",
        GITHUB_RUN_ID: "12345",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_SHA: "a".repeat(40),
        RUNNER_OS: "macOS",
        RUNNER_ARCH: "X64",
        ImageOS: "macos14",
      },
    },
  );
  return { root, result, receipt: JSON.parse(fs.readFileSync(output, "utf8")) };
}

test("workflow is a no-secret read-only hosted macOS diagnostic", () => {
  const source = fs.readFileSync(workflowPath, "utf8");
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ["workflow_call", "workflow_dispatch"]);
  assert.deepEqual(workflow.permissions, { actions: "read", contents: "read" });
  const job = workflow.jobs["timestamp-authority"];
  assert.deepEqual(job.concurrency, {
    group: "opl-release-timestamp-authority-diagnostic",
    "cancel-in-progress": false,
  });
  assert.equal(job.if, "${{ github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'timestamp_authority' }}");
  assert.equal(job["runs-on"], "macos-latest");
  assert.equal(job.environment, undefined);
  const jobSource = YAML.stringify(job);
  assert.doesNotMatch(jobSource, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(jobSource, /contents:\s*write/);
  const commandSource = job.steps
    .map((step: Record<string, unknown>) => String(step.run ?? ""))
    .join("\n");
  assert.doesNotMatch(
    commandSource,
    /gh\s+(release|workflow)|release-broker|release-dispatch|nonce/,
  );
  const probe = job.steps.find(
    (step: Record<string, unknown>) =>
      step.name === "Probe and verify Apple RFC3161 timestamp authority",
  );
  assert.equal(probe["continue-on-error"], true);
  const upload = job.steps.find(
    (step: Record<string, unknown>) =>
      step.name === "Upload typed timestamp authority diagnostic",
  );
  assert.equal(upload.if, "${{ always() }}");
  assert.equal(
    upload.uses,
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  );
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.equal(fs.existsSync(path.join(appRoot, ".github/workflows/release-timestamp-authority-diagnostic.yml")), false);
});

test("diagnostic verifies one RFC3161 response against the query and system roots", () => {
  const value = fixture("passed");
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(
      value.receipt.schema,
      "opl_apple_timestamp_authority_diagnostic.v1",
    );
    assert.equal(value.receipt.status, "passed");
    assert.equal(value.receipt.response.http_status, 200);
    assert.equal(value.receipt.response.duration_ms, 125);
    assert.equal(value.receipt.verification.openssl_reply_status, "granted");
    assert.equal(value.receipt.verification.query_response_binding, "passed");
    assert.equal(
      value.receipt.verification.signer_chain_to_system_root,
      "passed",
    );
    assert.equal(value.receipt.production_credentials_used, false);
    assert.equal(value.receipt.release_authority_used, false);
    assert.equal(value.receipt.mutation_authorized, false);
    assert.equal(value.receipt.notarization_submission_performed, false);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test("diagnostic classifies a hosted transport timeout without release retry authority", () => {
  const value = fixture("timeout");
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.receipt.status, "failed");
    assert.equal(value.receipt.failure.code, "timestamp_authority_timeout");
    assert.equal(value.receipt.failure.stage, "request_timestamp");
    assert.equal(
      value.receipt.failure.retry_disposition,
      "diagnostic_only_no_release_retry",
    );
    assert.equal(value.receipt.production_credentials_used, false);
    assert.equal(value.receipt.mutation_authorized, false);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test("diagnostic rejects a response that does not verify against the query and system roots", () => {
  const value = fixture("verify-failed");
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.receipt.status, "failed");
    assert.equal(
      value.receipt.failure.code,
      "timestamp_response_verification_failed",
    );
    assert.equal(value.receipt.failure.stage, "verify_response");
    assert.equal(value.receipt.verification.query_response_binding, "not_run");
    assert.equal(
      value.receipt.verification.signer_chain_to_system_root,
      "not_run",
    );
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});
