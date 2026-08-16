import type { ChangeBucket, ChangeBucketId } from './types.ts';

const bucketOrder: ChangeBucketId[] = ['first_run', 'agents', 'ui_settings', 'release', 'docs', 'quality'];

const bucketTitles: Record<ChangeBucketId, string> = {
  first_run: 'First launch and setup',
  agents: 'Built-in research, grant, and visual work',
  ui_settings: 'App readiness and settings',
  release: 'Installing and updating',
  docs: 'Guides and screenshots',
  quality: 'Reliability polish',
};

export function normalizedSubject(subject: string) {
  return subject
    .replace(/\s+\(#\d+\)\s*$/, '')
    .replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, '')
    .trim()
    .toLowerCase();
}

function addUnique(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function classifySubject(subject: string): { bucket: ChangeBucketId; bullet: string } {
  if (/^docs(?:\([^)]+\))?!?:/i.test(subject) || /(readme|guide|screenshot|tutorial)/i.test(subject)) {
    return {
      bucket: 'docs',
      bullet: 'Updated the install and getting-started guidance so it matches what ships in the App.',
    };
  }
  if (/(first[- ]run|beginner|setup surface|bootstrap|initialize|launch ready|ready_to_launch|guid readiness)/i.test(subject)) {
    return {
      bucket: 'first_run',
      bullet: 'Made first launch and setup steps clearer before users open the built-in OPL sessions.',
    };
  }
  if (/(guid|assistant|skill|codex|model-selector|model selector|home skills|purpose assistant|route|mas|mag|rca|oma|opl meta agent|plugin)/i.test(subject)) {
    if (/model/i.test(subject)) {
      return {
        bucket: 'agents',
        bullet: 'Improved model status and preference handling before users start built-in OPL sessions.',
      };
    }
    return {
      bucket: 'agents',
      bullet: 'Refreshed the built-in research, grant, visual deliverable, and agent-design entries used from the App.',
    };
  }
  if (/(settings|gui|home|progress|runtime|provider|health|display)/i.test(subject)) {
    return {
      bucket: 'ui_settings',
      bullet: 'Made App and provider readiness easier to check before starting an OPL session.',
    };
  }
  if (/(release|build|ci|vm|full|package|installer|update|webui|docker|cache|aioncore|dmg|asset)/i.test(subject)) {
    return {
      bucket: 'release',
      bullet: 'Kept the standard updater, Full installer, and one-shot install path separate so users choose the right package.',
    };
  }
  return {
    bucket: 'quality',
    bullet: 'Reduced maintenance noise behind the App so install and session paths stay predictable.',
  };
}

export function summarizeChanges(subjects: string[]) {
  const buckets = new Map<ChangeBucketId, ChangeBucket>();
  for (const bucketId of bucketOrder) {
    buckets.set(bucketId, { title: bucketTitles[bucketId], bullets: [] });
  }

  for (const subject of subjects) {
    const { bucket, bullet } = classifySubject(subject);
    addUnique(buckets.get(bucket)?.bullets ?? [], bullet);
  }

  return bucketOrder
    .map((bucketId) => buckets.get(bucketId))
    .filter((bucket): bucket is ChangeBucket => Boolean(bucket && bucket.bullets.length > 0));
}

function ensureAgentBucket(buckets: ChangeBucket[]) {
  let agentBucket = buckets.find((bucket) => bucket.title === bucketTitles.agents);
  if (!agentBucket) {
    agentBucket = { title: bucketTitles.agents, bullets: [] };
    const agentIndex = bucketOrder.indexOf('agents');
    const insertAt = Math.min(agentIndex, buckets.length);
    buckets.splice(insertAt, 0, agentBucket);
  }
  return agentBucket;
}

export function appendAgentChangeSummary(buckets: ChangeBucket[], includeFullPackage: boolean) {
  const agentBucket = ensureAgentBucket(buckets);
  addUnique(
    agentBucket.bullets,
    includeFullPackage
      ? 'Included refreshed research, grant, visual deliverable, agent-design, Office, and document-intake tools in the Full package.'
      : 'Kept the standard App package aligned with built-in research, grant, visual deliverable, and agent-design entry points.',
  );
}

export function humanizeCommitSubject(subject: string) {
  return subject
    .replace(/\s+\(#\d+\)\s*$/, '')
    .replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, '')
    .replace(/\bOMA\b/g, 'OPL Meta Agent')
    .replace(/[-_]+/g, ' ')
    .trim();
}

export function fallbackChangeSummaryHint(label: string, subjects: string[]) {
  const detail = subjects
    .map(humanizeCommitSubject)
    .filter(Boolean)
    .slice(0, 2)
    .join('; ');
  if (!detail) {
    return null;
  }
  return `${label} has user-visible updates around ${detail}.`;
}

export function buildChangeSummaryHint(label: string, subjects: string[]) {
  const text = subjects.join(' ');
  if (!text.trim()) {
    return null;
  }
  if (label === 'MAS') {
    if (/(currentness|closeout|handoff|route[- ]back|blocker|redrive|paper)/i.test(text)) {
      return 'Research sessions make study and paper status, handoff context, and next steps clearer before users rely on outputs.';
    }
  }
  if (label === 'MAG') {
    if (/(progress[- ]first|owner payload|grant|funding|generated interface|replacement boundary)/i.test(text)) {
      return 'Grant-writing sessions make progress, source material, and next-step ownership clearer for funding work.';
    }
  }
  if (label === 'RCA') {
    if (/(currentness|operator evidence|provider|visual|slide|deliverable|wrapper)/i.test(text)) {
      return 'Visual deliverable sessions make provider readiness and output evidence easier to check before users rely on slides or graphics.';
    }
  }
  if (label === 'OPL Meta Agent') {
    if (/(work[- ]order|currentness|progress[- ]first|install path|foundry|agent)/i.test(text)) {
      return 'Agent-design sessions make work-order status and next steps clearer when users build or improve agents.';
    }
  }
  if (label === 'OPL Framework') {
    if (/(runtime|progress[- ]first|provider|state|action|receipt|liveness|supervision)/i.test(text)) {
      return 'The shared App foundation makes provider readiness, state reads, and App actions easier to inspect.';
    }
  }
  return fallbackChangeSummaryHint(label, subjects);
}
