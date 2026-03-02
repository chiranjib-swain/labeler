import * as yaml from 'js-yaml';
import * as core from '@actions/core';
import * as api from '../src/api';
import {labeler} from '../src/labeler';
import * as github from '@actions/github';
import * as fs from 'fs';
import {checkMatchConfigs, labelHasChangedFilesRules} from '../src/labeler';
import {
  MatchConfig,
  toMatchConfig,
  getLabelConfigMapFromObject,
  parseChangedFilesThresholds,
  BaseMatchConfig
} from '../src/api/get-label-configs';

jest.mock('@actions/core');
jest.mock('../src/api');

beforeAll(() => {
  jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
    return jest.requireActual('@actions/core').getInput(name, options);
  });
});

const loadYaml = (filepath: string) => {
  const loadedFile = fs.readFileSync(filepath);
  const content = Buffer.from(loadedFile).toString();
  return yaml.load(content);
};

describe('getLabelConfigMapFromObject', () => {
  const yamlObject = loadYaml('__tests__/fixtures/all_options.yml');
  const expected = new Map<string, MatchConfig[]>();
  expected.set('label1', [
    {
      any: [
        {changedFiles: [{anyGlobToAnyFile: ['glob']}]},
        {baseBranch: undefined, headBranch: ['regexp']},
        {baseBranch: ['regexp'], headBranch: undefined}
      ]
    },
    {
      all: [
        {changedFiles: [{allGlobsToAllFiles: ['glob']}]},
        {baseBranch: undefined, headBranch: ['regexp']},
        {baseBranch: ['regexp'], headBranch: undefined}
      ]
    }
  ]);
  expected.set('label2', [
    {
      any: [
        {changedFiles: [{anyGlobToAnyFile: ['glob']}]},
        {baseBranch: undefined, headBranch: ['regexp']},
        {baseBranch: ['regexp'], headBranch: undefined}
      ]
    }
  ]);

  it('returns a MatchConfig', () => {
    const result = getLabelConfigMapFromObject(yamlObject);
    expect(result).toEqual(expected);
  });
});

describe('toMatchConfig', () => {
  describe('when all expected config options are present', () => {
    const config = {
      'changed-files': [{'any-glob-to-any-file': ['testing-files']}],
      'head-branch': ['testing-head'],
      'base-branch': ['testing-base']
    };
    const expected: BaseMatchConfig = {
      changedFiles: [{anyGlobToAnyFile: ['testing-files']}],
      headBranch: ['testing-head'],
      baseBranch: ['testing-base']
    };

    it('returns a MatchConfig object with all options', () => {
      const result = toMatchConfig(config);
      expect(result).toEqual(expected);
    });

    describe('and there are also unexpected options present', () => {
      config['test-test'] = 'testing';

      it('does not include the unexpected items in the returned MatchConfig object', () => {
        const result = toMatchConfig(config);
        expect(result).toEqual(expected);
      });
    });
  });
});

describe('checkMatchConfigs', () => {
  describe('when a single match config is provided', () => {
    const matchConfig: MatchConfig[] = [
      {any: [{changedFiles: [{anyGlobToAnyFile: ['*.txt']}]}]}
    ];

    it('returns true when our pattern does match changed files', () => {
      const changedFiles = ['foo.txt', 'bar.txt'];
      const result = checkMatchConfigs(changedFiles, matchConfig, false);

      expect(result).toBeTruthy();
    });

    it('returns false when our pattern does not match changed files', () => {
      const changedFiles = ['foo.docx'];
      const result = checkMatchConfigs(changedFiles, matchConfig, false);

      expect(result).toBeFalsy();
    });

    it('returns true when either the branch or changed files patter matches', () => {
      const matchConfig: MatchConfig[] = [
        {
          any: [
            {changedFiles: [{anyGlobToAnyFile: ['*.txt']}]},
            {headBranch: ['some-branch']}
          ]
        }
      ];
      const changedFiles = ['foo.txt', 'bar.txt'];

      const result = checkMatchConfigs(changedFiles, matchConfig, false);
      expect(result).toBe(true);
    });

    it('returns false for a file starting with dot if `dot` option is false', () => {
      const changedFiles = ['.foo.txt'];
      const result = checkMatchConfigs(changedFiles, matchConfig, false);

      expect(result).toBeFalsy();
    });

    it('returns true for a file starting with dot if `dot` option is true', () => {
      const changedFiles = ['.foo.txt'];
      const result = checkMatchConfigs(changedFiles, matchConfig, true);

      expect(result).toBeTruthy();
    });
  });

  describe('when multiple MatchConfigs are supplied', () => {
    const matchConfig: MatchConfig[] = [
      {any: [{changedFiles: [{anyGlobToAnyFile: ['*.txt']}]}]},
      {any: [{headBranch: ['some-branch']}]}
    ];
    const changedFiles = ['foo.txt', 'bar.md'];

    it('returns false when only one config matches', () => {
      const result = checkMatchConfigs(changedFiles, matchConfig, false);
      expect(result).toBe(false);
    });

    it('returns true when only both config matches', () => {
      const matchConfig: MatchConfig[] = [
        {any: [{changedFiles: [{anyGlobToAnyFile: ['*.txt']}]}]},
        {any: [{headBranch: ['head-branch']}]}
      ];
      const result = checkMatchConfigs(changedFiles, matchConfig, false);
      expect(result).toBe(true);
    });
  });
});

