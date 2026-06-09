import * as core from '@actions/core';
import * as github from '@actions/github';

const getPrNumberFromContext = () =>
  github.context.payload.pull_request?.number;

export const sanitizeForWarning = (value: string): string => {
  return value.replace(
    /[\x00-\x1F\x7F-\x9F]/g,
    c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`
  );
};

export const getPrNumbers = (): number[] => {
  const prInput = core.getMultilineInput('pr-number');

  if (!prInput?.length) {
    return [getPrNumberFromContext()].filter(Boolean) as number[];
  }

  const result: number[] = [];

  for (const line of prInput) {
    const prNumber = parseInt(line, 10);

    if (isNaN(prNumber) || prNumber <= 0) {
      core.warning(
        `'${sanitizeForWarning(line)}' is not a valid pull request number`
      );
      continue;
    }

    result.push(prNumber);
  }

  return result;
};
