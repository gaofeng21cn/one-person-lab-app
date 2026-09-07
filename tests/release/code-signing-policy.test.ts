import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string): string => fs.readFileSync(path, 'utf8');

test('public entry points expose privacy and code-signing policies', () => {
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    const text = read(readme);
    assert.match(text, /docs\/security\/privacy-policy\.md/);
    assert.match(text, /docs\/security\/code-signing-policy\.md/);
    assert.match(text, /SignPath\.io\]\(https:\/\/about\.signpath\.io\/\)/);
    assert.match(text, /SignPath Foundation\]\(https:\/\/signpath\.org\/\)/);
  }
});

test('official workflow cannot silently enable Sentry collection', () => {
  const workflow = read('.github/workflows/_build-reusable.yml');
  for (const secret of ['SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
    assert.doesNotMatch(workflow, new RegExp(`secrets\\.${secret}`));
  }
});
