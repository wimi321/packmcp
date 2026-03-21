import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { SAMPLE_MANIFEST } from "../src/data.js";
import {
  applyPackSelection,
  analyzeTools,
  buildAnalysisReport,
  buildComparisonReport,
  buildPackArtifact,
  buildProfileMatrix,
  buildExportPayloads,
  buildPackSummary,
  parsePackSelection,
  parseManifest,
  recommendPack
} from "../src/core.js";
import {
  buildInspectorInvocation,
  DEFAULT_INSPECTOR_TIMEOUT_MS,
  resolveInspectorTimeoutMs
} from "../src/inspector.js";

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
  const packArtifact = JSON.parse(exportsPayload.pack);
  assert.equal(packArtifact.kind, "packmcp-pack");
  assert.equal(packArtifact.tools.length, summary.selectedCount);
  assert.ok(exportsPayload.python.includes("create_static_tool_filter"));
});

test("buildPackArtifact preserves selected tool definitions", () => {
  const analyzed = analyzeTools(
    SAMPLE_MANIFEST.tools,
    "Read issues and inspect code safely.",
    "read-only"
  );
  const selectedIds = recommendPack(analyzed, "read-only", "low");
  const artifact = buildPackArtifact("github-mcp-server", analyzed, selectedIds);

  assert.equal(artifact.kind, "packmcp-pack");
  assert.equal(artifact.version, 2);
  assert.ok(Array.isArray(artifact.tools));
  assert.ok(artifact.tools.length > 0);
  assert.equal(typeof artifact.sourceManifest.fingerprint, "string");
  assert.equal(artifact.sourceManifest.toolCount, analyzed.length);
  assert.equal(artifact.selectedToolSnapshots.length, artifact.selectedToolNames.length);
  assert.deepEqual(
    artifact.selectedToolNames,
    artifact.tools.map((tool) => tool.name)
  );
});

test("parsePackSelection accepts pack artifacts and allowlists", () => {
  const fromArtifact = parsePackSelection({
    kind: "packmcp-pack",
    selectedToolNames: ["list_issues", "get_issue", "list_issues"]
  });
  const fromAllowlist = parsePackSelection(["get_issue", "comment_issue"]);

  assert.equal(fromArtifact.source, "pack");
  assert.deepEqual(fromArtifact.selectedToolNames, ["list_issues", "get_issue"]);
  assert.ok(Array.isArray(fromArtifact.selectedToolSnapshots));
  assert.equal(fromAllowlist.source, "allowlist");
  assert.deepEqual(fromAllowlist.selectedToolNames, ["get_issue", "comment_issue"]);
});

test("applyPackSelection reports missing and changed tools against the latest recommendation", () => {
  const analyzed = analyzeTools(
    SAMPLE_MANIFEST.tools,
    "Read issues and inspect code safely.",
    "balanced"
  );
  const recommendedIds = recommendPack(analyzed, "balanced", "medium");
  const savedArtifact = buildPackArtifact("github-mcp-server", analyzed, recommendedIds);
  const changedManifest = SAMPLE_MANIFEST.tools.map((tool) =>
    tool.name === "get_issue"
      ? { ...tool, description: "Read a single issue with a changed schema contract." }
      : tool
  );
  const changedAnalyzed = analyzeTools(
    changedManifest,
    "Read issues and inspect code safely.",
    "balanced"
  );
  const applied = applyPackSelection(
    changedAnalyzed,
    parsePackSelection({
      ...savedArtifact,
      selectedToolNames: [...savedArtifact.selectedToolNames, "missing_tool"]
    }),
    recommendedIds
  );

  assert.ok(applied.selectedIds.size > 0);
  assert.deepEqual(applied.selectionContext.missingNames, ["missing_tool"]);
  assert.ok(applied.selectionContext.changedNames.includes("get_issue"));
  assert.equal(applied.selectionContext.manifestFingerprintChanged, true);
  assert.ok(Array.isArray(applied.selectionContext.recommendedOnlyNames));
  assert.ok(Array.isArray(applied.selectionContext.packOnlyNames));
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

test("CLI analyze outputs a reusable pack artifact", () => {
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
      "pack"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8"
    }
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.kind, "packmcp-pack");
  assert.equal(parsed.server, "github-mcp-server");
  assert.equal(parsed.version, 2);
  assert.equal(typeof parsed.sourceManifest.fingerprint, "string");
  assert.ok(Array.isArray(parsed.tools));
  assert.ok(parsed.tools.length > 0);
});

test("CLI analyze can replay a saved pack and report drift", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "packmcp-pack-"));
  const packPath = join(tempDir, "saved.pack.json");
  await writeFile(
    packPath,
    JSON.stringify({
      kind: "packmcp-pack",
      selectedToolNames: ["get_issue", "missing_tool"]
    }),
    "utf8"
  );

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
      "--pack",
      packPath,
      "--format",
      "json"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8"
    }
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.selection.source, "pack");
  assert.deepEqual(parsed.selection.missingNames, ["missing_tool"]);
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

