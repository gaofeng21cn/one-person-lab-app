import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { validateDockerWebuiDiagnostics } from '../validate-docker-webui-diagnostics.ts';
import {
  windowsEvidenceManifestName,
  windowsEvidenceSchema,
  type GateOptions,
  type GateResult,
  type ImageIdentity,
} from './contract.ts';
import {
  isNonEmptyString,
  readJson,
  resolveEvidenceMember,
  scanDirectoryForSecretMarkers,
  writeJson,
} from './support.ts';

type ApiKeyFlowValidation = {
  status: 'passed' | 'failed';
  filePath: string;
  errors: string[];
  forbiddenSecretMarkers: string[];
  payload: Record<string, unknown>;
};

type WindowsEvidenceDependencies = {
  emptyDiagnosticsValidation: (
    diagnosticsDir: string,
    missingFiles?: string[],
  ) => ReturnType<typeof validateDockerWebuiDiagnostics>;
  validateApiKeyFlowEvidence: (filePath: string) => ApiKeyFlowValidation;
  readDiagnosticsSummary: (result: GateResult, options: GateOptions, imageIdentity: ImageIdentity) => void;
};

function validateWindowsEvidence(evidenceDir: string, dependencies: WindowsEvidenceDependencies) {
  const errors: string[] = [];
  const manifestPath = path.join(evidenceDir, windowsEvidenceManifestName);
  let manifest: Record<string, unknown> = {};

  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    errors.push(`evidence directory not found: ${evidenceDir}`);
  } else if (!fs.existsSync(manifestPath)) {
    errors.push(`missing ${windowsEvidenceManifestName}`);
  } else {
    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${windowsEvidenceManifestName} must be valid JSON: ${message}`);
    }
  }

  if (Object.keys(manifest).length > 0) {
    if (manifest.schema !== windowsEvidenceSchema) errors.push(`manifest.schema must be ${windowsEvidenceSchema}`);
    if (manifest.gate_id !== 'clean_windows_vm') errors.push('manifest.gate_id must be clean_windows_vm');
    if (manifest.status !== 'passed') errors.push('manifest.status must be passed');
    if (manifest.host_platform !== 'win32') errors.push('manifest.host_platform must be win32');
    if (!isNonEmptyString(manifest.observed_at)) errors.push('manifest.observed_at must be a non-empty string');
    if (!isNonEmptyString(manifest.installer_command) || !manifest.installer_command.includes('install-docker-webui.ps1')) {
      errors.push('manifest.installer_command must reference install-docker-webui.ps1');
    }
    if (isNonEmptyString(manifest.installer_command) && !/(^|\s)-Yes(\s|$)/.test(manifest.installer_command)) {
      errors.push('manifest.installer_command must include -Yes');
    }
  }

  const diagnosticsDir = resolveEvidenceMember(evidenceDir, manifest.diagnostics_dir, 'manifest.diagnostics_dir', errors);
  const apiKeyFlowEvidencePath = resolveEvidenceMember(
    evidenceDir,
    manifest.api_key_flow_evidence,
    'manifest.api_key_flow_evidence',
    errors,
  );
  const diagnosticsValidation = diagnosticsDir
    ? validateDockerWebuiDiagnostics(diagnosticsDir)
    : dependencies.emptyDiagnosticsValidation('', ['diagnostics_dir']);
  if (diagnosticsValidation.status !== 'passed') errors.push('diagnostics validation failed');
  const apiKeyFlowValidation = apiKeyFlowEvidencePath
    ? dependencies.validateApiKeyFlowEvidence(apiKeyFlowEvidencePath)
    : {
        status: 'failed' as const,
        filePath: '',
        errors: ['missing api_key_flow_evidence'],
        forbiddenSecretMarkers: [],
        payload: {},
      };
  if (apiKeyFlowValidation.status !== 'passed') errors.push('API key flow evidence validation failed');

  const forbiddenSecretMarkers = scanDirectoryForSecretMarkers(evidenceDir);
  if (forbiddenSecretMarkers.length > 0) errors.push('evidence contains forbidden secret-like markers');

  return {
    status: errors.length === 0 && forbiddenSecretMarkers.length === 0 ? ('passed' as const) : ('failed' as const),
    evidenceDir,
    manifestPath,
    diagnosticsDir,
    diagnosticsValidation,
    apiKeyFlowEvidencePath,
    apiKeyFlowValidation,
    errors,
    forbiddenSecretMarkers,
    manifest,
  };
}

type WindowsEvidenceArchiveEntry = {
  raw: string;
  normalized: string;
  isDirectory: boolean;
  payload: Buffer | null;
};

function normalizeWindowsEvidenceArchiveEntry(entry: string) {
  if (entry.startsWith('/') || entry.startsWith('\\') || /^[A-Za-z]:/.test(entry) || entry.includes('\0')) {
    throw new Error(`Windows evidence archive contains an unsafe absolute entry: ${entry}`);
  }
  const normalized = entry.replaceAll('\\', '/');
  const pathForCheck = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  const segments = pathForCheck.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Windows evidence archive contains an unsafe parent traversal entry: ${entry}`);
  }
  return { raw: entry, normalized, isDirectory: normalized.endsWith('/') };
}

