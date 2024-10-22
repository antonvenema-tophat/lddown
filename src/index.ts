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

(async () => {
  let offset = 0;
  const limit = 100;
  const items = [];
  while (true) {
    console.log(chalk.green(`Fetching up to ${limit} flags starting at offset ${offset}...`));
    const response = await fetch(`https://app.launchdarkly.com/api/v2/flags/default?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: options.apiKey,
      },
    });
    const json = await response.json();
    offset += json.items.length;
    items.push(...json.items);
    if (offset >= json.totalCount) break;
  }

  console.log(chalk.green(`Fetched ${items.length} flags.`));

  const jsonFilePath = path.join(process.cwd(), "flags.json");
  await fs.promises.writeFile(jsonFilePath, JSON.stringify(items, null, 2));
  console.log(chalk.green(`Wrote ${items.length} flags to ${jsonFilePath}.`));

  const csv = [[ "Maintainer", "Archived", "Deprecated", "Temporary", "Name", "Kind", "Key", "Created", "SDK", "Tags", "Description", ]];
  for (const item of items) {
    csv.push([
      item._maintainer?.email ?? "?",
      item.archived ? "Yes" : "No",
      item.deprecated ? "Yes" : "No",
      item.temporary ? "Yes" : "No",
      item.name,
      item.kind,
      item.key,
      new Date(item.creationDate).toISOString(),
      (item.clientSideAvailability.usingEnvironmentId && item.clientSideAvailability.usingMobileKey) ? "Both" :
        (item.clientSideAvailability.usingEnvironmentId ? "Non-Mobile" : 
          (item.clientSideAvailability.usingMobileKey ? "Mobile" : "Neither")
        ),
      item.tags.join(" | "),
      item.description,
    ]);
  }

  const csvFilePath = path.join(process.cwd(), "flags.csv");
  await fs.promises.writeFile(csvFilePath, stringify(csv));
  console.log(chalk.green(`Wrote ${items.length} flags to ${csvFilePath}.`));
})();