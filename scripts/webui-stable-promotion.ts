#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  admitWebuiStablePromotion,
  record,
  type AuthorityMode,
  type JsonRecord,
} from './webui-stable-promotion/admission.ts';
import {
  decideWebuiStablePromotion,
  writeWebuiStablePromotionReceipt,
} from './webui-stable-promotion/reconcile.ts';

function readJson(filePath: string, label: string): JsonRecord {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be one non-empty regular JSON file.`);
  }
  return record(JSON.parse(fs.readFileSync(resolved, 'utf8')), label);
}

export {
  admitWebuiStablePromotion,
  decideWebuiStablePromotion,
  writeWebuiStablePromotionReceipt,
};
export type { WebuiStableAdmissionInput } from './webui-stable-promotion/admission.ts';

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function writeOutput(filePath: string, value: JsonRecord): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main(argv: string[]): void {
  const command = argv[0];
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      'authority-mode': { type: 'string' },
      'carrier-follower-run': { type: 'string' },
      'carrier-follower-run-id': { type: 'string' },
      'carrier-follower-job': { type: 'string' },
      'carrier-executor-app-sha': { type: 'string' },
      'promotion-executor-run': { type: 'string' },
      'promotion-executor-run-id': { type: 'string' },
      'promotion-app-sha': { type: 'string' },
      'carrier-receipt': { type: 'string' },
      'immutable-readback': { type: 'string' },
      'version-readback': { type: 'string' },
      'stable-prestate': { type: 'string' },
      'latest-prestate': { type: 'string' },
      'publication-record': { type: 'string' },
      'source-authority': { type: 'string' },
      operator: { type: 'string' },
      'operator-confirmation': { type: 'string' },
      admission: { type: 'string' },
      decision: { type: 'string' },
      'current-stable': { type: 'string' },
      'current-latest': { type: 'string' },
      mutation: { type: 'string' },
      readbacks: { type: 'string' },
      'latest-readbacks': { type: 'string' },
      'anonymous-readback': { type: 'string' },
      'latest-anonymous-readback': { type: 'string' },
      output: { type: 'string' },
    },
  });
  let result: JsonRecord;
  if (command === 'admit') {
    const authorityMode = required(values['authority-mode'], 'authority-mode') as AuthorityMode;
    const carrierFollowerRunPath = required(
      values['carrier-follower-run'],
      'carrier-follower-run',
    );
    const carrierFollowerJobPath = required(
      values['carrier-follower-job'],
      'carrier-follower-job',
    );
    const promotionExecutorRunPath = required(
      values['promotion-executor-run'],
      'promotion-executor-run',
    );
    const carrierReceiptPath = required(values['carrier-receipt'], 'carrier-receipt');
    const immutableReadbackPath = required(values['immutable-readback'], 'immutable-readback');
    const versionReadbackPath = required(values['version-readback'], 'version-readback');
    const stablePrestatePath = required(values['stable-prestate'], 'stable-prestate');
    const latestPrestatePath = required(values['latest-prestate'], 'latest-prestate');
    const sourceAuthorityPath = values['source-authority']
      ? required(values['source-authority'], 'source-authority')
      : undefined;
    const publicationRecordPath = values['publication-record']
      ? required(values['publication-record'], 'publication-record')
      : undefined;
    result = admitWebuiStablePromotion({
      authorityMode,
      carrierFollowerRun: readJson(carrierFollowerRunPath, 'carrier follower run'),
      carrierFollowerRunPath,
      carrierFollowerRunId: required(
        values['carrier-follower-run-id'],
        'carrier-follower-run-id',
      ),
      carrierFollowerJob: readJson(carrierFollowerJobPath, 'carrier follower job'),
      carrierFollowerJobPath,
      carrierExecutorAppSha: required(
        values['carrier-executor-app-sha'],
        'carrier-executor-app-sha',
      ),
      promotionExecutorRun: readJson(promotionExecutorRunPath, 'promotion executor run'),
      promotionExecutorRunPath,
      promotionExecutorRunId: required(
        values['promotion-executor-run-id'],
        'promotion-executor-run-id',
      ),
      promotionAppSha: required(values['promotion-app-sha'], 'promotion-app-sha'),
      carrierReceipt: readJson(carrierReceiptPath, 'carrier receipt'),
      carrierReceiptPath,
      immutableReadback: readJson(immutableReadbackPath, 'immutable readback'),
      immutableReadbackPath,
      versionReadback: readJson(versionReadbackPath, 'version readback'),
      versionReadbackPath,
      stablePrestate: readJson(stablePrestatePath, 'Stable prestate'),
      stablePrestatePath,
      latestPrestate: readJson(latestPrestatePath, 'Latest prestate'),
      latestPrestatePath,
      publicationRecord: publicationRecordPath
        ? readJson(publicationRecordPath, 'durable publication record')
        : undefined,
      publicationRecordPath,
      sourceAuthority: sourceAuthorityPath
        ? readJson(sourceAuthorityPath, 'WebUI source authority')
        : undefined,
      sourceAuthorityPath,
      operator: values.operator ? required(values.operator, 'operator') : undefined,
      operatorConfirmation: values['operator-confirmation']
        ? required(values['operator-confirmation'], 'operator-confirmation')
        : undefined,
    });
  } else if (command === 'decide') {
    result = decideWebuiStablePromotion(
      readJson(required(values.admission, 'admission'), 'admission'),
      readJson(required(values['current-stable'], 'current-stable'), 'current Stable readback'),
      readJson(required(values['current-latest'], 'current-latest'), 'current Latest readback'),
    );
  } else if (command === 'receipt') {
    result = writeWebuiStablePromotionReceipt({
      admission: readJson(required(values.admission, 'admission'), 'admission'),
      decision: readJson(required(values.decision, 'decision'), 'decision'),
      mutation: readJson(required(values.mutation, 'mutation'), 'mutation'),
      readbacks: readJson(required(values.readbacks, 'readbacks'), 'readbacks'),
      latestReadbacks: readJson(
        required(values['latest-readbacks'], 'latest-readbacks'),
        'Latest readbacks',
      ),
      anonymousReadback: readJson(
        required(values['anonymous-readback'], 'anonymous-readback'),
        'anonymous readback',
      ),
      latestAnonymousReadback: readJson(
        required(values['latest-anonymous-readback'], 'latest-anonymous-readback'),
        'anonymous Latest readback',
      ),
    });
  } else {
    throw new Error('Usage: webui-stable-promotion.ts <admit|decide|receipt> [options].');
  }
  writeOutput(required(values.output, 'output'), result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