function findZipEndOfCentralDirectory(archive: Buffer, archivePath: string) {
  const minimumEocdSize = 22;
  const maxCommentSize = 0xffff;
  const searchStart = Math.max(0, archive.length - minimumEocdSize - maxCommentSize);
  for (let offset = archive.length - minimumEocdSize; offset >= searchStart; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error(`Failed to locate Windows evidence archive central directory: ${archivePath}`);
}

function readWindowsEvidenceArchiveEntries(archivePath: string): WindowsEvidenceArchiveEntry[] {
  const archive = fs.readFileSync(archivePath);
  const eocd = findZipEndOfCentralDirectory(archive, archivePath);
  const entriesOnDisk = archive.readUInt16LE(eocd + 8);
  const totalEntries = archive.readUInt16LE(eocd + 10);
  const centralDirectorySize = archive.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = archive.readUInt32LE(eocd + 16);
  if (entriesOnDisk !== totalEntries) {
    throw new Error(`Windows evidence archive spans multiple disks, which is unsupported: ${archivePath}`);
  }
  if (totalEntries === 0) throw new Error(`Windows evidence archive is empty: ${archivePath}`);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > archive.length) {
    throw new Error(`Windows evidence archive central directory is out of range: ${archivePath}`);
  }

  const entries: WindowsEvidenceArchiveEntry[] = [];
  let cursor = centralDirectoryOffset;
  while (cursor < centralDirectoryEnd) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Windows evidence archive central directory is invalid at offset ${cursor}: ${archivePath}`);
    }
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const fileNameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    if ([compressedSize, uncompressedSize, localHeaderOffset].some((value) => value === 0xffffffff)) {
      throw new Error(`Windows evidence archive uses ZIP64 entries, which are unsupported: ${archivePath}`);
    }
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const raw = archive.subarray(fileNameStart, fileNameEnd).toString('utf8');
    const normalized = normalizeWindowsEvidenceArchiveEntry(raw);
    if ((flags & 0x1) !== 0) throw new Error(`Windows evidence archive contains an encrypted entry: ${raw}`);

    let payload: Buffer | null = null;
    if (!normalized.isDirectory) {
      if (![0, 8].includes(method)) {
        throw new Error(`Windows evidence archive entry uses unsupported compression method ${method}: ${raw}`);
      }
      if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Windows evidence archive local header is invalid for entry: ${raw}`);
      }
      const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > archive.length) throw new Error(`Windows evidence archive entry data is out of range: ${raw}`);
      const compressedPayload = archive.subarray(dataStart, dataEnd);
      payload = method === 0 ? Buffer.from(compressedPayload) : inflateRawSync(compressedPayload);
      if (payload.length !== uncompressedSize) throw new Error(`Windows evidence archive entry size mismatch: ${raw}`);
    }

    entries.push({ ...normalized, payload });
    cursor = fileNameEnd + extraLength + commentLength;
  }
  if (entries.length !== totalEntries) {
    throw new Error(`Windows evidence archive entry count mismatch: ${archivePath}`);
  }
  return entries;
}

function extractWindowsEvidenceArchive(archivePath: string, extractedRoot: string) {
  const entries = readWindowsEvidenceArchiveEntries(archivePath);
  const root = path.resolve(extractedRoot);
  const seenFiles = new Set<string>();
  for (const entry of entries) {
    const destination = path.resolve(root, entry.normalized);
    if (destination !== root && !destination.startsWith(root + path.sep)) {
      throw new Error(`Windows evidence archive contains an unsafe entry outside extraction root: ${entry.raw}`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(destination, { recursive: true });
      continue;
    }
    if (seenFiles.has(entry.normalized)) {
      throw new Error(`Windows evidence archive contains duplicate normalized entry: ${entry.raw}`);
    }
    seenFiles.add(entry.normalized);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, entry.payload ?? Buffer.alloc(0));
  }
}

