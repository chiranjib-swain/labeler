import * as core from '@actions/core';
import {getPrNumbers} from './get-pr-numbers';

export const getInputs = () => ({
  token: core.getInput('repo-token'),
  configPath: core.getInput('configuration-path', {required: true}),
  syncLabels: core.getBooleanInput('sync-labels'),
  dot: core.getBooleanInput('dot'),
  prNumbers: getPrNumbers(),
  debugDelayBeforeFetch: parseInt(
    core.getInput('debug-delay-before-fetch-ms') || '0',
    10
  ),
  debugDelayBeforeSet: parseInt(
    core.getInput('debug-delay-before-set-ms') || '0',
    10
  ),
  debugDelayAfterSet: parseInt(
    core.getInput('debug-delay-after-set-ms') || '0',
    10
  )
});
