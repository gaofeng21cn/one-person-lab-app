import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// App owns these first-install resources for both Standard and Full carriers.
export function materializeStudioOfficialProfileResources(targetRoot: string, appRoot: string): void {
  const officialProfileRoot = path.join(targetRoot, 'resources', 'opl-official-profile');
  fs.mkdirSync(officialProfileRoot, { recursive: true });
  const helper = fs.readFileSync(path.join(appRoot, 'scripts', 'official-profile-package-apply.ts'));
  const profile = fs.readFileSync(path.join(appRoot, 'contracts', 'app-product-profile.json'));
  fs.writeFileSync(path.join(officialProfileRoot, 'official-profile-package-apply.ts'), helper);
  fs.writeFileSync(path.join(officialProfileRoot, 'app-product-profile.json'), profile);
  fs.writeFileSync(path.join(officialProfileRoot, 'manifest.json'), JSON.stringify({
    schema: 'opl_app_official_profile_resources.v1',
    authority: 'one-person-lab-app',
    helper_sha256: crypto.createHash('sha256').update(helper).digest('hex'),
    profile_sha256: crypto.createHash('sha256').update(profile).digest('hex'),
  }, null, 2) + '\n');
}
