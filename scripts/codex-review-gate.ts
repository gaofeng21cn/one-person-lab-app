type GitHubReview = {
  user?: { login?: string | null } | null;
  commit_id?: string | null;
};

type GitHubReaction = {
  user?: { login?: string | null } | null;
  content?: string | null;
  source_head_sha?: string | null;
};

type GitHubIssueComment = {
  id?: number | null;
  body?: string | null;
  created_at?: string | null;
};

type ReviewThread = {
  isResolved: boolean;
  isOutdated: boolean;
  comments: Array<{ author?: { login?: string | null } | null }>;
};

export type CodexReviewGateInput = {
  headSha: string;
  reviews: GitHubReview[];
  reactions: GitHubReaction[];
  reviewThreads: ReviewThread[];
};

export type CodexReviewGateResult = {
  status: 'waiting' | 'failed' | 'passed';
  summary: string;
};

const codexBotLogin = 'chatgpt-codex-connector';

function normalizedLogin(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/\[bot\]$/, '');
}

function isCodexBot(value: string | null | undefined): boolean {
  return normalizedLogin(value) === codexBotLogin;
}

function hasCurrentCodexReview(reviews: GitHubReview[], headSha: string): boolean {
  return reviews.some(
    (review) => isCodexBot(review.user?.login) && String(review.commit_id ?? '').toLowerCase() === headSha,
  );
}

function hasTerminalCodexReaction(reactions: GitHubReaction[], headSha: string): boolean {
  return reactions.some(
    (reaction) =>
      isCodexBot(reaction.user?.login) &&
      reaction.content === '+1' &&
      String(reaction.source_head_sha ?? '').toLowerCase() === headSha,
  );
}

function unresolvedCurrentCodexThreads(reviewThreads: ReviewThread[]): ReviewThread[] {
  return reviewThreads.filter(
    (thread) =>
      !thread.isResolved &&
      !thread.isOutdated &&
      thread.comments.some((comment) => isCodexBot(comment.author?.login)),
  );
}

export function evaluateCodexReviewGate(input: CodexReviewGateInput): CodexReviewGateResult {
  const currentReview = hasCurrentCodexReview(input.reviews, input.headSha);
  const terminalReaction = hasTerminalCodexReaction(input.reactions, input.headSha);
  if (!currentReview && !terminalReaction) {
    return {
      status: 'waiting',
      summary: `Waiting for Codex to finish reviewing ${input.headSha.slice(0, 12)}. A reaction-only result must be attached to a head-bound @codex review comment.`,
    };
  }

  const unresolvedThreads = unresolvedCurrentCodexThreads(input.reviewThreads);
  if (unresolvedThreads.length > 0) {
    return {
      status: 'failed',
      summary: `Codex has ${unresolvedThreads.length} unresolved current review thread(s). Resolve or supersede them before merging.`,
    };
  }

  return {
    status: 'passed',
    summary: currentReview
      ? `Codex reviewed ${input.headSha.slice(0, 12)} and has no unresolved current threads.`
      : `Codex acknowledged ${input.headSha.slice(0, 12)} without review findings.`,
  };
}

type GitHubRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = requiredEnvironment('GITHUB_TOKEN');
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  return (await response.json()) as T;
}

