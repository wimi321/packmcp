import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const DEFAULT_INSPECTOR_TIMEOUT_MS = 30_000;

function looksLikeNpx(bin) {
  return /(^|[/\\])npx(?:\.cmd)?$/i.test(bin);
}

function looksLikeBunx(bin) {
  return /(^|[/\\])bunx(?:\.cmd)?$/i.test(bin);
}

function extractJsonDocument(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Inspector returned empty output.");
  }

  const candidates = [trimmed];
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  if (firstObject >= 0) {
    candidates.push(trimmed.slice(firstObject));
  }
  if (firstArray >= 0) {
    candidates.push(trimmed.slice(firstArray));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying until we find a valid JSON payload.
    }
  }

  throw new Error("Unable to parse JSON from Inspector output.");
}

export function resolveInspectorTimeoutMs(timeoutValue) {
  const candidate = timeoutValue ?? process.env.PACKMCP_INSPECTOR_TIMEOUT_MS ?? DEFAULT_INSPECTOR_TIMEOUT_MS;
  const parsed = Number.parseInt(String(candidate), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Inspector timeout must be a non-negative integer in milliseconds.");
  }

  return parsed;
}

function formatInspectorFailure(error, timeoutMs) {
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
  const details = stderr || stdout;

  if (timeoutMs > 0 && (error?.killed || error?.signal === "SIGTERM")) {
    return [
      `Inspector timed out after ${timeoutMs}ms.`,
      "Check that the MCP server starts cleanly and that any required credentials in your mcp.json are valid.",
      details || null
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "Inspector CLI failed.",
    details || (error instanceof Error ? error.message : String(error))
  ].join(" ");
}

export function buildInspectorInvocation(options) {
  const inspectorBin = options.inspectorBin || process.env.PACKMCP_INSPECTOR_BIN || "npx";
  const inspectorPackage =
    options.inspectorPackage || process.env.PACKMCP_INSPECTOR_PACKAGE || "@modelcontextprotocol/inspector";

  const args = [];
  if (looksLikeNpx(inspectorBin)) {
    args.push("-y", inspectorPackage);
  } else if (looksLikeBunx(inspectorBin)) {
    args.push(inspectorPackage);
  }

  args.push("--cli", "--config", options.configPath, "--server", options.serverName, "--method", "tools/list");

  return {
    command: inspectorBin,
    args
  };
}

export async function runInspectorToolsList(options) {
  if (process.env.PACKMCP_INSPECTOR_FIXTURE) {
    const fixture = await readFile(process.env.PACKMCP_INSPECTOR_FIXTURE, "utf8");
    return JSON.parse(fixture);
  }

  const invocation = buildInspectorInvocation(options);
  const timeoutMs = resolveInspectorTimeoutMs(options.timeoutMs);
  let result;

  try {
    result = await execFileAsync(invocation.command, invocation.args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs > 0 ? timeoutMs : undefined
    });
  } catch (error) {
    throw new Error(formatInspectorFailure(error, timeoutMs));
  }

  return extractJsonDocument(result.stdout);
}

export async function maybeWriteInspectorPayload(payload, outputPath) {
  if (!outputPath) {
    return;
  }

  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
}
