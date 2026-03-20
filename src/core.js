import {
  CATEGORY_KEYWORDS,
  HIGH_RISK_WORDS,
  MEDIUM_RISK_WORDS,
  PROFILE_CONFIG,
  READ_WORDS,
  RISK_LIMITS
} from "./data.js";

export { PROFILE_CONFIG };

export function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 1);
}

export function titleCase(value) {
  return value
    .split(/[-\s]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatRisk(level) {
  if (level === "high") {
    return "High risk";
  }
  if (level === "medium") {
    return "Medium risk";
  }
  return "Low risk";
}

export function getRiskTone(level) {
  if (level === "high") {
    return "danger";
  }
  if (level === "medium") {
    return "warning";
  }
  return "accent";
}

export function parseManifest(input) {
  const parsed = JSON.parse(input);
  if (Array.isArray(parsed)) {
    return { server: "custom-server", tools: parsed };
  }

  if (parsed && Array.isArray(parsed.tools)) {
    return {
      server: parsed.server || parsed.name || parsed.serverName || "custom-server",
      tools: parsed.tools
    };
  }

  if (parsed && parsed.result && Array.isArray(parsed.result.tools)) {
    return {
      server: parsed.server || parsed.result.server || "custom-server",
      tools: parsed.result.tools
    };
  }

  throw new Error("Unsupported manifest shape. Paste an array, a { tools: [...] } object, or a tools/list payload.");
}

function countSchemaProperties(schema) {
  if (!schema || typeof schema !== "object") {
    return 0;
  }

  let total = 0;
  const stack = [schema];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (current.properties && typeof current.properties === "object") {
      total += Object.keys(current.properties).length;
      for (const value of Object.values(current.properties)) {
        stack.push(value);
      }
    }
    if (Array.isArray(current.items)) {
      for (const value of current.items) {
        stack.push(value);
      }
    } else if (current.items && typeof current.items === "object") {
      stack.push(current.items);
    }
  }
  return total;
}

function classifyCategory(signature) {
  const text = signature.toLowerCase();
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((word) => text.includes(word))) {
      return category;
    }
  }
  return "misc";
}

function classifyRisk(signature) {
  const text = signature.toLowerCase();
  if (HIGH_RISK_WORDS.some((word) => text.includes(word))) {
    return { level: "high", points: 3 };
  }
  if (MEDIUM_RISK_WORDS.some((word) => text.includes(word))) {
    return { level: "medium", points: 1 };
  }
  return { level: "low", points: 0 };
}

function isReadHeavy(signature) {
  const text = signature.toLowerCase();
  return READ_WORDS.some((word) => text.includes(word));
}

function getMatchedTaskTerms(signatureTokens, taskTokens) {
  if (taskTokens.length === 0) {
    return [];
  }

  const unique = new Set(signatureTokens);
  return [...new Set(taskTokens.filter((token) => unique.has(token)))].slice(0, 5);
}

function getRelevanceScore(tool, taskTokens, profile) {
  if (taskTokens.length === 0) {
    return profile.preferredCategories.includes(tool.category) ? 1.2 : 0.5;
  }

  const signatureTokens = tokenize(tool.signature);
  const matchedTerms = getMatchedTaskTerms(signatureTokens, taskTokens);
  const categoryBonus = profile.preferredCategories.includes(tool.category) ? 1.4 : 0.25;
  const readBonus = tool.readHeavy ? profile.readBias : 0;
  const schemaBonus = tool.schemaFields > 0 ? Math.min(0.9, tool.schemaFields * 0.08) : 0;
  const riskPenalty = tool.risk.points * 0.8;
  return matchedTerms.length * 1.9 + categoryBonus + readBonus + schemaBonus - riskPenalty;
}

function buildReasons(tool, taskTokens, profile) {
  const signatureTokens = tokenize(tool.signature);
  const matched = getMatchedTaskTerms(signatureTokens, taskTokens);
  const reasons = [];

  if (matched.length > 0) {
    reasons.push(`Matches task terms: ${matched.join(", ")}`);
  }
  if (profile.preferredCategories.includes(tool.category)) {
    reasons.push(`Fits the ${profile.label.toLowerCase()} profile`);
  }
  if (tool.readHeavy) {
    reasons.push("Read-oriented and easier to trust");
  }
  if (tool.risk.level === "high") {
    reasons.push("Includes high-risk write or release verbs");
  }
  if (tool.duplicate) {
    reasons.push("Duplicate tool name detected in manifest");
  }

  return reasons.slice(0, 3);
}