function prepareWindowsEvidenceDir(evidencePath: string, artifactDir: string) {
  const resolved = path.resolve(evidencePath);
  if (!fs.existsSync(resolved)) throw new Error(`Windows evidence path not found: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) return { evidenceDir: resolved, evidenceArchive: null as string | null };
  if (!stat.isFile() || path.extname(resolved).toLowerCase() !== '.zip') {
    throw new Error(`Windows evidence must be a directory or .zip archive: ${resolved}`);
  }

  const extractedRoot = path.join(artifactDir, 'windows-evidence-archive');
  fs.rmSync(extractedRoot, { recursive: true, force: true });
  fs.mkdirSync(extractedRoot, { recursive: true });
  extractWindowsEvidenceArchive(resolved, extractedRoot);

  if (fs.existsSync(path.join(extractedRoot, windowsEvidenceManifestName))) {
    return { evidenceDir: extractedRoot, evidenceArchive: resolved };
  }
  const manifestDirs = fs.readdirSync(extractedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(extractedRoot, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, windowsEvidenceManifestName)));
  if (manifestDirs.length === 1) return { evidenceDir: manifestDirs[0], evidenceArchive: resolved };
  throw new Error(`Windows evidence archive must contain ${windowsEvidenceManifestName} at the archive root or in one top-level directory.`);
}

export function importWindowsEvidenceGate(
  result: GateResult,
  options: GateOptions,
  dependencies: WindowsEvidenceDependencies,
): GateResult {
  const prepared = prepareWindowsEvidenceDir(options.evidence, result.artifact_dir);
  const evidenceDir = prepared.evidenceDir;
  const validation = validateWindowsEvidence(evidenceDir, dependencies);
  result.diagnostics_dir = validation.diagnosticsDir || result.diagnostics_dir;
  result.diagnostics_validation = validation.diagnosticsValidation;
  result.secret_scan = {
    status:
      validation.diagnosticsValidation.secret_scan.status === 'passed' && validation.forbiddenSecretMarkers.length === 0
        ? 'passed'
        : 'failed',
    forbidden_secret_markers: [
      ...validation.diagnosticsValidation.secret_scan.forbidden_secret_markers,
      ...validation.forbiddenSecretMarkers,
    ],
  };
  result.evidence_validation = {
    status: validation.status,
    evidence_dir: evidenceDir,
    manifest_path: validation.manifestPath,
    errors: validation.errors,
    forbidden_secret_markers: validation.forbiddenSecretMarkers,
  };
  result.evidence.windows_evidence_dir = evidenceDir;
  result.evidence.windows_evidence_manifest = validation.manifestPath;
  if (prepared.evidenceArchive) result.evidence.windows_evidence_archive = prepared.evidenceArchive;
  if (validation.diagnosticsDir) {
    result.evidence.windows_diagnostics_dir = validation.diagnosticsDir;
    dependencies.readDiagnosticsSummary(result, options, validation.diagnosticsValidation.image_identity);
  }
  if (validation.apiKeyFlowEvidencePath) {
    result.api_key_flow = {
      status: validation.apiKeyFlowValidation.status,
      mode: 'imported_evidence',
      endpoint: typeof validation.apiKeyFlowValidation.payload.endpoint === 'string'
        ? validation.apiKeyFlowValidation.payload.endpoint
        : null,
      command: typeof validation.apiKeyFlowValidation.payload.command === 'string'
        ? validation.apiKeyFlowValidation.payload.command
        : null,
      stdin_transport: validation.apiKeyFlowValidation.payload.stdin_transport === true,
      receipt_path: validation.apiKeyFlowEvidencePath,
      errors: validation.apiKeyFlowValidation.errors,
    };
    result.evidence.windows_api_key_flow_evidence = validation.apiKeyFlowEvidencePath;
  }
  if (validation.diagnosticsValidation.preservation_verdict) {
    result.data_preservation = {
      status: 'passed',
      verdict: validation.diagnosticsValidation.preservation_verdict,
      summary: `verdict=${validation.diagnosticsValidation.preservation_verdict}`,
    };
  }

  const summaryPath = path.join(result.artifact_dir, 'windows-evidence-import-summary.json');
  writeJson(summaryPath, {
    schema: 'opl_docker_webui_windows_evidence_import_summary.v1',
    status: validation.status,
    evidence_dir: evidenceDir,
    evidence_archive: prepared.evidenceArchive,
    manifest_path: validation.manifestPath,
    diagnostics_dir: validation.diagnosticsDir,
    diagnostics_validation: validation.diagnosticsValidation,
    api_key_flow_validation: validation.apiKeyFlowValidation,
    errors: validation.errors,
    forbidden_secret_markers: validation.forbiddenSecretMarkers,
    manifest: validation.manifest,
  });
  result.evidence.windows_evidence_import_summary = summaryPath;
  result.status = validation.status === 'passed' ? 'passed' : 'failed';
  return result;
}
