import { isDeepStrictEqual } from 'node:util';

import {
  standardUpdaterCandidateSelectionViolation,
  standardUpdaterMetadataViolation,
} from '../../standard-updater-contract-policy.ts';

export function validateStandardUpdater(updater) {
  if (
    updater?.scope !== 'desktop_app_assets_only'
    || updater?.module_package_update_allowed !== false
    || updater?.opl_flow_install_allowed !== false
    || updater?.post_update_reconcile_ref !== 'managed_update_plane.carrier_reconciliation'
  ) {
    throw new Error('Standard updater must remain App-binary-only and join the carrier-neutral Framework reconciliation path');
  }

  const violation = standardUpdaterMetadataViolation(updater, isDeepStrictEqual)
    ?? standardUpdaterCandidateSelectionViolation(updater?.candidate_selection, isDeepStrictEqual, isDeepStrictEqual);
  if (violation !== null) {
    throw new Error(violation);
  }
}