export function analyzeTools(rawTools, task, profileKey) {
  const profile = PROFILE_CONFIG[profileKey];
  const taskTokens = tokenize(task);
  const duplicateCounts = new Map();

  const normalized = rawTools.map((tool, index) => {
    const schema = JSON.stringify(tool.inputSchema || {});
    const name = tool.name || `tool_${index}`;
    const description = tool.description || "No description provided.";
    const signature = `${name} ${description} ${schema}`;
    const category = classifyCategory(signature);
    const risk = classifyRisk(signature);
    const readHeavy = isReadHeavy(signature);
    const schemaFields = countSchemaProperties(tool.inputSchema || {});
    const normalizedTool = {
      id: `${name}-${index}`,
      name,
      description,
      inputSchema: tool.inputSchema || {},
      category,
      risk,
      readHeavy,
      schemaFields,
      estimatedTokens: estimateTokens(signature),
      signature
    };

    duplicateCounts.set(name, (duplicateCounts.get(name) ?? 0) + 1);
    return normalizedTool;
  });

  for (const tool of normalized) {
    tool.duplicate = (duplicateCounts.get(tool.name) ?? 0) > 1;
    tool.relevance = getRelevanceScore(tool, taskTokens, profile);
    tool.reasons = buildReasons(tool, taskTokens, profile);
  }

  return normalized.sort((left, right) => right.relevance - left.relevance);
}

function canSelectTool(tool, profileKey, riskLimit, riskSpent) {
  if (riskSpent + tool.risk.points > riskLimit) {
    return false;
  }
  if (profileKey === "read-only" && tool.risk.level !== "low") {
    return false;
  }
  if (profileKey === "coding" && tool.category === "deploy" && tool.risk.level === "high") {
    return false;
  }
  return true;
}

export function recommendPack(tools, profileKey, riskBudgetKey) {
  const profile = PROFILE_CONFIG[profileKey];
  const riskLimit = RISK_LIMITS[riskBudgetKey];
  const selectedIds = new Set();
  let riskSpent = 0;

  for (const category of profile.preferredCategories) {
    const candidate = tools.find(
      (tool) =>
        tool.category === category &&
        !selectedIds.has(tool.id) &&
        canSelectTool(tool, profileKey, riskLimit, riskSpent)
    );
    if (!candidate) {
      continue;
    }
    selectedIds.add(candidate.id);
    riskSpent += candidate.risk.points;
    if (selectedIds.size >= profile.defaultLimit) {
      return selectedIds;
    }
  }

  for (const tool of tools) {
    if (selectedIds.size >= profile.defaultLimit) {
      break;
    }
    if (selectedIds.has(tool.id)) {
      continue;
    }
    if (!canSelectTool(tool, profileKey, riskLimit, riskSpent)) {
      continue;
    }
    selectedIds.add(tool.id);
    riskSpent += tool.risk.points;
  }

  if (selectedIds.size === 0) {
    for (const tool of tools.filter((item) => item.risk.level === "low").slice(0, profile.defaultLimit)) {
      selectedIds.add(tool.id);
    }
  }

  return selectedIds;
}

export function sortTools(tools, sortKey) {
  const sorted = [...tools];
  if (sortKey === "risk") {
    const order = { high: 3, medium: 2, low: 1 };
    return sorted.sort((left, right) => order[right.risk.level] - order[left.risk.level] || right.relevance - left.relevance);
  }
  if (sortKey === "tokens") {
    return sorted.sort((left, right) => right.estimatedTokens - left.estimatedTokens || right.relevance - left.relevance);
  }
  if (sortKey === "name") {
    return sorted.sort((left, right) => left.name.localeCompare(right.name));
  }
  return sorted.sort((left, right) => right.relevance - left.relevance);
}

