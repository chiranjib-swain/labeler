// import * as github from '@actions/github';
import {Octokit} from '@octokit/core';
import {retry} from '@octokit/plugin-retry';
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods';
import {paginateRest} from '@octokit/plugin-paginate-rest';

// Create a custom Octokit class with the required plugins
const MyOctokit = Octokit.plugin(retry, restEndpointMethods, paginateRest);

// type MyOctokitInstance = InstanceType<typeof MyOctokit>;
export type ClientType = InstanceType<typeof MyOctokit>;
