import crypto from 'node:crypto';
import type {
  GithubOwnerDraftReservation,
  GithubOwnerReleaseAsset,
  GithubOwnerReleaseNamespaceEvidence,
} from './types.ts';
import {
  canonicalAppOwner,
  canonicalAppRepository,
  ownerReleaseNamespacePageLimit,
  ownerReleaseNamespacePageSize,
} from './types.ts';
const digestPattern = /^sha256:[0-9a-f]{64}$/;

function evidenceRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, any>;
}

function evidenceString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function evidenceInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return Number(value);
}

function canonicalEvidenceJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalEvidenceJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalEvidenceJson(record[key])}`)
    .join(',')}}`;
}

function evidenceDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalEvidenceJson(value)).digest('hex')}`;
}

function evidenceInstant(value: unknown, label: string): string {
  const instant = evidenceString(value, label);
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== instant) {
    throw new Error(`${label} must be an exact ISO-8601 UTC instant.`);
  }
  return instant;
}

function normalizedOwnerReleasePages(pages: unknown[]): {
  releases: Array<{
    id: number;
    tag: string;
    target: string;
    draft: boolean;
    prerelease: boolean;
    assets: GithubOwnerReleaseAsset[];
  }>;
  terminalPageSize: number;
} {
  if (
    !Array.isArray(pages)
    || pages.length === 0
    || pages.length > ownerReleaseNamespacePageLimit
  ) {
    throw new Error('Owner release namespace pagination is missing or exceeds its bounded page limit.');
  }
  const releaseIds = new Set<number>();
  const releaseTags = new Set<string>();
  const releases: Array<{
    id: number;
    tag: string;
    target: string;
    draft: boolean;
    prerelease: boolean;
    assets: GithubOwnerReleaseAsset[];
  }> = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!Array.isArray(page) || page.length > ownerReleaseNamespacePageSize) {
      throw new Error(`Owner release namespace page ${pageIndex + 1} is malformed.`);
    }
    const isFinalPage = pageIndex === pages.length - 1;
    if (
      (!isFinalPage && page.length !== ownerReleaseNamespacePageSize)
      || (isFinalPage && page.length === ownerReleaseNamespacePageSize)
    ) {
      throw new Error(
        `Owner release namespace pages are incomplete at page ${pageIndex + 1}; `
        + `page_size=${page.length} limit=${ownerReleaseNamespacePageSize}.`,
      );
    }
    for (let entryIndex = 0; entryIndex < page.length; entryIndex += 1) {
      const label = `Owner release page ${pageIndex + 1} entry ${entryIndex}`;
      const release = evidenceRecord(page[entryIndex], label);
      const id = evidenceInteger(release.id, `${label} id`);
      if (id === 0) throw new Error(`${label} id must be positive.`);
      const tag = evidenceString(release.tag_name, `${label} tag`);
      const target = evidenceString(release.target_commitish, `${label} target`);
      if (typeof release.draft !== 'boolean' || typeof release.prerelease !== 'boolean') {
        throw new Error(`${label} must declare boolean draft and prerelease state.`);
      }
      if (!Array.isArray(release.assets)) throw new Error(`${label} assets must be an array.`);
      const assetIds = new Set<number>();
      const assetNames = new Set<string>();
      const assets = release.assets.map((entry: unknown, assetIndex: number): GithubOwnerReleaseAsset => {
        const assetLabel = `${label} asset ${assetIndex}`;
        const asset = evidenceRecord(entry, assetLabel);
        const assetId = evidenceInteger(asset.id, `${assetLabel} id`);
        const assetName = evidenceString(asset.name, `${assetLabel} name`);
        const assetSize = evidenceInteger(asset.size, `${assetLabel} size`);
        const assetDigest = asset.digest === null
          ? null
          : evidenceString(asset.digest, `${assetLabel} digest`);
        const assetUrl = evidenceString(asset.browser_download_url, `${assetLabel} browser_download_url`);
        if (
          assetId === 0
          || (assetDigest !== null && !digestPattern.test(assetDigest))
          || assetIds.has(assetId)
          || assetNames.has(assetName)
        ) {
          throw new Error(`${assetLabel} identity or digest is invalid or duplicated.`);
        }
        assetIds.add(assetId);
        assetNames.add(assetName);
        return {
          id: assetId,
          name: assetName,
          size: assetSize,
          digest: assetDigest,
          browser_download_url: assetUrl,
        };
      }).sort((left: GithubOwnerReleaseAsset, right: GithubOwnerReleaseAsset) => left.id - right.id);
      if (releaseIds.has(id) || releaseTags.has(tag)) {
        throw new Error(`${label} duplicates a prior release id or tag.`);
      }
      releaseIds.add(id);
      releaseTags.add(tag);
      releases.push({
        id,
        tag,
        target,
        draft: release.draft,
        prerelease: release.prerelease,
        assets,
      });
    }
  }
  return {
    releases,
    terminalPageSize: (pages.at(-1) as unknown[]).length,
  };
}

export function createGithubOwnerReleaseNamespaceEvidence(input: {
  repository: string;
  checkedAt: string;
  authenticatedUser: unknown;
  repositoryObservation: unknown;
  releasePages: unknown[];
}): GithubOwnerReleaseNamespaceEvidence {
  if (input.repository !== canonicalAppRepository) {
    throw new Error(`Owner release namespace evidence must target ${canonicalAppRepository}.`);
  }
  const authenticatedUser = evidenceRecord(input.authenticatedUser, 'Authenticated GitHub user');
  const repository = evidenceRecord(input.repositoryObservation, 'GitHub repository observation');
  const repositoryOwner = evidenceRecord(repository.owner, 'GitHub repository owner');
  const repositoryPermissions = evidenceRecord(repository.permissions, 'GitHub repository permissions');
  const authenticatedLogin = evidenceString(authenticatedUser.login, 'Authenticated GitHub login');
  const repositoryOwnerLogin = evidenceString(repositoryOwner.login, 'GitHub repository owner login');
  const repositoryFullName = evidenceString(repository.full_name, 'GitHub repository full name');
  if (
    authenticatedLogin !== canonicalAppOwner
    || repositoryOwnerLogin !== canonicalAppOwner
    || repositoryFullName !== canonicalAppRepository
    || repositoryPermissions.push !== true
  ) {
    throw new Error(
      `Owner release namespace read must use ${canonicalAppOwner} with push access to ${canonicalAppRepository}.`,
    );
  }
  const { releases, terminalPageSize } = normalizedOwnerReleasePages(input.releasePages);
  const draftReservations = releases
    .filter((release) => release.draft)
    .map((release): GithubOwnerDraftReservation => ({
      id: release.id,
      tag: release.tag,
      target: release.target,
      draft: true,
      prerelease: release.prerelease,
      assets: release.assets,
    }))
    .sort((left, right) => left.id - right.id);
  const core = {
    schema: 'opl_github_owner_release_namespace_evidence.v1' as const,
    status: 'verified_complete' as const,
    repository: canonicalAppRepository,
    endpoint: `repos/${canonicalAppRepository}/releases` as const,
    checked_at: evidenceInstant(input.checkedAt, 'Owner release namespace checked_at'),
    read_context: 'controller_source_gate_pre_nonce' as const,
    owner: {
      authenticated_login: canonicalAppOwner,
      repository_owner: canonicalAppOwner,
      repository_full_name: canonicalAppRepository,
      repository_push: true as const,
    },
    pagination: {
      page_size: ownerReleaseNamespacePageSize,
      page_count: input.releasePages.length,
      terminal_page_size: terminalPageSize,
      release_count: releases.length,
      complete: true as const,
    },
    draft_reservations: draftReservations,
    release_collection_digest: evidenceDigest(releases),
  };
  return { ...core, evidence_digest: evidenceDigest(core) };
}

export function validateGithubOwnerReleaseNamespaceEvidence(
  value: unknown,
  expectedRepository = canonicalAppRepository,
): GithubOwnerReleaseNamespaceEvidence {
  const evidence = evidenceRecord(value, 'GitHub owner release namespace evidence');
  const owner = evidenceRecord(evidence.owner, 'GitHub owner release namespace evidence.owner');
  const pagination = evidenceRecord(evidence.pagination, 'GitHub owner release namespace evidence.pagination');
  if (!Array.isArray(evidence.draft_reservations)) {
    throw new Error('GitHub owner release namespace draft_reservations must be an array.');
  }
  const reservationIds = new Set<number>();
  const reservationTags = new Set<string>();
  const draftReservations = evidence.draft_reservations
    .map((entry: unknown, index: number): GithubOwnerDraftReservation => {
      const reservation = evidenceRecord(entry, `GitHub owner draft reservation ${index}`);
      const id = evidenceInteger(reservation.id, `GitHub owner draft reservation ${index} id`);
      const tag = evidenceString(reservation.tag, `GitHub owner draft reservation ${index} tag`);
      const target = evidenceString(reservation.target, `GitHub owner draft reservation ${index} target`);
      if (!Array.isArray(reservation.assets)) {
        throw new Error(`GitHub owner draft reservation ${index} assets must be an array.`);
      }
      const assetIds = new Set<number>();
      const assetNames = new Set<string>();
      const assets = reservation.assets
        .map((entry: unknown, assetIndex: number): GithubOwnerReleaseAsset => {
          const assetLabel = `GitHub owner draft reservation ${index} asset ${assetIndex}`;
          const asset = evidenceRecord(entry, assetLabel);
          const id = evidenceInteger(asset.id, `${assetLabel} id`);
          const name = evidenceString(asset.name, `${assetLabel} name`);
          const size = evidenceInteger(asset.size, `${assetLabel} size`);
          const digest = asset.digest === null ? null : evidenceString(asset.digest, `${assetLabel} digest`);
          const browserDownloadUrl = evidenceString(
            asset.browser_download_url,
            `${assetLabel} browser_download_url`,
          );
          if (
            id === 0
            || (digest !== null && !digestPattern.test(digest))
            || assetIds.has(id)
            || assetNames.has(name)
          ) {
            throw new Error(`${assetLabel} identity or digest is invalid or duplicated.`);
          }
          assetIds.add(id);
          assetNames.add(name);
          return {
            id,
            name,
            size,
            digest,
            browser_download_url: browserDownloadUrl,
          };
        })
        .sort((left: GithubOwnerReleaseAsset, right: GithubOwnerReleaseAsset) => left.id - right.id);
      if (id === 0 || reservation.draft !== true || typeof reservation.prerelease !== 'boolean') {
        throw new Error(`GitHub owner draft reservation ${index} is malformed.`);
      }
      if (reservationIds.has(id) || reservationTags.has(tag)) {
        throw new Error(`GitHub owner draft reservation ${index} duplicates a prior reservation.`);
      }
      reservationIds.add(id);
      reservationTags.add(tag);
      return {
        id,
        tag,
        target,
        draft: true,
        prerelease: reservation.prerelease,
        assets,
      };
    })
    .sort((left: GithubOwnerDraftReservation, right: GithubOwnerDraftReservation) => left.id - right.id);
  const pageCount = evidenceInteger(pagination.page_count, 'Owner release namespace page_count');
  const terminalPageSize = evidenceInteger(
    pagination.terminal_page_size,
    'Owner release namespace terminal_page_size',
  );
  const releaseCount = evidenceInteger(pagination.release_count, 'Owner release namespace release_count');
  if (
    pageCount === 0
    || pageCount > ownerReleaseNamespacePageLimit
    || terminalPageSize >= ownerReleaseNamespacePageSize
    || releaseCount < draftReservations.length
    || !digestPattern.test(String(evidence.release_collection_digest))
  ) {
    throw new Error('GitHub owner release namespace pagination or collection digest is invalid.');
  }
  const core = {
    schema: 'opl_github_owner_release_namespace_evidence.v1' as const,
    status: 'verified_complete' as const,
    repository: canonicalAppRepository,
    endpoint: `repos/${canonicalAppRepository}/releases` as const,
    checked_at: evidenceInstant(evidence.checked_at, 'Owner release namespace checked_at'),
    read_context: 'controller_source_gate_pre_nonce' as const,
    owner: {
      authenticated_login: evidenceString(owner.authenticated_login, 'Owner authenticated_login'),
      repository_owner: evidenceString(owner.repository_owner, 'Owner repository_owner'),
      repository_full_name: evidenceString(owner.repository_full_name, 'Owner repository_full_name'),
      repository_push: owner.repository_push,
    },
    pagination: {
      page_size: pagination.page_size,
      page_count: pageCount,
      terminal_page_size: terminalPageSize,
      release_count: releaseCount,
      complete: pagination.complete,
    },
    draft_reservations: draftReservations,
    release_collection_digest: String(evidence.release_collection_digest),
  };
  const expected = { ...core, evidence_digest: evidenceDigest(core) };
  if (
    expectedRepository !== canonicalAppRepository
    || expected.repository !== expectedRepository
    || expected.owner.authenticated_login !== canonicalAppOwner
    || expected.owner.repository_owner !== canonicalAppOwner
    || expected.owner.repository_full_name !== canonicalAppRepository
    || expected.owner.repository_push !== true
    || expected.pagination.page_size !== ownerReleaseNamespacePageSize
    || expected.pagination.complete !== true
    || evidence.evidence_digest !== expected.evidence_digest
    || canonicalEvidenceJson(evidence) !== canonicalEvidenceJson(expected)
  ) {
    throw new Error('GitHub owner release namespace evidence is not the exact digest-bound proof.');
  }
  return expected;
}
