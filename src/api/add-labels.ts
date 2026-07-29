import * as core from '@actions/core';
import * as github from '@actions/github';
import {ClientType} from './types.js';

const isServerError = (error: unknown): error is {status: number} =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof error.status === 'number' &&
  error.status >= 500 &&
  error.status < 600;

export const addLabels = async (
  client: ClientType,
  prNumber: number,
  labels: string[]
) => {
  const request = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber
  };

  try {
    await client.rest.issues.addLabels({
      ...request,
      labels,
      request: {retries: 0}
    });
    if (process.env.SIMULATE_5XX === 'true') {
      core.info(`[SIMULATE_5XX] REST POST succeeded — throwing fake 502 to trigger reconciliation`);
      throw Object.assign(new Error('Simulated Bad Gateway'), {status: 502});
    }
  } catch (error: unknown) {
    if (!isServerError(error)) {
      throw error;
    }

    core.info(`[reconcile] Server error caught (status: ${(error as any).status}) — starting paginated label verification for ${labels.length} labels`);
    const currentLabelNames = new Set<string>();
    let page = 1;
    try {
      while (true) {
        const perPage = process.env.SIMULATE_5XX === 'true' ? 10 : 100;
        const currentLabels = await client.rest.issues.listLabelsOnIssue({
          ...request,
          per_page: perPage,
          page,
          request: {retries: 0}
        });

        for (const label of currentLabels.data) {
          currentLabelNames.add(label.name.toLowerCase());
        }

        const hasNext = !!currentLabels.headers.link?.match(/;\s*rel="next"/);
        core.info(`[reconcile] Page ${page}: fetched ${currentLabels.data.length} labels (cumulative: ${currentLabelNames.size}) hasNext=${hasNext}`);

        if (labels.every(label => currentLabelNames.has(label.toLowerCase()))) {
          core.info(`[reconcile] All ${labels.length} requested labels confirmed present — returning success`);
          return;
        }

        if (!hasNext) {
          core.info(`[reconcile] No more pages — ${labels.length - [...labels].filter(l => currentLabelNames.has(l.toLowerCase())).length} label(s) still missing — throwing original error`);
          break;
        }

        page++;
      }
    } catch {
      throw error;
    }

    throw error;
  }
};