function buildRecommendationText(selectedTools, profileKey, riskBudgetKey) {
  if (selectedTools.length === 0) {
    return "No tools are selected yet. Analyze a manifest or apply the recommended pack first.";
  }

  const categories = [...new Set(selectedTools.map((tool) => titleCase(tool.category)))];
  const highRisk = selectedTools.filter((tool) => tool.risk.level === "high").map((tool) => tool.name);
  const readHeavyCount = selectedTools.filter((tool) => tool.readHeavy).length;
  const base = `This ${PROFILE_CONFIG[profileKey].label.toLowerCase()} pack keeps ${selectedTools.length} tools across ${categories.slice(0, 4).join(", ")} while staying within a ${riskBudgetKey} risk budget.`;

  if (highRisk.length > 0) {
    return `${base} High-risk tools still included: ${highRisk.join(", ")}. Keep them only if the task truly needs merges, writes, or release actions.`;
  }

  return `${base} ${readHeavyCount} selected tools are strongly read-oriented, which keeps the pack cheaper to describe and easier to supervise.`;
}

export function buildWarnings(tools, selectedIds) {
  const selectedTools = tools.filter((tool) => selectedIds.has(tool.id));
  const warnings = [];
  const duplicateCount = tools.filter((tool) => tool.duplicate).length;
  const selectedTokens = selectedTools.reduce((sum, tool) => sum + tool.estimatedTokens, 0);
  const allTokens = tools.reduce((sum, tool) => sum + tool.estimatedTokens, 0);
  const selectedHighRisk = selectedTools.filter((tool) => tool.risk.level === "high");
  const distinctCategories = new Set(selectedTools.map((tool) => tool.category));
  const sparseDescriptions = tools.filter((tool) => tool.description === "No description provided.").length;

  if (selectedHighRisk.length > 0) {
    warnings.push({
      tone: "danger",
      title: "High-risk tools remain in the pack",
      body: `${selectedHighRisk.map((tool) => tool.name).join(", ")} can write, merge, or trigger side effects. Keep them only when the task truly needs them.`
    });
  }

  if (allTokens > 0 && selectedTokens / allTokens > 0.72) {
    warnings.push({
      tone: "warning",
      title: "The pack is still fairly large",
      body: `The current selection still carries ${selectedTokens} estimated tokens of tool metadata. Consider trimming more tools for better context efficiency.`
    });
  }

  if (distinctCategories.size < 2 && selectedTools.length > 2) {
    warnings.push({
      tone: "warning",
      title: "Category coverage is narrow",
      body: "Most selected tools sit in the same category. That may leave the agent underpowered for investigation or follow-up steps."
    });
  }

  if (duplicateCount > 0) {
    warnings.push({
      tone: "warning",
      title: "Duplicate tool names detected",
      body: "Manifest collisions can confuse agents and humans. Consider renaming or namespacing duplicate tools before exposing them."
    });
  }

  if (sparseDescriptions > 0) {
    warnings.push({
      tone: "warning",
      title: "Some tools are poorly described",
      body: `${sparseDescriptions} tools are missing descriptions. Better descriptions improve filtering quality and model tool choice.`
    });
  }

  if (warnings.length === 0) {
    warnings.push({
      tone: "accent",
      title: "No major red flags detected",
      body: "The current pack looks compact, reasonably described, and within a manageable risk envelope."
    });
  }

  return warnings;
}

export function buildPackSummary(tools, selectedIds, profileKey, riskBudgetKey) {
  const selectedTools = tools.filter((tool) => selectedIds.has(tool.id));
  const allTokens = tools.reduce((sum, tool) => sum + tool.estimatedTokens, 0);
  const selectedTokens = selectedTools.reduce((sum, tool) => sum + tool.estimatedTokens, 0);
  const highRiskCount = tools.filter((tool) => tool.risk.level === "high").length;
  const duplicateCount = tools.filter((tool) => tool.duplicate).length;
  const savings = allTokens === 0 ? 0 : Math.round(((allTokens - selectedTokens) / allTokens) * 100);
  const selectedCategories = [...new Set(selectedTools.map((tool) => tool.category))];

  return {
    allTools: tools.length,
    selectedCount: selectedTools.length,
    allTokens,
    selectedTokens,
    savings,
    highRiskCount,
    duplicateCount,
    selectedCategories,
    recommendation: buildRecommendationText(selectedTools, profileKey, riskBudgetKey),
    warnings: buildWarnings(tools, selectedIds)
  };
}

