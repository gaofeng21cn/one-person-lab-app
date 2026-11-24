import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateAppGuiProductContract } from '../../../scripts/validate-active-shell/gui-product-contract-validator.ts';
import { validatePrimaryInteractionPages } from '../../../scripts/validate-active-shell/page-state-primary-interaction-validator.ts';
import { validateProductProfile } from '../../../scripts/validate-active-shell/product-profile-validator.ts';
import {
  assertCodexModelPolicyProjection,
  projectCodexModelPolicyContracts,
} from '../../../scripts/app-product-profile/codex-model-policy-projection.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

const readModelPolicyBundle = () => ({
  productProfile: readJson('contracts/app-product-profile.json'),
  guiProductContract: readJson('contracts/app-gui-product-contract.json'),
  pageStateMatrix: readJson('contracts/app-page-state-matrix.json'),
});

export {
  assert,
  fs,
  test,
  validateAppGuiProductContract,
  validatePrimaryInteractionPages,
  validateProductProfile,
  assertCodexModelPolicyProjection,
  projectCodexModelPolicyContracts,
  readJson,
  readModelPolicyBundle,
};
