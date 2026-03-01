import {
  getPrTitle,
  checkAnyPrTitle,
  checkAllPrTitle,
  toPrTitleMatchConfig,
  PrTitleMatchConfig
} from '../src/prTitle';
import * as github from '@actions/github';

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('getPrTitle', () => {
  it('returns the PR title', () => {
    const result = getPrTitle();
    expect(result).toEqual('Test PR Title');
  });
});

describe('checkAllPrTitle', () => {
  beforeEach(() => {
    github.context.payload.pull_request!.title = 'feat: Add new feature';
  });

  describe('when a single pattern is provided', () => {
    describe('and the pattern matches the PR title', () => {
      it('returns true', () => {
        const result = checkAllPrTitle(['^feat:']);
        expect(result).toBe(true);
      });
    });

    describe('and the pattern does not match the PR title', () => {
      it('returns false', () => {
        const result = checkAllPrTitle(['^fix:']);
        expect(result).toBe(false);
      });
    });
  });

  describe('when multiple patterns are provided', () => {
    describe('and not all patterns matched', () => {
      it('returns false', () => {
        const result = checkAllPrTitle(['^feat:', '^fix:']);
        expect(result).toBe(false);
      });
    });

    describe('and all patterns match', () => {
      it('returns true', () => {
        const result = checkAllPrTitle(['^feat:', 'feature']);
        expect(result).toBe(true);
      });
    });

    describe('and no patterns match', () => {
      it('returns false', () => {
        const result = checkAllPrTitle(['^fix:', '^docs:']);
        expect(result).toBe(false);
      });
    });
  });
});

describe('checkAnyPrTitle', () => {
  beforeEach(() => {
    github.context.payload.pull_request!.title = 'fix: Bug fix for issue #123';
  });

  describe('when a single pattern is provided', () => {
    describe('and the pattern matches the PR title', () => {
      it('returns true', () => {
        const result = checkAnyPrTitle(['^fix:']);
        expect(result).toBe(true);
      });
    });

    describe('and the pattern does not match the PR title', () => {
      it('returns false', () => {
        const result = checkAnyPrTitle(['^feat:']);
        expect(result).toBe(false);
      });
    });
  });

  describe('when multiple patterns are provided', () => {
    describe('and at least one pattern matches', () => {
      it('returns true', () => {
        const result = checkAnyPrTitle(['^fix:', '^feat:']);
        expect(result).toBe(true);
      });
    });

    describe('and all patterns match', () => {
      it('returns true', () => {
        const result = checkAnyPrTitle(['^fix:', 'Bug']);
        expect(result).toBe(true);
      });
    });

    describe('and no patterns match', () => {
      it('returns false', () => {
        const result = checkAnyPrTitle(['^feat:', '^docs:']);
        expect(result).toBe(false);
      });
    });
  });
});

describe('toPrTitleMatchConfig', () => {
  describe('when there is no pr-title key in the config', () => {
    it('returns an empty object', () => {
      const result = toPrTitleMatchConfig({});
      expect(result).toEqual({});
    });
  });

  describe('when the config contains a pr-title option', () => {
    it('sets prTitle in the matchConfig', () => {
      const config = {'pr-title': ['^feat:', '^fix:']};
      const expected: PrTitleMatchConfig = {
        prTitle: ['^feat:', '^fix:']
      };
      const result = toPrTitleMatchConfig(config);
      expect(result).toEqual(expected);
    });

    describe('and the matching option is a string', () => {
      it('sets prTitle in the matchConfig', () => {
        const config = {'pr-title': '^feat:'};
        const expected: PrTitleMatchConfig = {
          prTitle: ['^feat:']
        };
        const result = toPrTitleMatchConfig(config);
        expect(result).toEqual(expected);
      });
    });
  });
});
