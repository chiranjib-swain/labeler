import * as core from '@actions/core';
import * as github from '@actions/github';
import * as pluginRetry from '@octokit/plugin-retry';
import * as api from './api/index.js';
import {getInputs} from './get-inputs/index.js';

import {
  BaseMatchConfig,
  MatchConfig,
  configUsesChangedFiles
} from './api/get-label-configs.js';

import {checkAllChangedFiles, checkAnyChangedFiles} from './changedFiles.js';

import {checkAnyBranch, checkAllBranch} from './branch.js';

type ClientType = ReturnType<typeof github.getOctokit>;

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

  const client: ClientType = github.getOctokit(token, {}, pluginRetry.retry);

  const pullRequests = api.getPullRequests(client, prNumbers);

  for await (const pullRequest of pullRequests) {
    const {labelConfigs, changedFilesLimit, maxFilesChanged} =
      await api.getLabelConfigs(client, configPath);

    // Check if total changed files exceeds the max-files-changed threshold
    const skipChangedFilesLabeling =
      maxFilesChanged !== undefined &&
      pullRequest.changedFiles.length > maxFilesChanged;

    if (skipChangedFilesLabeling) {
      core.info(
        `Total changed files (${pullRequest.changedFiles.length}) exceeds max-files-changed (${maxFilesChanged}), skipping file-based labeling`
      );
    }

    const preexistingLabels = pullRequest.data.labels.map(l => l.name);
    const allLabels: Set<string> = new Set<string>(preexistingLabels);

    // Track labels that would be added based on changed-files patterns
    const changedFilesLabels: Set<string> = new Set<string>();

    for (const [label, configs] of labelConfigs.entries()) {
      core.debug(`processing ${label}`);

      // If this config uses changed-files and we're skipping file-based labeling,
      // don't evaluate it at all (skip add/remove) to preserve preexisting labels
      const usesChangedFiles = configUsesChangedFiles(configs);
      if (skipChangedFilesLabeling && usesChangedFiles) {
        core.debug(
          `skipping ${label} (uses changed-files and max-files-changed exceeded)`
        );
        continue;
      }

      if (checkMatchConfigs(pullRequest.changedFiles, configs, dot)) {
        allLabels.add(label);
        // Track if this label uses changed-files patterns
        if (usesChangedFiles) {
          changedFilesLabels.add(label);
        }
      } else if (syncLabels) {
        allLabels.delete(label);
      }
    }

    // Check if changed-files labels should be skipped due to labels limit
    const newChangedFilesLabels = [...changedFilesLabels].filter(
      l => !preexistingLabels.includes(l)
    );

    if (
      changedFilesLimit !== undefined &&
      newChangedFilesLabels.length > changedFilesLimit
    ) {
      core.info(
        `Changed-files labels (${newChangedFilesLabels.length}) exceed limit (${changedFilesLimit}), skipping: ${newChangedFilesLabels.join(', ')}`
      );
      // Remove all new changed-files labels
      for (const label of newChangedFilesLabels) {
        allLabels.delete(label);
      }
    }

    // TEMP: hardcoded 100 labels for max-labels branch testing
    const hardcodedTestLabels = [
      'label-1', 'label-2', 'label-3', 'label-4', 'label-5',
      'label-6', 'label-7', 'label-8', 'label-9', 'label-10',
      'label-11', 'label-12', 'label-13', 'label-14', 'label-15',
      'label-16', 'label-17', 'label-18', 'label-19', 'label-20',
      'label-21', 'label-22', 'label-23', 'label-24', 'label-25',
      'label-26', 'label-27', 'label-28', 'label-29', 'label-30',
      'label-31', 'label-32', 'label-33', 'label-34', 'label-35',
      'label-36', 'label-37', 'label-38', 'label-39', 'label-40',
      'label-41', 'label-42', 'label-43', 'label-44', 'label-45',
      'label-46', 'label-47', 'label-48', 'label-49', 'label-50',
      'label-51', 'label-52', 'label-53', 'label-54', 'label-55',
      'label-56', 'label-57', 'label-58', 'label-59', 'label-60',
      'label-61', 'label-62', 'label-63', 'label-64', 'label-65',
      'label-66', 'label-67', 'label-68', 'label-69', 'label-70',
      'label-71', 'label-72', 'label-73', 'label-74', 'label-75',
      'label-76', 'label-77', 'label-78', 'label-79', 'label-80',
      'label-81', 'label-82', 'label-83', 'label-84', 'label-85',
      'label-86', 'label-87', 'label-88', 'label-89', 'label-90',
      'label-91', 'label-92', 'label-93', 'label-94', 'label-95',
      'label-96', 'label-97', 'label-98', 'label-99', 'label-100'
    ];
    for (const l of hardcodedTestLabels) allLabels.add(l);
    // END TEMP

    const labelsToApply = [...allLabels].slice(0, GITHUB_MAX_LABELS);
    const excessLabels = [...allLabels].slice(GITHUB_MAX_LABELS);

    const finalLabels = labelsToApply;
    const newLabels = labelsToApply.filter(
      label => !preexistingLabels.includes(label)
    );
    const staleLabels = pullRequest.data.labels.filter(
      label => labelConfigs.has(label.name) && !allLabels.has(label.name)
    );

    core.info(`[DEBUG] PR #${pullRequest.number} — preexistingLabels (${preexistingLabels.length}): ${preexistingLabels.join(', ')}`);
    core.info(`[DEBUG] allLabels total: ${allLabels.size}`);
    core.info(`[DEBUG] labelsToApply (${labelsToApply.length}): ${labelsToApply.join(', ')}`);
    core.info(`[DEBUG] excessLabels (${excessLabels.length}): ${excessLabels.join(', ')}`);
    core.info(`[DEBUG] newLabels to add (${newLabels.length}): ${newLabels.join(', ')}`);
    core.info(`[DEBUG] staleLabels to remove (${staleLabels.length}): ${staleLabels.map(l => l.name).join(', ')}`);

    try {
      if (staleLabels.length) {
        const labelableId = pullRequest.data.node_id;
        const missingNodeId = staleLabels.find(label => !label.node_id);
        if (!labelableId || missingNodeId) {
          throw new Error(
            `Failed to resolve node IDs while removing configured labels from PR #${pullRequest.number}`
          );
        }

        core.info(`[DEBUG] Calling removeLabels for ${staleLabels.length} labels, labelableId: ${labelableId}`);
        try {
          await api.removeLabels(
            client,
            labelableId,
            staleLabels.map(label => label.node_id)
          );
          core.info(`[DEBUG] removeLabels succeeded`);
        } catch (error: any) {
          core.info(`[DEBUG] removeLabels failed — status: ${error.status}, message: ${error.message}`);
          throw new Error(
            `Failed to remove configured labels '${staleLabels.map(label => label.name).join("', '")}' from PR #${pullRequest.number}`,
            {cause: error}
          );
        }
      }

      if (newLabels.length) {
        core.info(`[DEBUG] Calling addLabels with ${newLabels.length} labels`);
        await api.addLabels(client, pullRequest.number, newLabels);
        core.info(`[DEBUG] addLabels succeeded`);
      } else {
        core.info(`[DEBUG] No new labels to add`);
      }
    } catch (error: any) {
      const apiError = error.cause ?? error;
      core.info(`[DEBUG] Caught error — name: ${apiError.name}, status: ${apiError.status}, message: ${apiError.message}`);
      core.info(`[DEBUG] Full error: ${JSON.stringify(apiError, Object.getOwnPropertyNames(apiError))}`);
      if (
        apiError.name === 'HttpError' &&
        apiError.status === 403 &&
        apiError.message.toLowerCase().includes('unauthorized')
      ) {
        throw new Error(
          `Failed to update labels for PR #${pullRequest.number}. The workflow does not have permission to create labels. ` +
            `Ensure the 'issues: write' permission is granted in the workflow file or manually create the missing labels in the repository before running the action.`,
          {cause: error}
        );
      } else if (
        apiError.name !== 'HttpError' ||
        apiError.message !== 'Resource not accessible by integration'
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

      core.setFailed(apiError.message);

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