export function buildCategoryBreakdown(tools, selectedIds) {
  const byCategory = new Map();

  for (const tool of tools) {
    const existing = byCategory.get(tool.category) ?? { category: tool.category, all: 0, selected: 0 };
    existing.all += 1;
    if (selectedIds.has(tool.id)) {
      existing.selected += 1;
    }
    byCategory.set(tool.category, existing);
  }

  return [...byCategory.values()].sort((left, right) => right.all - left.all || left.category.localeCompare(right.category));
}

export function buildRiskBreakdown(tools, selectedIds) {
  const levels = ["high", "medium", "low"];
  return levels.map((level) => ({
    level,
    all: tools.filter((tool) => tool.risk.level === level).length,
    selected: tools.filter((tool) => tool.risk.level === level && selectedIds.has(tool.id)).length
  }));
}

export function buildProfileMatrix(rawTools, task, riskBudgetKey) {
  return Object.entries(PROFILE_CONFIG).map(([profileKey, profile]) => {
    const analyzed = analyzeTools(rawTools, task, profileKey);
    const selectedIds = recommendPack(analyzed, profileKey, riskBudgetKey);
    const summary = buildPackSummary(analyzed, selectedIds, profileKey, riskBudgetKey);
    const selectedTools = analyzed.filter((tool) => selectedIds.has(tool.id));
    const topTool = selectedTools[0]?.name || "None";

    return {
      key: profileKey,
      label: profile.label,
      selectedCount: summary.selectedCount,
      savings: summary.savings,
      selectedHighRisk: selectedTools.filter((tool) => tool.risk.level === "high").length,
      topTool,
      summary: summary.recommendation
    };
  });
}

export function buildAnalysisReport(serverName, rawTools, task, profileKey, riskBudgetKey, selectedIds) {
  const analyzed = analyzeTools(rawTools, task, profileKey);
  const activeSelection = selectedIds ? new Set(selectedIds) : recommendPack(analyzed, profileKey, riskBudgetKey);
  const summary = buildPackSummary(analyzed, activeSelection, profileKey, riskBudgetKey);
  const exportsPayload = buildExportPayloads(serverName, analyzed, activeSelection);
  const categoryBreakdown = buildCategoryBreakdown(analyzed, activeSelection);
  const riskBreakdown = buildRiskBreakdown(analyzed, activeSelection);
  const profileMatrix = buildProfileMatrix(rawTools, task, riskBudgetKey);
  const selectedTools = analyzed
    .filter((tool) => activeSelection.has(tool.id))
    .map((tool) => ({
      name: tool.name,
      category: tool.category,
      risk: tool.risk.level,
      estimatedTokens: tool.estimatedTokens,
      schemaFields: tool.schemaFields,
      reasons: tool.reasons
    }));

  return {
    version: 1,
    server: serverName,
    task,
    profile: profileKey,
    riskBudget: riskBudgetKey,
    summary: {
      allTools: summary.allTools,
      selectedCount: summary.selectedCount,
      allTokens: summary.allTokens,
      selectedTokens: summary.selectedTokens,
      savingsPercent: summary.savings,
      highRiskCount: summary.highRiskCount,
      duplicateCount: summary.duplicateCount
    },
    recommendation: summary.recommendation,
    warnings: summary.warnings,
    selectedTools,
    categoryBreakdown,
    riskBreakdown,
    profileMatrix,
    exports: exportsPayload
  };
}

function getToolNameSet(rawTools) {
  return new Set(
    rawTools
      .map((tool, index) => tool.name || `tool_${index}`)
      .filter(Boolean)
  );
}

function getSelectedToolNameSet(selectedTools) {
  return new Set(selectedTools.map((tool) => tool.name));
}

function setIntersection(left, right) {
  return [...left].filter((value) => right.has(value)).sort((a, b) => a.localeCompare(b));
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort((a, b) => a.localeCompare(b));
}

