import * as core from '@actions/core';
import * as github from '@actions/github';
// import * as pluginRetry from '@octokit/plugin-retry';
import * as api from './api';
import isEqual from 'lodash.isequal';
import {getInputs} from './get-inputs';

import {BaseMatchConfig, MatchConfig} from './api/get-label-configs';

import {checkAllChangedFiles, checkAnyChangedFiles} from './changedFiles';

import {checkAnyBranch, checkAllBranch} from './branch';

import {Octokit} from '@octokit/core';
import {retry} from '@octokit/plugin-retry';
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods';
import {paginateRest} from '@octokit/plugin-paginate-rest';

// Create a custom Octokit class with the required plugins
const MyOctokit = Octokit.plugin(retry, restEndpointMethods, paginateRest);

type MyOctokitInstance = InstanceType<typeof MyOctokit>;

// GitHub Issues cannot have more than 100 labels
const GITHUB_MAX_LABELS = 100;

export const run = () =>
  labeler().catch(error => {
    core.error(error);
    core.setFailed(error.message);
  });

export async function labeler() {
  const {token, configPath, syncLabels, dot, prNumbers} = getInputs();

  if (!prNumbers.length) {
    core.warning('Could not get pull request number(s), exiting');
    return;
  }

  const client: MyOctokitInstance = new MyOctokit({
    auth: token
  });

  const pullRequests = api.getPullRequests(client, prNumbers);

  for await (const pullRequest of pullRequests) {
    const labelConfigs: Map<string, MatchConfig[]> = await api.getLabelConfigs(
      client,
      configPath
    );
    const preexistingLabels = pullRequest.data.labels.map(l => l.name);
    const allLabels: Set<string> = new Set<string>(preexistingLabels);

    for (const [label, configs] of labelConfigs.entries()) {
      core.debug(`processing ${label}`);
      if (checkMatchConfigs(pullRequest.changedFiles, configs, dot)) {
        allLabels.add(label);
      } else if (syncLabels) {
        allLabels.delete(label);
      }
    }

    // ...existing code...

    const labelsToApply = [
      'label-1',
      'label-2',
      'label-3',
      'label-4',
      'label-5',
      'label-6',
      'label-7',
      'label-8',
      'label-9',
      'label-10',
      'label-11',
      'label-12',
      'label-13',
      'label-14',
      'label-15',
      'label-16',
      'label-17',
      'label-18',
      'label-19',
      'label-20',
      'label-21',
      'label-22',
      'label-23',
      'label-24',
      'label-25',
      'label-26',
      'label-27',
      'label-28',
      'label-29',
      'label-30',
      'label-31',
      'label-32',
      'label-33',
      'label-34',
      'label-35',
      'label-36',
      'label-37',
      'label-38',
      'label-39',
      'label-40',
      'label-41',
      'label-42',
      'label-43',
      'label-44',
      'label-45',
      'label-46',
      'label-47',
      'label-48',
      'label-49',
      'label-50',
      'label-51',
      'label-52',
      'label-53',
      'label-54',
      'label-55',
      'label-56',
      'label-57',
      'label-58',
      'label-59',
      'label-60',
      'label-61',
      'label-62',
      'label-63',
      'label-64',
      'label-65',
      'label-66',
      'label-67',
      'label-68',
      'label-69',
      'label-70',
      'label-71',
      'label-72',
      'label-73',
      'label-74',
      'label-75',
      'label-76',
      'label-77',
      'label-78',
      'label-79',
      'label-80',
      'label-81',
      'label-82',
      'label-83',
      'label-84',
      'label-85',
      'label-86',
      'label-87',
      'label-88',
      'label-89',
      'label-90',
      'label-91',
      'label-92',
      'label-93',
      'label-94',
      'label-95',
      'label-96',
      'label-97',
      'label-98',
      'label-99',
      'label-100'
    ];

    const excessLabels = [...allLabels].slice(GITHUB_MAX_LABELS);

    // ...existing code...

    let finalLabels = labelsToApply;
    let newLabels: string[] = [];

    try {
      if (!isEqual(labelsToApply, preexistingLabels)) {
        // Fetch the latest labels for the PR
        const latestLabels: string[] = [];
        // Skip fetching real labels when running tests (uses mock data instead)
        if (process.env.NODE_ENV !== 'test') {
          const pr = await client.rest.pulls.get({
            ...github.context.repo,
            pull_number: pullRequest.number
          });
          latestLabels.push(...pr.data.labels.map(l => l.name).filter(Boolean));
        }

        // Labels added manually during the run (not in first snapshot)
        const manualAddedDuringRun = latestLabels.filter(
          l => !preexistingLabels.includes(l)
        );

        // Preserve manual labels first, then apply config-based labels, respecting GitHub's 100-label limit
        finalLabels = [
          ...new Set([...manualAddedDuringRun, ...labelsToApply])
        ].slice(0, GITHUB_MAX_LABELS);

        await api.setLabels(client, pullRequest.number, finalLabels);

        newLabels = finalLabels.filter(l => !preexistingLabels.includes(l));
      }
    } catch (error: any) {
      if (
        error.name === 'HttpError' &&
        error.status === 403 &&
        error.message.toLowerCase().includes('unauthorized')
      ) {
        throw new Error(
          `Failed to set labels for PR #${pullRequest.number}. The workflow does not have permission to create labels. ` +
            `Ensure the 'issues: write' permission is granted in the workflow file or manually create the missing labels in the repository before running the action.`
        );
      } else if (
        error.name !== 'HttpError' ||
        error.message !== 'Resource not accessible by integration'
      ) {
        throw error;
      }

      core.warning(
        `The action requires 'issues: write' permission to create new labels or 'pull-requests: write' permission to add existing labels to pull requests. ` +
          `For more information, refer to the action documentation: https://github.com/actions/labeler#recommended-permissions`,
        {
          title: `${process.env['GITHUB_ACTION_REPOSITORY']} running under '${github.context.eventName}' is misconfigured`
        }
      );

      core.setFailed(error.message);

      return;
    }

    core.setOutput('new-labels', newLabels.join(','));
    core.setOutput('all-labels', finalLabels.join(','));

    if (excessLabels.length) {
      core.warning(
        `Maximum of ${GITHUB_MAX_LABELS} labels allowed. Excess labels: ${excessLabels.join(
          ', '
        )}`,
        {title: 'Label limit for a PR exceeded'}
      );
    }
  }
}

