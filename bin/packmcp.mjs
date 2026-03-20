#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

import { TASK_PRESETS } from "../src/data.js";
import {
  applyPackSelection,
  buildAnalysisReport,
  buildComparisonReport,
  buildExportPayloads,
  buildPackSummary,
  parsePackSelection,
  parseManifest,
  recommendPack,
  analyzeTools
} from "../src/core.js";
import { maybeWriteInspectorPayload, runInspectorToolsList } from "../src/inspector.js";

function printHelp() {
  console.log(`PackMCP

Usage:
  packmcp analyze --input <file> [--task <text> | --preset <name>] [--profile <name>] [--risk <level>] [--format <json|markdown|allowlist|pack>] [--pack <file>] [--strict] [--output <file>]
  packmcp compare --left <file> --right <file> [--task <text> | --preset <name>] [--profile <name>] [--risk <level>] [--format <json|markdown>] [--output <file>]
  packmcp inspect --config <mcp.json> --server <name> [--task <text> | --preset <name>] [--profile <name>] [--risk <level>] [--format <json|markdown|allowlist|pack>] [--pack <file>] [--strict] [--output <file>] [--manifest-output <file>] [--timeout <ms>]

Options:
  --input <file>     Path to a manifest JSON file
  --task <text>      Task description used to rank tools
  --preset <name>    Task preset: review, coding, release, browser
  --profile <name>   balanced, read-only, coding, release, browser
  --risk <level>     low, medium, high
  --format <type>    json, markdown, allowlist, pack
  --pack <file>      Reapply a saved PackMCP pack or allowlist to the current manifest
  --strict           Exit non-zero if a saved pack references missing tool names
  --output <file>    Write output to a file instead of stdout
  --config <file>    MCP config file for Inspector-based analysis
  --server <name>    Server name inside the MCP config file
  --manifest-output <file>  Save the raw Inspector tools/list payload to a file
  --timeout <ms>     Inspector timeout in milliseconds (0 disables timeout)
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

async function resolveSelection(args, analyzed) {
  const recommendedIds = recommendPack(analyzed, args.profileKey, args.riskBudgetKey);

  if (!args.pack) {
    return {
      recommendedIds,
      selectedIds: recommendedIds,
      selectionContext: undefined
    };
  }

  const savedPackInput = await readFile(args.pack, "utf8");
  const parsedPack = parsePackSelection(savedPackInput);
  const applied = applyPackSelection(analyzed, parsedPack, recommendedIds);

  return {
    recommendedIds,
    selectedIds: applied.selectedIds,
    selectionContext: applied.selectionContext
  };
}

function maybeApplyStrictMode(args, selectionContext) {
  if (!args.strict || !selectionContext || selectionContext.source !== "pack") {
    return;
  }

  if (selectionContext.missingNames.length > 0) {
    console.error(
      `Strict mode failed: ${selectionContext.missingNames.length} saved tool names are missing: ${selectionContext.missingNames.join(", ")}`
    );
    process.exitCode = 1;
  }
}

function renderSelectionLines(selectionContext) {
  if (!selectionContext || selectionContext.source !== "pack") {
    return "";
  }

  const missing = selectionContext.missingNames.length > 0
    ? selectionContext.missingNames.join(", ")
    : "None";

  return [
    `- Selection source: saved ${selectionContext.format}`,
    `- Pack replay: ${selectionContext.matchedToolNameCount}/${selectionContext.requestedToolNameCount} requested names matched`,
    `- Missing tool names: ${missing}`
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.help) {
    printHelp();
    return;
  }

  if (command !== "analyze" && command !== "compare" && command !== "inspect") {
    console.error(`Unknown command: ${command}`);
    printHelp();
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
  const selectionArgs = {
    pack: typeof args.pack === "string" ? args.pack : undefined,
    strict: Boolean(args.strict),
    profileKey: profile,
    riskBudgetKey: risk
  };

  if (args.strict && !args.pack) {
    console.error("The --strict flag requires --pack <file>.");
    process.exitCode = 1;
    return;
  }

  if (command === "inspect") {
    if (!args.config || !args.server) {
      console.error("Missing required --config <file> or --server <name> argument.");
      process.exitCode = 1;
      return;
    }

    const inspectorPayload = await runInspectorToolsList({
      configPath: args.config,
      serverName: args.server,
      cwd: process.cwd(),
      timeoutMs: args.timeout
    });
    await maybeWriteInspectorPayload(inspectorPayload, args["manifest-output"]);
    if (typeof args["manifest-output"] === "string" && args["manifest-output"].length > 0) {
      console.error(`Wrote Inspector payload to ${args["manifest-output"]}`);
    }

    const parsed = parseManifest(inspectorPayload);
    const resolvedServer = parsed.server === "custom-server" ? args.server : parsed.server;
    const analyzed = analyzeTools(parsed.tools, task, profile);
    const { selectedIds, selectionContext } = await resolveSelection(selectionArgs, analyzed);

    if (format === "allowlist" || format === "pack" || format === "markdown") {
      const exportsPayload = buildExportPayloads(resolvedServer, analyzed, selectedIds);
      if (format === "allowlist") {
        await emitOutput(exportsPayload.allowlist, args.output);
        maybeApplyStrictMode(selectionArgs, selectionContext);
        return;
      }
      if (format === "pack") {
        await emitOutput(exportsPayload.pack, args.output);
        maybeApplyStrictMode(selectionArgs, selectionContext);
        return;
      }
      const summary = buildPackSummary(analyzed, selectedIds, profile, risk, selectionContext);
      const selectionLines = renderSelectionLines(selectionContext);
      await emitOutput(`# PackMCP inspector report

- Server: ${resolvedServer}
- Source: Inspector CLI
- Profile: ${profile}
- Risk budget: ${risk}
- Selected tools: ${summary.selectedCount}
- Token savings: ${summary.savings}%
${selectionLines ? `${selectionLines}\n` : ""}

${summary.recommendation}

${exportsPayload.markdown}`, args.output);
      maybeApplyStrictMode(selectionArgs, selectionContext);
      return;
    }

    const report = buildAnalysisReport(
      resolvedServer,
      parsed.tools,
      task,
      profile,
      risk,
      selectedIds,
      selectionContext
    );
    await emitOutput(JSON.stringify(report, null, 2), args.output);
    maybeApplyStrictMode(selectionArgs, selectionContext);
    return;
  }

  if (command === "compare") {
    if (!args.left || !args.right) {
      console.error("Missing required --left <file> or --right <file> argument.");
      process.exitCode = 1;
      return;
    }

    const leftInput = await readFile(args.left, "utf8");
    const rightInput = await readFile(args.right, "utf8");
    const leftParsed = parseManifest(leftInput);
    const rightParsed = parseManifest(rightInput);
    const report = buildComparisonReport(leftParsed, rightParsed, task, profile, risk);

    if (format === "markdown") {
      await emitOutput(`# PackMCP comparison report

- Left: ${leftParsed.server}
- Right: ${rightParsed.server}
- Profile: ${profile}
- Risk budget: ${risk}
- Shared tools: ${report.overlap.sharedAllCount}
- Shared selected tools: ${report.overlap.sharedSelectedCount}

${report.narrative}

## ${leftParsed.server}
${report.left.recommendation}

## ${rightParsed.server}
${report.right.recommendation}

## Shared selected tools
${report.overlap.sharedSelectedNames.join(", ") || "None"}
`, args.output);
      return;
    }

    await emitOutput(JSON.stringify(report, null, 2), args.output);
    return;
  }

  if (!args.input) {
    console.error("Missing required --input <file> argument.");
    process.exitCode = 1;
    return;
  }

  const input = await readFile(args.input, "utf8");
  const parsed = parseManifest(input);
  const analyzed = analyzeTools(parsed.tools, task, profile);
  const { selectedIds, selectionContext } = await resolveSelection(selectionArgs, analyzed);

  if (format === "allowlist" || format === "pack" || format === "markdown") {
    const exportsPayload = buildExportPayloads(parsed.server, analyzed, selectedIds);
    if (format === "allowlist") {
      await emitOutput(exportsPayload.allowlist, args.output);
      maybeApplyStrictMode(selectionArgs, selectionContext);
      return;
    }
    if (format === "pack") {
      await emitOutput(exportsPayload.pack, args.output);
      maybeApplyStrictMode(selectionArgs, selectionContext);
      return;
    }
    const summary = buildPackSummary(analyzed, selectedIds, profile, risk, selectionContext);
    const selectionLines = renderSelectionLines(selectionContext);
    await emitOutput(`# PackMCP report

- Server: ${parsed.server}
- Profile: ${profile}
- Risk budget: ${risk}
- Selected tools: ${summary.selectedCount}
- Token savings: ${summary.savings}%
${selectionLines ? `${selectionLines}\n` : ""}

${summary.recommendation}

${exportsPayload.markdown}`, args.output);
    maybeApplyStrictMode(selectionArgs, selectionContext);
    return;
  }

  const report = buildAnalysisReport(
    parsed.server,
    parsed.tools,
    task,
    profile,
    risk,
    selectedIds,
    selectionContext
  );
  await emitOutput(JSON.stringify(report, null, 2), args.output);
  maybeApplyStrictMode(selectionArgs, selectionContext);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