describe('labeler error handling', () => {
  const mockClient = {} as any;
  const mockPullRequest = {
    number: 123,
    data: {labels: []},
    changedFiles: []
  };

  beforeEach(() => {
    jest.resetAllMocks();

    (github.getOctokit as jest.Mock).mockReturnValue(mockClient);
    (api.getPullRequests as jest.Mock).mockReturnValue([
      {
        ...mockPullRequest,
        data: {labels: [{name: 'old-label'}]}
      }
    ]);

    (api.getLabelConfigs as jest.Mock).mockResolvedValue({
      labelMap: new Map([['new-label', ['dummy-config']]]),
      thresholds: {}
    });

    // Force match so "new-label" is always added
    jest.spyOn({checkMatchConfigs}, 'checkMatchConfigs').mockReturnValue(true);
  });

  it('throws a custom error for HttpError 403 with "unauthorized" message', async () => {
    (api.setLabels as jest.Mock).mockRejectedValue({
      name: 'HttpError',
      status: 403,
      message: 'Request failed with status code 403: Unauthorized'
    });

    await expect(labeler()).rejects.toThrow(
      /does not have permission to create labels/
    );
  });

  it('rethrows unexpected HttpError', async () => {
    const unexpectedError = {
      name: 'HttpError',
      status: 404,
      message: 'Not Found'
    };
    (api.setLabels as jest.Mock).mockRejectedValue(unexpectedError);

    // NOTE: In the current implementation, labeler rethrows the raw error object (not an Error instance).
    // `rejects.toThrow` only works with real Error objects, so here we must use `rejects.toEqual`.
    // If labeler is updated to always wrap errors in `Error`, this test can be changed to use `rejects.toThrow`.
    await expect(labeler()).rejects.toEqual(unexpectedError);
  });

  it('handles "Resource not accessible by integration" gracefully', async () => {
    const error = {
      name: 'HttpError',
      message: 'Resource not accessible by integration'
    };
    (api.setLabels as jest.Mock).mockRejectedValue(error);

    await labeler();

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("requires 'issues: write'"),
      expect.any(Object)
    );
    expect(core.setFailed).toHaveBeenCalledWith(error.message);
  });
});

describe('parseChangedFilesThresholds', () => {
  it('returns empty thresholds when configObject is empty', () => {
    expect(parseChangedFilesThresholds({})).toEqual({});
  });

  it('returns empty thresholds when configObject is null', () => {
    expect(parseChangedFilesThresholds(null)).toEqual({});
  });

  it('parses changed-files-max-files', () => {
    expect(
      parseChangedFilesThresholds({'changed-files-max-files': 50})
    ).toEqual({maxFiles: 50});
  });

  it('parses changed-files-labels-limit', () => {
    expect(
      parseChangedFilesThresholds({'changed-files-labels-limit': 10})
    ).toEqual({labelsLimit: 10});
  });

  it('parses both thresholds together', () => {
    expect(
      parseChangedFilesThresholds({
        'changed-files-max-files': 50,
        'changed-files-labels-limit': 10
      })
    ).toEqual({maxFiles: 50, labelsLimit: 10});
  });

  it('accepts zero as a valid value', () => {
    expect(
      parseChangedFilesThresholds({'changed-files-max-files': 0})
    ).toEqual({maxFiles: 0});
    expect(
      parseChangedFilesThresholds({'changed-files-labels-limit': 0})
    ).toEqual({labelsLimit: 0});
  });

  it('throws on negative changed-files-max-files', () => {
    expect(() =>
      parseChangedFilesThresholds({'changed-files-max-files': -1})
    ).toThrow(/non-negative integer/);
  });

  it('throws on negative changed-files-labels-limit', () => {
    expect(() =>
      parseChangedFilesThresholds({'changed-files-labels-limit': -1})
    ).toThrow(/non-negative integer/);
  });

  it('throws on non-integer changed-files-max-files', () => {
    expect(() =>
      parseChangedFilesThresholds({'changed-files-max-files': 1.5})
    ).toThrow(/non-negative integer/);
  });

  it('throws on string changed-files-labels-limit', () => {
    expect(() =>
      parseChangedFilesThresholds({'changed-files-labels-limit': 'ten'})
    ).toThrow(/non-negative integer/);
  });

  it('uses changed-files-limit as deprecated alias and warns', () => {
    const result = parseChangedFilesThresholds({'changed-files-limit': 5});
    expect(result).toEqual({labelsLimit: 5});
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('deprecated')
    );
  });

  it('prefers changed-files-labels-limit over deprecated changed-files-limit', () => {
    const result = parseChangedFilesThresholds({
      'changed-files-labels-limit': 10,
      'changed-files-limit': 5
    });
    expect(result).toEqual({labelsLimit: 10});
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('deprecated')
    );
  });
});

describe('labelHasChangedFilesRules', () => {
  it('returns true when a config has changedFiles rules', () => {
    const configs: MatchConfig[] = [
      {any: [{changedFiles: [{anyGlobToAnyFile: ['*.ts']}]}]}
    ];
    expect(labelHasChangedFilesRules(configs)).toBe(true);
  });

  it('returns false when configs only have branch rules', () => {
    const configs: MatchConfig[] = [
      {any: [{headBranch: ['feature/*']}]}
    ];
    expect(labelHasChangedFilesRules(configs)).toBe(false);
  });

  it('returns false for empty configs', () => {
    expect(labelHasChangedFilesRules([])).toBe(false);
  });

  it('returns true when changedFiles rules are in the all block', () => {
    const configs: MatchConfig[] = [
      {all: [{changedFiles: [{allGlobsToAllFiles: ['*.ts']}]}]}
    ];
    expect(labelHasChangedFilesRules(configs)).toBe(true);
  });
});
