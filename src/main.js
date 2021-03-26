const core = require('@actions/core');
const github = require('@actions/github');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const { queryIssues, formatTitle, doIssueComment } = require('./public');

const { dealStringToArr } = require('actions-util');

const { compare } = require('compare-similarity');

// ************************************************
const context = github.context;

async function run() {
  try {
    const { owner, repo } = context.repo;

    const FIXCOMMENT = `<!-- Created by actions-cool/issues-similarity-analysis. Do not remove. -->`;

    if (context.eventName == 'issues') {
      const { number, title } = context.payload.issue;

      const sinceDays = core.getInput('since-days');
      const since = dayjs.utc().subtract(sinceDays, 'day').format();

      let issues = await queryIssues(owner, repo, since);

      const filterThreshold = Number(core.getInput('filter-threshold'));

      if (isNaN(filterThreshold) || filterThreshold < 0 || filterThreshold > 1) {
        core.setFailed(
          `[Error] The input "filter-threshold" is ${filterThreshold}. Please keep in [0, 1].`,
        );
        return false;
      }

      const titleExcludes = core.getInput('title-excludes');
      const commentTitle = core.getInput('comment-title');
      const commentBody = core.getInput('comment-body');

      const formatT = formatTitle(dealStringToArr(titleExcludes), title);

      if (formatT.length == 0) {
        core.info(`[title: ${title}] exclude after empty!`);
        return false;
      }

      const result = [];
      issues.forEach(issue => {
        if (issue.pull_request === undefined && issue.number !== number) {
          const formatIssT = formatTitle(dealStringToArr(titleExcludes), issue.title);
          if (formatIssT.length > 0) {
            const similarity = compare(formatIssT, formatT);
            if (similarity >= filterThreshold) {
              result.push({
                number: issue.number,
                title: issue.title,
                similarity: similarity,
              });
            }
          }
        }
      });

      core.info(`[Action][filter-issues][length: ${result.length}]`);
      if (result.length > 0) {
        result.sort((a, b) => b.similarity - a.similarity);
        await doIssueComment(owner, repo, number, result, commentTitle, commentBody, FIXCOMMENT);
      }
    } else {
      core.setFailed(`This action only support on "issues"!`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
