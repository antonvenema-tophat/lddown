import chalk from "chalk";
import fs from "fs";
import path from "path";

import { program } from "commander";
import { stringify } from 'csv-stringify/sync';

program
  .name("lddown")
  .requiredOption("--api-key <APIKEY>", "LaunchDarkly API key.")
  .description("CLI to download LaunchDarkly flags.");

program.parse();

const options = program.opts();

const teams: { [tag: string]: string } = {
  "abci": "ABCI",
  "aktiv-platform": "Aktiv Platform",
  "aktiv-questions": "Aktiv Questions",
  "architecture": "Architecture",
  "authoring": "Authoring",
  "backend-platform": "Core Backend",
  "data-platform": "Data Platform",
  "frontend-platform": "Core Frontend",
  "learning-materials": "Learning Materials",
  "lecture-engagement": "Lecture Engagement",
  "marketing": "Marketing",
  "mobile": "Mobile",
  "questions-gradebook": "Questions & Gradebook",
};

const teamTags = new Set(Object.keys(teams));

const delay = (millis: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, millis);
  });
};

const deleteFlag = async (key: string) => {
  console.log(chalk.green(`Deleting '${key}'...`));
  const response = await fetch(`https://app.launchdarkly.com/api/v2/flags/default/${key}`, {
    method: "DELETE",
    headers: {
      Authorization: options.apiKey,
    },
  });
  if (response.status == 204) {
    console.log(chalk.green(`Deleted '${key}'.`));
  } else {
    const text = await response.text();
    console.error(chalk.red(`Error deleting '${key}': ${text}`));
  }
};

const getFlags = async (filter?: string) => {
  let offset = 0;
  const limit = 100;
  const flags = [];
  while (true) {
    console.log(chalk.green(`Fetching up to ${limit} flags starting at offset ${offset}...`));
    let url = `https://app.launchdarkly.com/api/v2/flags/default?limit=${limit}&offset=${offset}`;
    if (filter) url += `&filter=${encodeURIComponent(filter)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: options.apiKey,
      },
    });
    const json = await response.json();
    await delay(200);
    offset += json.items.length;
    flags.push(...json.items);
    if (offset >= json.totalCount) break;
  }
  return flags;
};

const getMembers = async () => {
  let offset = 0;
  const limit = 100;
  const members = [];
  while (true) {
    console.log(chalk.green(`Fetching up to ${limit} members starting at offset ${offset}...`));
    const response = await fetch(`https://app.launchdarkly.com/api/v2/members?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: options.apiKey,
      },
    });
    const json = await response.json();
    offset += json.items.length;
    members.push(...json.items);
    if (offset >= json.totalCount) break;
  }
  return members;
};

const groupFlagsByTeam = (flags: any[]) => {
  const groups: { [key: string]: string[] } = {};
  for (const flag of flags) {
    const key: string = flag.key;
    const tags: string[] = flag.tags;
    if (!tags) throw new Error(`${key} has no tags.`);

    let team = null;
    for (const tag of tags) {
      if (teamTags.has(tag)) {
        team = tag;
        break;
      }
    }

    if (team) {
      if (!groups[team]) groups[team] = [];
      groups[team].push(flag);
    } else {
      if (tags.length == 0) {
        console.error(chalk.red(`${key}`));
      } else {
        console.error(chalk.yellow(`${key} has no team tag. (${tags.join(", ")})`));
      }
    }
  }
  return groups;
};

const writeFlagsCSV = async (flags: any[], path: string) => {
  const csv = [[ "Maintainer", "Archived", "Deprecated", "Temporary", "Name", "Kind", "Key", "Created", "SDK", "Tags", "Description", ]];
  for (const flag of flags) {
    csv.push([
      flag._maintainer?.email ?? "?",
      flag.archived ? "Yes" : "No",
      flag.deprecated ? "Yes" : "No",
      flag.temporary ? "Yes" : "No",
      flag.name,
      flag.kind,
      flag.key,
      new Date(flag.creationDate).toISOString(),
      (flag.clientSideAvailability.usingEnvironmentId && flag.clientSideAvailability.usingMobileKey) ? "Both" :
        (flag.clientSideAvailability.usingEnvironmentId ? "Non-Mobile" : 
          (flag.clientSideAvailability.usingMobileKey ? "Mobile" : "Neither")
        ),
      flag.tags.join(" | "),
      flag.description,
    ]);
  }

  await fs.promises.writeFile(path, stringify(csv));
};

const writeJSON = async (data: any, path: string) => {
  await fs.promises.writeFile(path, JSON.stringify(data, null, 2));
};

const cleanup = async () => {
  const flags = await getFlags("state:archived");
  for (const flag of flags) {
    if (new Date(flag.archivedDate).getUTCFullYear() < 2025) {
      await deleteFlag(flag.key);
      await delay(2000);
    }
  }
};

(async () => {
  //await cleanup();

  const members = await getMembers();
  console.log(chalk.green(`Fetched ${members.length} members.`));
  
  const membersPathJson = path.join(process.cwd(), "members.json");
  await writeJSON(members, membersPathJson);
  console.log(chalk.green(`Wrote ${members.length} members to ${membersPathJson}.`));

  const flags = await getFlags();
  console.log(chalk.green(`Fetched ${flags.length} flags.`));

  const groups = groupFlagsByTeam(flags);
  for (const teamTag in teams) {
    console.log(`${teams[teamTag]}: ${groups[teamTag]?.length ?? 0}`);
  }

  const flagsPathJson = path.join(process.cwd(), "flags.json");
  await writeJSON(flags, flagsPathJson);
  console.log(chalk.green(`Wrote ${flags.length} flags to ${flagsPathJson}.`));

  const flagsPathCsv = path.join(process.cwd(), "flags.csv");
  await writeFlagsCSV(flags, flagsPathCsv);
  console.log(chalk.green(`Wrote ${flags.length} flags to ${flagsPathCsv}.`));
})();