test("parseManifest accepts already-parsed payloads", () => {
  const parsed = parseManifest({
    result: {
      server: "fixture-server",
      tools: SAMPLE_MANIFEST.tools
    }
  });

  assert.equal(parsed.server, "fixture-server");
  assert.equal(parsed.tools.length, SAMPLE_MANIFEST.tools.length);
});

test("buildInspectorInvocation uses the official Inspector CLI shape", () => {
  const invocation = buildInspectorInvocation({
    configPath: "./examples/mcp.json.sample",
    serverName: "github"
  });

  assert.equal(invocation.command, "npx");
  assert.ok(invocation.args.includes("--cli"));
  assert.ok(invocation.args.includes("--config"));
  assert.ok(invocation.args.includes("--server"));
});

test("resolveInspectorTimeoutMs supports defaults, overrides, and disabled timeout", () => {
  assert.equal(resolveInspectorTimeoutMs(undefined), DEFAULT_INSPECTOR_TIMEOUT_MS);
  assert.equal(resolveInspectorTimeoutMs("45000"), 45_000);
  assert.equal(resolveInspectorTimeoutMs("0"), 0);
  assert.throws(() => resolveInspectorTimeoutMs("-5"), /non-negative integer/);
});

test("CLI inspect uses fixture payload and outputs analysis", () => {
  const output = execFileSync(
    "node",
    [
      "./bin/packmcp.mjs",
      "inspect",
      "--config",
      "./examples/mcp.json.sample",
      "--server",
      "github",
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
      encoding: "utf8",
      env: {
        ...process.env,
        PACKMCP_INSPECTOR_FIXTURE: "./examples/inspector-tools-list.sample.json"
      }
    }
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.server, "github");
  assert.ok(parsed.summary.selectedCount > 0);
});

test("CLI inspect writes both Inspector payload and report files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "packmcp-inspect-"));
  const manifestOutput = join(tempDir, "manifest.json");
  const reportOutput = join(tempDir, "report.json");
  const result = spawnSync(
    "node",
    [
      "./bin/packmcp.mjs",
      "inspect",
      "--config",
      "./examples/mcp.json.sample",
      "--server",
      "github",
      "--preset",
      "review",
      "--profile",
      "balanced",
      "--risk",
      "medium",
      "--format",
      "json",
      "--manifest-output",
      manifestOutput,
      "--output",
      reportOutput,
      "--timeout",
      "12000"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        PACKMCP_INSPECTOR_FIXTURE: "./examples/inspector-tools-list.sample.json"
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Wrote Inspector payload/);
  assert.match(result.stderr, /Wrote output/);

  const manifest = JSON.parse(await readFile(manifestOutput, "utf8"));
  const report = JSON.parse(await readFile(reportOutput, "utf8"));
  assert.ok(Array.isArray(manifest.result.tools));
  assert.equal(report.server, "github");
  assert.ok(report.summary.selectedCount > 0);
});

test("CLI analyze strict mode fails when a saved pack is stale", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "packmcp-strict-"));
  const packPath = join(tempDir, "stale.pack.json");
  await writeFile(
    packPath,
    JSON.stringify({
      kind: "packmcp-pack",
      selectedToolNames: ["missing_tool"]
    }),
    "utf8"
  );

  const result = spawnSync(
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
      "--pack",
      packPath,
      "--strict",
      "--format",
      "json"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Strict mode failed/);
});

test("CLI analyze strict mode fails when a saved tool definition changed", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "packmcp-strict-changed-"));
  const packPath = join(tempDir, "saved.pack.json");
  const manifestPath = join(tempDir, "changed-manifest.json");
  const analyzed = analyzeTools(
    SAMPLE_MANIFEST.tools,
    "Read issues and inspect code safely.",
    "balanced"
  );
  const selectedIds = recommendPack(analyzed, "balanced", "medium");
  await writeFile(
    packPath,
    JSON.stringify(buildPackArtifact("github-mcp-server", analyzed, selectedIds)),
    "utf8"
  );
  await writeFile(
    manifestPath,
    JSON.stringify({
      server: "github-mcp-server",
      tools: SAMPLE_MANIFEST.tools.map((tool) =>
        tool.name === "get_issue"
          ? { ...tool, description: "Read a single issue with a changed schema contract." }
          : tool
      )
    }),
    "utf8"
  );

  const result = spawnSync(
    "node",
    [
      "./bin/packmcp.mjs",
      "analyze",
      "--input",
      manifestPath,
      "--preset",
      "review",
      "--profile",
      "balanced",
      "--risk",
      "medium",
      "--pack",
      packPath,
      "--strict",
      "--format",
      "json"
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /changed tool definitions/);
});
