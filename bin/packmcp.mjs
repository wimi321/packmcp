#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

import { TASK_PRESETS } from "../src/data.js";
import {
  buildAnalysisReport,
  buildExportPayloads,
  buildPackSummary,
  parseManifest,
  recommendPack,
  analyzeTools
} from "../src/core.js";

function printHelp() {
  console.log(`PackMCP

Usage:
  packmcp analyze --input <file> [--task <text> | --preset <name>] [--profile <name>] [--risk <level>] [--format <json|markdown|allowlist>] [--output <file>]

Options:
  --input <file>     Path to a manifest JSON file
  --task <text>      Task description used to rank tools
  --preset <name>    Task preset: review, coding, release, browser
  --profile <name>   balanced, read-only, coding, release, browser
  --risk <level>     low, medium, high
  --format <type>    json, markdown, allowlist
  --output <file>    Write output to a file instead of stdout
  --help             Show this help text
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        index += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function emitOutput(content, outputPath) {
  if (typeof outputPath === "string" && outputPath.length > 0) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, content, "utf8");
    console.error(`Wrote output to ${outputPath}`);
    return;
  }
  console.log(content);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.help) {
    printHelp();
    return;
  }

  if (command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (!args.input) {
    console.error("Missing required --input <file> argument.");
    process.exitCode = 1;
    return;
  }

  const task = typeof args.task === "string"
    ? args.task
    : typeof args.preset === "string" && TASK_PRESETS[args.preset]
      ? TASK_PRESETS[args.preset]
      : TASK_PRESETS.review;
  const profile = typeof args.profile === "string" ? args.profile : "balanced";
  const risk = typeof args.risk === "string" ? args.risk : "medium";
  const format = typeof args.format === "string" ? args.format : "json";

  const input = await readFile(args.input, "utf8");
  const parsed = parseManifest(input);
  const analyzed = analyzeTools(parsed.tools, task, profile);
  const selectedIds = recommendPack(analyzed, profile, risk);

  if (format === "allowlist") {
    const exportsPayload = buildExportPayloads(parsed.server, analyzed, selectedIds);
    await emitOutput(exportsPayload.allowlist, args.output);
    return;
  }

  if (format === "markdown") {
    const exportsPayload = buildExportPayloads(parsed.server, analyzed, selectedIds);
    const summary = buildPackSummary(analyzed, selectedIds, profile, risk);
    await emitOutput(`# PackMCP report

- Server: ${parsed.server}
- Profile: ${profile}
- Risk budget: ${risk}
- Selected tools: ${summary.selectedCount}
- Token savings: ${summary.savings}%

${summary.recommendation}

${exportsPayload.markdown}`, args.output);
    return;
  }

  const report = buildAnalysisReport(parsed.server, parsed.tools, task, profile, risk, selectedIds);
  await emitOutput(JSON.stringify(report, null, 2), args.output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