function buildComparisonNarrative(leftReport, rightReport, overlap) {
  const tokenWinner =
    leftReport.summary.savingsPercent === rightReport.summary.savingsPercent
      ? "Both packs save a similar amount of tool metadata."
      : leftReport.summary.savingsPercent > rightReport.summary.savingsPercent
        ? `${leftReport.server} trims context more aggressively.`
        : `${rightReport.server} trims context more aggressively.`;

  const riskWinner =
    leftReport.selectedTools.filter((tool) => tool.risk === "high").length ===
    rightReport.selectedTools.filter((tool) => tool.risk === "high").length
      ? "Both recommended packs keep a similar amount of high-risk surface area."
      : leftReport.selectedTools.filter((tool) => tool.risk === "high").length <
          rightReport.selectedTools.filter((tool) => tool.risk === "high").length
        ? `${leftReport.server} keeps a safer recommended pack.`
        : `${rightReport.server} keeps a safer recommended pack.`;

  if (overlap.sharedSelectedNames.length === 0) {
    return `${tokenWinner} ${riskWinner} The selected packs have no overlapping tool names, which usually means the two servers solve very different workflows.`;
  }

  return `${tokenWinner} ${riskWinner} The recommended packs still share ${overlap.sharedSelectedNames.length} tool names, so there is a realistic migration or fallback path between them.`;
}

export function buildComparisonReport(leftManifest, rightManifest, task, profileKey, riskBudgetKey) {
  const leftReport = buildAnalysisReport(
    leftManifest.server,
    leftManifest.tools,
    task,
    profileKey,
    riskBudgetKey
  );
  const rightReport = buildAnalysisReport(
    rightManifest.server,
    rightManifest.tools,
    task,
    profileKey,
    riskBudgetKey
  );

  const leftToolNames = getToolNameSet(leftManifest.tools);
  const rightToolNames = getToolNameSet(rightManifest.tools);
  const leftSelectedNames = getSelectedToolNameSet(leftReport.selectedTools);
  const rightSelectedNames = getSelectedToolNameSet(rightReport.selectedTools);

  const overlap = {
    sharedAllNames: setIntersection(leftToolNames, rightToolNames),
    leftOnlyAllNames: setDifference(leftToolNames, rightToolNames),
    rightOnlyAllNames: setDifference(rightToolNames, leftToolNames),
    sharedSelectedNames: setIntersection(leftSelectedNames, rightSelectedNames),
    leftOnlySelectedNames: setDifference(leftSelectedNames, rightSelectedNames),
    rightOnlySelectedNames: setDifference(rightSelectedNames, leftSelectedNames)
  };

  return {
    version: 1,
    task,
    profile: profileKey,
    riskBudget: riskBudgetKey,
    left: leftReport,
    right: rightReport,
    overlap: {
      ...overlap,
      sharedAllCount: overlap.sharedAllNames.length,
      leftOnlyAllCount: overlap.leftOnlyAllNames.length,
      rightOnlyAllCount: overlap.rightOnlyAllNames.length,
      sharedSelectedCount: overlap.sharedSelectedNames.length,
      leftOnlySelectedCount: overlap.leftOnlySelectedNames.length,
      rightOnlySelectedCount: overlap.rightOnlySelectedNames.length
    },
    narrative: buildComparisonNarrative(leftReport, rightReport, overlap)
  };
}

export function buildExportPayloads(serverName, tools, selectedIds) {
  const selectedTools = tools.filter((tool) => selectedIds.has(tool.id));
  const selectedNames = [...new Set(selectedTools.map((tool) => tool.name))];
  const selectedTokenCost = selectedTools.reduce((sum, tool) => sum + tool.estimatedTokens, 0);

  return {
    allowlist: JSON.stringify(selectedNames, null, 2),
    python: `from agents.mcp import create_static_tool_filter\n\nselected_tools = ${JSON.stringify(selectedNames, null, 2)}\ntool_filter = create_static_tool_filter(selected_tools)\n# Pass tool_filter when creating your MCP server connection.`,
    typescript: `const selectedTools = ${JSON.stringify(selectedNames, null, 2)};\n\nexport function allowOnlySelectedTools(tool) {\n  return selectedTools.includes(tool.name);\n}\n\n// Example: filter tools before exposing them to the agent runtime.`,
    markdown: [
      `# ${serverName} pack`,
      "",
      `Selected ${selectedNames.length} tools with an estimated ${selectedTokenCost} tokens of tool metadata.`,
      "",
      "| Tool | Category | Risk | Tokens |",
      "| --- | --- | --- | ---: |",
      ...selectedTools.map(
        (tool) =>
          `| ${tool.name} | ${titleCase(tool.category)} | ${formatRisk(tool.risk.level)} | ${tool.estimatedTokens} |`
      )
    ].join("\n")
  };
}
