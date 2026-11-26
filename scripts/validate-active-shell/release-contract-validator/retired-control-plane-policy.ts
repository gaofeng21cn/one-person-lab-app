import { visitRetiredReleaseControlPlane } from '../../validate-release-boundary/release-contract-policy/retirement.ts';

export function assertRetiredReleaseControlPlaneAbsent(releaseChannel: unknown): void {
  visitRetiredReleaseControlPlane(releaseChannel, (kind, path) => {
    const label = kind === 'field' ? 'control-plane field' : kind;
    throw new Error(`Retired release ${label} remains live at ${path}`);
  });
}
