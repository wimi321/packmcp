import test from "node:test";
import assert from "node:assert/strict";

import { SAMPLE_MANIFEST } from "../src/data.js";
import {
  analyzeTools,
  buildAnalysisReport,
  buildComparisonReport,
  buildProfileMatrix,
  buildExportPayloads,
  buildPackSummary,
  parseManifest,
  recommendPack
} from "../src/core.js";
import { execFileSync } from "node:child_process";

test("parseManifest accepts tools/list result payloads", () => {
  const payload = JSON.stringify({
    result: {
      server: "demo-server",
      tools: SAMPLE_MANIFEST.tools
    }
  });

  const parsed = parseManifest(payload);
  assert.equal(parsed.server, "demo-server");
  assert.equal(parsed.tools.length, SAMPLE_MANIFEST.tools.length);
});

test("analyzeTools scores and normalizes tools", () => {
  const analyzed = analyzeTools(
    SAMPLE_MANIFEST.tools,
    "Inspect issues, read code, and comment without merging anything.",
    "balanced"
  );

  assert.ok(analyzed.length > 0);
  assert.ok(analyzed[0].relevance >= analyzed[analyzed.length - 1].relevance);
  assert.ok(analyzed.every((tool) => typeof tool.id === "string"));
});

test("recommendPack avoids risky tools for read-only profiles", () => {
  const analyzed = analyzeTools(
    SAMPLE_MANIFEST.tools,
    "Read issue reports and inspect code safely.",
    "read-only"
  );

  const selectedIds = recommendPack(analyzed, "read-only", "low");
  const selectedTools = analyzed.filter((tool) => selectedIds.has(tool.id));

  assert.ok(selectedTools.length > 0);
  assert.ok(selectedTools.every((tool) => tool.risk.level === "low"));
});

test("buildPackSummary and exports reflect the selected pack", () => {
  const analyzed = analyzeTools(
    SAMPLE_MANIFEST.tools,
    "Create a branch, update code, and open a draft pull request.",
    "coding"
  );
  const selectedIds = recommendPack(analyzed, "coding", "medium");
  const summary = buildPackSummary(analyzed, selectedIds, "coding", "medium");
  const exportsPayload = buildExportPayloads("github-mcp-server", analyzed, selectedIds);

  assert.ok(summary.selectedCount > 0);
  assert.ok(typeof summary.recommendation === "string");
  assert.ok(exportsPayload.allowlist.includes("["));
  assert.ok(exportsPayload.python.includes("create_static_tool_filter"));
});

test("buildAnalysisReport includes profile matrix and structured exports", () => {
  const report = buildAnalysisReport(
    "github-mcp-server",
    SAMPLE_MANIFEST.tools,
    "Read issues and inspect code safely.",
    "balanced",
    "medium"
  );

  assert.equal(report.server, "github-mcp-server");
  assert.ok(Array.isArray(report.profileMatrix));
  assert.ok(report.profileMatrix.length >= 5);
  assert.ok(Array.isArray(report.categoryBreakdown));
  assert.ok(typeof report.exports.markdown === "string");
});

test("profile matrix summarizes every profile", () => {
  const matrix = buildProfileMatrix(
    SAMPLE_MANIFEST.tools,
    "Investigate a bug and prepare a draft pull request.",
    "medium"
  );

  assert.equal(matrix.length, 5);
  assert.ok(matrix.some((item) => item.key === "coding"));
});

test("CLI analyze outputs JSON report", () => {
  const output = execFileSync(
    "node",
    [
      "./bin/packmcp.mjs",
      "analyze",
      "--input",
      "./examples/github-mcp-server.sample.json",
      "--preset",
      "review",
      "--profile",
      "balanced",
      "--risk",
      "medium",
      "--format",
      "json"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8"
    }
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.server, "github-mcp-server");
  assert.ok(parsed.summary.selectedCount > 0);
});

test("buildComparisonReport highlights overlap and pack differences", () => {
  const report = buildComparisonReport(
    {
      server: "github-mcp-server",
      tools: SAMPLE_MANIFEST.tools
    },
    {
      server: "browser-ops-mcp",
      tools: [
        {
          name: "open_page",
          description: "Open a browser page and wait for load.",
          inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
        },
        {
          name: "comment_issue",
          description: "Post a comment in a work queue system.",
          inputSchema: { type: "object", properties: { body: { type: "string" } }, required: ["body"] }
        }
      ]
    },
    "Investigate and report safely.",
    "balanced",
    "medium"
  );

  assert.equal(report.left.server, "github-mcp-server");
  assert.equal(report.right.server, "browser-ops-mcp");
  assert.ok(Array.isArray(report.overlap.sharedAllNames));
  assert.ok(typeof report.narrative === "string");
});

test("CLI compare outputs JSON comparison report", () => {
  const output = execFileSync(
    "node",
    [
      "./bin/packmcp.mjs",
      "compare",
      "--left",
      "./examples/github-mcp-server.sample.json",
      "--right",
      "./examples/browser-ops.sample.json",
      "--preset",
      "coding",
      "--profile",
      "coding",
      "--risk",
      "medium",
      "--format",
      "json"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8"
    }
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.left.server, "github-mcp-server");
  assert.equal(parsed.right.server, "browser-ops-mcp");
});