async function paginatedGitHubRequest<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await githubRequest<T[]>(`${path}${separator}per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) return results;
  }
}

function codexReviewHeadFromComment(body: string | null | undefined): string | null {
  const match = String(body ?? '').match(/<!--\s*codex-review-head\s*:\s*([0-9a-f]{40})\s*-->/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function isHeadBoundCodexReviewRequest(comment: GitHubIssueComment, headSha: string): boolean {
  return /@codex\s+review\b/i.test(String(comment.body ?? '')) &&
    codexReviewHeadFromComment(comment.body) === headSha;
}

async function ensureHeadBoundCodexReviewRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
): Promise<void> {
  const comments = await paginatedGitHubRequest<GitHubIssueComment>(
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
  );
  if (comments.some((comment) => isHeadBoundCodexReviewRequest(comment, headSha))) return;
  await githubRequest(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body: `@codex review\n\n<!-- codex-review-head:${headSha} -->`,
    }),
  });
}

async function fetchCurrentRequestCommentReactions(
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
): Promise<GitHubReaction[]> {
  const comments = await paginatedGitHubRequest<GitHubIssueComment>(
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
  );
  const currentRequests = comments.filter((comment) => {
    return Number.isInteger(comment.id) &&
      isHeadBoundCodexReviewRequest(comment, headSha);
  });
  const reactions = await Promise.all(
    currentRequests.map(async (comment) => {
      const commentReactions = await paginatedGitHubRequest<GitHubReaction>(
        `/repos/${owner}/${repo}/issues/comments/${comment.id}/reactions`,
      );
      return commentReactions.map((reaction) => ({
        ...reaction,
        source_head_sha: headSha,
      }));
    }),
  );
  return reactions.flat();
}

async function fetchReviewThreads(request: GitHubRequest, owner: string, repo: string, pullNumber: number): Promise<ReviewThread[]> {
  const query = `
    query($owner: String!, $repo: String!, $pullNumber: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pullNumber) {
          reviewThreads(first: 100, after: $cursor) {
            nodes {
              isResolved
              isOutdated
              comments(first: 100) { nodes { author { login } } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `;
  const threads: ReviewThread[] = [];
  let cursor: string | null = null;
  do {
    const response = await request<{
      data?: {
        repository?: {
          pullRequest?: {
            reviewThreads?: {
              nodes?: Array<{
                isResolved: boolean;
                isOutdated: boolean;
                comments?: { nodes?: Array<{ author?: { login?: string | null } | null }> };
              }>;
              pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            };
          };
        };
      };
    }>('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables: { owner, repo, pullNumber, cursor } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const reviewThreads = response.data?.repository?.pullRequest?.reviewThreads;
    if (!reviewThreads) throw new Error(`Pull request #${pullNumber} was not found`);
    threads.push(
      ...(reviewThreads.nodes ?? []).map((thread) => ({
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        comments: thread.comments?.nodes ?? [],
      })),
    );
    cursor = reviewThreads.pageInfo?.hasNextPage ? reviewThreads.pageInfo.endCursor ?? null : null;
  } while (cursor);
  return threads;
}

function parsePositiveInteger(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`);
  return parsed;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type GitHubCheckRun = {
  id?: number | null;
};

const gateCheckName = 'Codex review gate';

function checkDetailsUrl(): string | undefined {
  const serverUrl = process.env.GITHUB_SERVER_URL?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const runId = process.env.GITHUB_RUN_ID?.trim();
  if (!serverUrl || !repository || !runId) return undefined;
  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

async function createHeadCheckRun(
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
): Promise<number> {
  const check = await githubRequest<GitHubCheckRun>(`/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    body: JSON.stringify({
      name: gateCheckName,
      head_sha: headSha,
      status: 'in_progress',
      external_id: `codex-review-gate:${pullNumber}:${headSha}`,
      details_url: checkDetailsUrl(),
      output: {
        title: gateCheckName,
        summary: `Waiting for Codex review evidence for ${headSha.slice(0, 12)}.`,
      },
    }),
  });
  if (!Number.isInteger(check.id)) throw new Error('GitHub did not return a check run id');
  return check.id;
}

async function completeHeadCheckRun(
  owner: string,
  repo: string,
  checkRunId: number,
  result: CodexReviewGateResult,
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      conclusion: result.status === 'passed' ? 'success' : 'failure',
      details_url: checkDetailsUrl(),
      output: {
        title: gateCheckName,
        summary: result.summary,
      },
    }),
  });
}

async function main(): Promise<void> {
  const [owner, repo] = requiredEnvironment('GITHUB_REPOSITORY').split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be owner/repository');
  const pullNumber = parsePositiveInteger(requiredEnvironment('PULL_NUMBER'), 'PULL_NUMBER');
  if (pullNumber === 0) throw new Error('PULL_NUMBER must be positive');
  const waitSeconds = parsePositiveInteger(process.env.CODEX_REVIEW_WAIT_SECONDS ?? '0', 'CODEX_REVIEW_WAIT_SECONDS');
  const pollSeconds = parsePositiveInteger(process.env.CODEX_REVIEW_POLL_SECONDS ?? '30', 'CODEX_REVIEW_POLL_SECONDS');
  if (pollSeconds === 0) throw new Error('CODEX_REVIEW_POLL_SECONDS must be positive');

  const pull = await githubRequest<{ head: { sha: string } }>(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  const headSha = pull.head.sha.toLowerCase();
  if (String(process.env.CODEX_REVIEW_REQUEST_HEAD ?? '').trim().toLowerCase() === headSha) {
    await ensureHeadBoundCodexReviewRequest(owner, repo, pullNumber, headSha);
  }
  const checkRunId = await createHeadCheckRun(owner, repo, pullNumber, headSha);
  const deadlineMs = Date.now() + waitSeconds * 1_000;

  try {
    for (;;) {
      const [reviews, requestCommentReactions, reviewThreads] = await Promise.all([
        paginatedGitHubRequest<GitHubReview>(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`),
        fetchCurrentRequestCommentReactions(owner, repo, pullNumber, headSha),
        fetchReviewThreads(githubRequest, owner, repo, pullNumber),
      ]);
      const result = evaluateCodexReviewGate({
        headSha,
        reviews,
        reactions: requestCommentReactions,
        reviewThreads,
      });

      if (result.status === 'waiting' && Date.now() < deadlineMs) {
        console.log(`${result.summary} Polling for up to ${waitSeconds} seconds.`);
        await sleep(pollSeconds * 1_000);
        continue;
      }

      const terminal = result.status === 'waiting'
        ? {
            status: 'failed' as const,
            summary: `${result.summary} Timed out after ${waitSeconds} seconds; request or rerun Codex review for this head.`,
          }
        : result;
      await completeHeadCheckRun(owner, repo, checkRunId, terminal);
      console.log(terminal.summary);
      if (terminal.status !== 'passed') throw new Error(terminal.summary);
      return;
    }
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'Codex review gate failed unexpectedly.';
    await completeHeadCheckRun(owner, repo, checkRunId, { status: 'failed', summary }).catch(() => undefined);
    throw error;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