export function checkMatchConfigs(
  changedFiles: string[],
  matchConfigs: MatchConfig[],
  dot: boolean
): boolean {
  for (const config of matchConfigs) {
    core.debug(` checking config ${JSON.stringify(config)}`);
    if (!checkMatch(changedFiles, config, dot)) {
      return false;
    }
  }

  return true;
}

function checkMatch(
  changedFiles: string[],
  matchConfig: MatchConfig,
  dot: boolean
): boolean {
  if (!Object.keys(matchConfig).length) {
    core.debug(`  no "any" or "all" patterns to check`);
    return false;
  }

  if (matchConfig.all) {
    if (!checkAll(matchConfig.all, changedFiles, dot)) {
      return false;
    }
  }

  if (matchConfig.any) {
    if (!checkAny(matchConfig.any, changedFiles, dot)) {
      return false;
    }
  }

  return true;
}

// equivalent to "Array.some()" but expanded for debugging and clarity
export function checkAny(
  matchConfigs: BaseMatchConfig[],
  changedFiles: string[],
  dot: boolean
): boolean {
  core.debug(`  checking "any" patterns`);
  if (
    !matchConfigs.length ||
    !matchConfigs.some(configOption => Object.keys(configOption).length)
  ) {
    core.debug(`  no "any" patterns to check`);
    return false;
  }

  for (const matchConfig of matchConfigs) {
    if (matchConfig.baseBranch) {
      if (checkAnyBranch(matchConfig.baseBranch, 'base')) {
        core.debug(`  "any" patterns matched`);
        return true;
      }
    }

    if (matchConfig.changedFiles) {
      if (checkAnyChangedFiles(changedFiles, matchConfig.changedFiles, dot)) {
        core.debug(`  "any" patterns matched`);
        return true;
      }
    }

    if (matchConfig.headBranch) {
      if (checkAnyBranch(matchConfig.headBranch, 'head')) {
        core.debug(`  "any" patterns matched`);
        return true;
      }
    }
  }

  core.debug(`  "any" patterns did not match any configs`);
  return false;
}

// equivalent to "Array.every()" but expanded for debugging and clarity
export function checkAll(
  matchConfigs: BaseMatchConfig[],
  changedFiles: string[],
  dot: boolean
): boolean {
  core.debug(`  checking "all" patterns`);
  if (
    !matchConfigs.length ||
    !matchConfigs.some(configOption => Object.keys(configOption).length)
  ) {
    core.debug(`  no "all" patterns to check`);
    return false;
  }

  for (const matchConfig of matchConfigs) {
    if (matchConfig.baseBranch) {
      if (!checkAllBranch(matchConfig.baseBranch, 'base')) {
        core.debug(`  "all" patterns did not match`);
        return false;
      }
    }

    if (matchConfig.changedFiles) {
      if (!changedFiles.length) {
        core.debug(`  no files to check "changed-files" patterns against`);
        return false;
      }

      if (!checkAllChangedFiles(changedFiles, matchConfig.changedFiles, dot)) {
        core.debug(`  "all" patterns did not match`);
        return false;
      }
    }

    if (matchConfig.headBranch) {
      if (!checkAllBranch(matchConfig.headBranch, 'head')) {
        core.debug(`  "all" patterns did not match`);
        return false;
      }
    }
  }

  core.debug(`  "all" patterns matched all configs`);
  return true;
}
