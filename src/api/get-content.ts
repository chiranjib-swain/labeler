import * as github from '@actions/github';
// import {ClientType} from './types';
import {Octokit} from '@octokit/core';
import {retry} from '@octokit/plugin-retry';
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods';
import {paginateRest} from '@octokit/plugin-paginate-rest';

// Create a custom Octokit class with the required plugins
const MyOctokit = Octokit.plugin(retry, restEndpointMethods, paginateRest);
type MyOctokitInstance = InstanceType<typeof MyOctokit>;

export const getContent = async (
  client: MyOctokitInstance,
  repoPath: string
): Promise<string> => {
  const response: any = await client.rest.repos.getContent({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha
  });

  return Buffer.from(response.data.content, response.data.encoding).toString();
};
