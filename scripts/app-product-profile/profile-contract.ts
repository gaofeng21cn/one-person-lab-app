import fs from 'node:fs';
import { assertDefaultCodexSessionProfile } from '../app-product-profile-default-session.ts';
import { assertAppProductProfileIdentity } from '../app-product-profile-identity.ts';
import { assertOfficialProfileShape } from '../app-product-profile-shared-validators.ts';
import { appProductProfilePath } from './paths.ts';
import type { AppProductProfile } from './types.ts';
import { assertAgentPackageRegistryProjection } from './profile-contract-parts/packages.ts';
import { assertSettingsProfileShape } from './profile-contract-parts/settings.ts';
import { assertCompanionPayloadProfileShape } from './profile-contract-parts/companion.ts';
import { assertFirstRunProfileShape } from './profile-contract-parts/first-run.ts';
import { assertCodexOplFlowContext } from './profile-contract-parts/flow.ts';
import {
  assertHomeActivityCenterPolicy,
  assertHomeCodexProfileShape,
  assertHomeSelectionAndIconPolicy,
  assertHomeShortcutCompatibilityMetadata,
  assertNoFixedAgentHomePresentation,
  assertUiLocalePolicy,
} from './profile-contract-parts/home.ts';
import { assertOrdinaryCapabilitySelectorPolicy } from './profile-contract-parts/capabilities.ts';
import { assertStringArray } from './profile-contract-parts/support.ts';

function assertProfileShape(profile: AppProductProfile): void {
  assertAppProductProfileIdentity(profile);
  if (profile.product?.ordinary_chrome_name !== 'One Person Lab') {
    throw new Error('App product profile product.ordinary_chrome_name must be One Person Lab');
  }
  assertDefaultCodexSessionProfile(profile);
  assertCodexOplFlowContext(profile);
  assertHomeCodexProfileShape(profile);
  assertHomeShortcutCompatibilityMetadata(profile);
  assertHomeActivityCenterPolicy(profile);
  assertHomeSelectionAndIconPolicy(profile);
  assertOfficialProfileShape(profile.official_profile, 'App product profile Official Profile');
  assertUiLocalePolicy(profile);
  assertNoFixedAgentHomePresentation(profile);
  assertOrdinaryCapabilitySelectorPolicy(profile);
  assertFirstRunProfileShape(profile);
  assertSettingsProfileShape(profile);
  assertCompanionPayloadProfileShape(profile);
  assertStringArray(profile.boundary.app_does_not_own, 'boundary.app_does_not_own');
}

export function readAppProductProfile(profilePath = appProductProfilePath): AppProductProfile {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as AppProductProfile;
  assertProfileShape(profile);
  assertAgentPackageRegistryProjection(profile);
  return profile;
}
