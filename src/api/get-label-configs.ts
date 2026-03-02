import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import fs from 'fs';
import {ClientType} from './types';
import {getContent} from './get-content';

import {
  ChangedFilesMatchConfig,
  toChangedFilesMatchConfig
} from '../changedFiles';

import {toBranchMatchConfig, BranchMatchConfig} from '../branch';

export interface MatchConfig {
  all?: BaseMatchConfig[];
  any?: BaseMatchConfig[];
}

export type BaseMatchConfig = BranchMatchConfig & ChangedFilesMatchConfig;

const ALLOWED_CONFIG_KEYS = ['changed-files', 'head-branch', 'base-branch'];

export const THRESHOLD_CONFIG_KEYS = [
  'changed-files-max-files',
  'changed-files-labels-limit',
  'changed-files-limit'
] as const;

export interface ChangedFilesThresholds {
  maxFiles?: number;
  labelsLimit?: number;
}

export interface LabelConfigsResult {
  labelMap: Map<string, MatchConfig[]>;
  thresholds: ChangedFilesThresholds;
}

function parseThresholdValue(key: string, value: any): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(
      `Config option '${key}' must be a non-negative integer, got: ${JSON.stringify(value)}`
    );
  }
  if (value < 0) {
    throw new Error(
      `Config option '${key}' must be a non-negative integer, got: ${value}`
    );
  }
  return value;
}

export function parseChangedFilesThresholds(
  configObject: any
): ChangedFilesThresholds {
  if (!configObject || typeof configObject !== 'object') {
    return {};
  }

  const thresholds: ChangedFilesThresholds = {};

  if ('changed-files-max-files' in configObject) {
    thresholds.maxFiles = parseThresholdValue(
      'changed-files-max-files',
      configObject['changed-files-max-files']
    );
  }

  const hasNewLimitKey = 'changed-files-labels-limit' in configObject;
  if (hasNewLimitKey) {
    thresholds.labelsLimit = parseThresholdValue(
      'changed-files-labels-limit',
      configObject['changed-files-labels-limit']
    );
  }

  if ('changed-files-limit' in configObject) {
    core.warning(
      '`changed-files-limit` is deprecated; use `changed-files-labels-limit` instead.'
    );
    if (!hasNewLimitKey) {
      thresholds.labelsLimit = parseThresholdValue(
        'changed-files-limit',
        configObject['changed-files-limit']
      );
    }
  }

  return thresholds;
}

export const getLabelConfigs = (
  client: ClientType,
  configurationPath: string
): Promise<LabelConfigsResult> =>
  Promise.resolve()
    .then(() => {
      if (!fs.existsSync(configurationPath)) {
        core.info(
          `The configuration file (path: ${configurationPath}) was not found locally, fetching via the api`
        );

        return getContent(client, configurationPath);
      }

      core.info(
        `The configuration file (path: ${configurationPath}) was found locally, reading from the file`
      );

      return fs.readFileSync(configurationPath, {
        encoding: 'utf8'
      });
    })
    .catch(error => {
      if (error.name == 'HttpError' || error.name == 'NotFound') {
        core.warning(
          `The config file was not found at ${configurationPath}. Make sure it exists and that this action has the correct access rights.`
        );
      }
      return Promise.reject(error);
    })
    .then(configuration => {
      // loads (hopefully) a `{[label:string]: MatchConfig[]}`, but is `any`:
      const configObject: any = yaml.load(configuration);

      // transform `any` => `Map<string,MatchConfig[]>` or throw if yaml is malformed:
      const labelMap = getLabelConfigMapFromObject(configObject);
      const thresholds = parseChangedFilesThresholds(configObject);
      return {labelMap, thresholds};
    });

export function getLabelConfigMapFromObject(
  configObject: any
): Map<string, MatchConfig[]> {
  const labelMap: Map<string, MatchConfig[]> = new Map();
  for (const label in configObject) {
    // Skip threshold config keys — they are global options, not labels
    if (THRESHOLD_CONFIG_KEYS.includes(label as (typeof THRESHOLD_CONFIG_KEYS)[number])) {
      continue;
    }
    const configOptions = configObject[label];
    if (
      !Array.isArray(configOptions) ||
      !configOptions.every(opts => typeof opts === 'object')
    ) {
      throw Error(
        `found unexpected type for label '${label}' (should be array of config options)`
      );
    }
    const matchConfigs = configOptions.reduce<MatchConfig[]>(
      (updatedConfig, configValue) => {
        if (!configValue) {
          return updatedConfig;
        }

        Object.entries(configValue).forEach(([key, value]) => {
          // If the top level `any` or `all` keys are provided then set them, and convert their values to
          // our config objects.
          if (key === 'any' || key === 'all') {
            if (Array.isArray(value)) {
              const newConfigs = value.map(toMatchConfig);
              updatedConfig.push({[key]: newConfigs});
            }
          } else if (ALLOWED_CONFIG_KEYS.includes(key)) {
            const newMatchConfig = toMatchConfig({[key]: value});
            // Find or set the `any` key so that we can add these properties to that rule,
            // Or create a new `any` key and add that to our array of configs.
            const indexOfAny = updatedConfig.findIndex(mc => !!mc['any']);
            if (indexOfAny >= 0) {
              updatedConfig[indexOfAny].any?.push(newMatchConfig);
            } else {
              updatedConfig.push({any: [newMatchConfig]});
            }
          } else {
            // Log the key that we don't know what to do with.
            core.info(`An unknown config option was under ${label}: ${key}`);
          }
        });

        return updatedConfig;
      },
      []
    );

    if (matchConfigs.length) {
      labelMap.set(label, matchConfigs);
    }
  }

  return labelMap;
}

export function toMatchConfig(config: any): BaseMatchConfig {
  const changedFilesConfig = toChangedFilesMatchConfig(config);
  const branchConfig = toBranchMatchConfig(config);

  return {
    ...changedFilesConfig,
    ...branchConfig
  };
}
