import * as core from '@actions/core';
import * as github from '@actions/github';

export interface PrTitleMatchConfig {
  prTitle?: string[];
}

export function toPrTitleMatchConfig(config: any): PrTitleMatchConfig {
  if (!config['pr-title']) {
    return {};
  }

  const prTitleConfig = {
    prTitle: config['pr-title']
  };

  if (typeof prTitleConfig.prTitle === 'string') {
    prTitleConfig.prTitle = [prTitleConfig.prTitle];
  }

  return prTitleConfig;
}

export function getPrTitle(): string | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    return undefined;
  }

  return pullRequest.title;
}

export function checkAnyPrTitle(regexps: string[]): boolean {
  const prTitle = getPrTitle();
  if (!prTitle) {
    core.debug(`   no PR title`);
    return false;
  }

  core.debug(`   checking "pr-title" pattern against "${prTitle}"`);
  const matchers = regexps.map(regexp => new RegExp(regexp));
  for (const matcher of matchers) {
    if (matchPrTitlePattern(matcher, prTitle)) {
      core.debug(`   "pr-title" patterns matched against "${prTitle}"`);
      return true;
    }
  }

  core.debug(`   "pr-title" patterns did not match against "${prTitle}"`);
  return false;
}

export function checkAllPrTitle(regexps: string[]): boolean {
  const prTitle = getPrTitle();
  if (!prTitle) {
    core.debug(`   cannot fetch PR title from the pull request`);
    return false;
  }

  core.debug(`   checking "pr-title" pattern against "${prTitle}"`);
  const matchers = regexps.map(regexp => new RegExp(regexp));
  for (const matcher of matchers) {
    if (!matchPrTitlePattern(matcher, prTitle)) {
      core.debug(`   "pr-title" patterns did not match against "${prTitle}"`);
      return false;
    }
  }

  core.debug(`   "pr-title" patterns matched against "${prTitle}"`);
  return true;
}

function matchPrTitlePattern(matcher: RegExp, prTitle: string): boolean {
  core.debug(`    - ${matcher}`);
  if (matcher.test(prTitle)) {
    core.debug(`    "pr-title" pattern matched`);
    return true;
  }

  core.debug(`    ${matcher} did not match`);
  return false;
}
