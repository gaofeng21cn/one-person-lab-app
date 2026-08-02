import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validatePageStateMatrix } from '../../scripts/validate-active-shell/page-state-matrix-validator.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

const validateMatrix = (matrix: any, guiContract = readJson('contracts/app-gui-product-contract.json')) => validatePageStateMatrix(
  matrix,
  readJson('contracts/app-shell-adapter.json'),
  guiContract,
);

test('default product gates require the core Runtime route', () => {
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  delete guiContract.pages.runtime_status;
  assert.throws(() => validateMatrix(readJson('contracts/app-page-state-matrix.json'), guiContract));

  const matrix = readJson('contracts/app-page-state-matrix.json');
  matrix.pages = matrix.pages.filter((page: any) => page.id !== 'runtime');
  assert.throws(() => validateMatrix(matrix));
});

test('default page-state gate rejects core Runtime metadata that weakens the required scope', () => {
  const matrix = readJson('contracts/app-page-state-matrix.json');
  matrix.pages.find((page: any) => page.id === 'runtime').default_product_required = false;
  assert.throws(() => validateMatrix(matrix));
});
