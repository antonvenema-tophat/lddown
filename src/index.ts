import chalk from "chalk";
import fs from "fs";
import path from "path";

import { program } from "commander";
import { stringify } from 'csv-stringify/sync';

program
  .name("lddown")
  .requiredOption("--apiKey <APIKEY>", "LaunchDarkly API key.")
  .description("CLI to download LaunchDarkly flags.");

program.parse();

const options = program.opts();

const teams: { [tag: string]: string } = {
  "abci": "ABCI",
  "architecture": "Architecture",
  "authoring": "Authoring",
  "backend-platform": "Backend Platform",
  "data-platform": "Data Platform",
  "frontend-platform": "Frontend Platform",
  "learning-materials": "Learning Materials",
  "lecture-engagement": "Lecture Engagement",
  "marketing": "Marketing",
  "mobile": "Mobile",
  "questions-gradebook": "Questions & Gradebook",
};

const teamTags = new Set(Object.keys(teams));

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

const writeCSV = async (flags: any[]) => {
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

  const csvFilePath = path.join(process.cwd(), "flags.csv");
  await fs.promises.writeFile(csvFilePath, stringify(csv));
  console.log(chalk.green(`Wrote ${flags.length} flags to ${csvFilePath}.`));
};

const writeJSON = async (flags: any[]) => {
  const jsonFilePath = path.join(process.cwd(), "flags.json");
  await fs.promises.writeFile(jsonFilePath, JSON.stringify(flags, null, 2));
  console.log(chalk.green(`Wrote ${flags.length} flags to ${jsonFilePath}.`));
};

(async () => {
  let offset = 0;
  const limit = 100;
  const flags = [];
  while (true) {
    console.log(chalk.green(`Fetching up to ${limit} flags starting at offset ${offset}...`));
    const response = await fetch(`https://app.launchdarkly.com/api/v2/flags/default?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: options.apiKey,
      },
    });
    const json = await response.json();
    offset += json.items.length;
    flags.push(...json.items);
    if (offset >= json.totalCount) break;
  }

  console.log(chalk.green(`Fetched ${flags.length} flags.`));

  const groups = groupFlagsByTeam(flags);
  for (const teamTag in teams) {
    console.log(`${teams[teamTag]}: ${groups[teamTag]?.length ?? 0}`);
  }

  await writeJSON(flags);
  await writeCSV(flags);
})();