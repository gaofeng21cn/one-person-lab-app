import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('MiniApp shared dsh-theme.css matches the pinned SHA-256 and canonical Framework asset', () => {
  const contract = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/opl-apps-miniapp-visual-contract.json'), 'utf8'),
  ) as {
    adopters: Array<{ surface: string; stylesheet: string }>;
    visual_source: {
      stylesheet: string;
      stylesheet_sha256: string;
      canonical_framework_stylesheet: string;
    };
  };

  const stylesheetPath = path.join(appRoot, contract.visual_source.stylesheet);
  assert.equal(fs.existsSync(stylesheetPath), true, `Missing stylesheet ${contract.visual_source.stylesheet}`);
  const actualHash = sha256File(stylesheetPath);
  assert.equal(
    actualHash,
    contract.visual_source.stylesheet_sha256,
    'resources/miniapp-dsh/dsh-theme.css drifted from declared visual_source.stylesheet_sha256',
  );
  assert.equal(
    contract.visual_source.canonical_framework_stylesheet,
    'one-person-lab/packages/mcp-app-shared/assets/dsh-theme.css',
  );
  assert.equal(
    contract.adopters.find((entry) => entry.surface === 'shared-host')?.stylesheet,
    'packages/mcp-app-shared/assets/dsh-theme.css',
  );

  const canonicalFrameworkCss = path.resolve(
    appRoot,
    '../one-person-lab/packages/mcp-app-shared/assets/dsh-theme.css',
  );
  if (fs.existsSync(canonicalFrameworkCss)) {
    assert.equal(
      actualHash,
      sha256File(canonicalFrameworkCss),
      'resources/miniapp-dsh/dsh-theme.css must match canonical one-person-lab/packages/mcp-app-shared/assets/dsh-theme.css byte-for-byte',
    );
  }
});
