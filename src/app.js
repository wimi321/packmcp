import { COMPARISON_MANIFEST, COPY_LABELS, PROFILE_CONFIG, SAMPLE_MANIFEST, TASK_PRESETS } from "./data.js";
import {
  analyzeTools,
  buildAnalysisReport,
  buildCategoryBreakdown,
  buildComparisonReport,
  buildExportPayloads,
  buildPackSummary,
  buildProfileMatrix,
  buildRiskBreakdown,
  formatRisk,
  getRiskTone,
  parseManifest,
  recommendPack,
  sortTools,
  titleCase
} from "./core.js";

const state = {
  rawTools: [],
  comparisonRawTools: [],
  analyzedTools: [],
  selectedIds: new Set(),
  recommendedIds: new Set(),
  serverName: "custom-server",
  comparisonServerName: "",
  comparisonReport: null
};

const el = {
  manifestInput: document.querySelector("#manifestInput"),
  compareManifestInput: document.querySelector("#compareManifestInput"),
  taskInput: document.querySelector("#taskInput"),
  fileInput: document.querySelector("#fileInput"),
  compareFileInput: document.querySelector("#compareFileInput"),
  profileSelect: document.querySelector("#profileSelect"),
  riskBudgetSelect: document.querySelector("#riskBudgetSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  analyzeButton: document.querySelector("#analyzeButton"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  loadCompareButton: document.querySelector("#loadCompareButton"),
  statusMessage: document.querySelector("#statusMessage"),
  filterInput: document.querySelector("#filterInput"),
  toolList: document.querySelector("#toolList"),
  allToolsValue: document.querySelector("#allToolsValue"),
  selectedToolsValue: document.querySelector("#selectedToolsValue"),
  allTokensValue: document.querySelector("#allTokensValue"),
  savingsValue: document.querySelector("#savingsValue"),
  highRiskValue: document.querySelector("#highRiskValue"),
  duplicateValue: document.querySelector("#duplicateValue"),
  profileValue: document.querySelector("#profileValue"),
  budgetValue: document.querySelector("#budgetValue"),
  recommendationText: document.querySelector("#recommendationText"),
  warningList: document.querySelector("#warningList"),
  profileMatrix: document.querySelector("#profileMatrix"),
  categoryBreakdown: document.querySelector("#categoryBreakdown"),
  riskBreakdown: document.querySelector("#riskBreakdown"),
  comparisonPanel: document.querySelector("#comparisonPanel"),
  allowlistOutput: document.querySelector("#allowlistOutput"),
  packOutput: document.querySelector("#packOutput"),
  pythonOutput: document.querySelector("#pythonOutput"),
  typescriptOutput: document.querySelector("#typescriptOutput"),
  markdownOutput: document.querySelector("#markdownOutput"),
  reportOutput: document.querySelector("#reportOutput"),
  comparisonOutput: document.querySelector("#comparisonOutput"),
  selectRecommendedButton: document.querySelector("#selectRecommendedButton")
};

function copyWithFallback(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "true");
  helper.style.position = "absolute";
  helper.style.left = "-9999px";
  document.body.append(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
  return Promise.resolve();
}

function formatToolCard(tool) {
  const checked = state.selectedIds.has(tool.id) ? "checked" : "";
  const selectionBadge = state.recommendedIds.has(tool.id)
    ? '<span class="badge" data-tone="accent">Recommended</span>'
    : state.selectedIds.has(tool.id)
      ? '<span class="badge" data-tone="warning">Custom</span>'
      : "";
  const reasons = tool.reasons.length > 0 ? tool.reasons.join(" · ") : "No strong task-specific signals.";

  return `
    <article class="tool-card">
      <div class="tool-topline">
        <div class="tool-main">
          <div class="tool-title">
            <label class="tool-toggle">
              <input type="checkbox" data-tool-toggle="${tool.id}" ${checked} />
              <strong>${tool.name}</strong>
            </label>
            <span class="badge" data-tone="accent">${titleCase(tool.category)}</span>
            <span class="badge" data-tone="${getRiskTone(tool.risk.level)}">${formatRisk(tool.risk.level)}</span>
            ${selectionBadge}
          </div>
          <p class="tool-description">${tool.description}</p>
          <p class="reason-line">${reasons}</p>
        </div>
        <div class="tool-badges">
          <span class="badge">${tool.estimatedTokens} tok</span>
          <span class="badge">${tool.relevance.toFixed(1)} score</span>
          <span class="badge">${tool.schemaFields} fields</span>
          ${tool.readHeavy ? '<span class="badge" data-tone="accent">Read-heavy</span>' : ""}
          ${tool.duplicate ? '<span class="badge" data-tone="warning">Duplicate name</span>' : ""}
        </div>
      </div>
    </article>
  `;
}

function renderTools() {
  const filterValue = el.filterInput.value.trim().toLowerCase();
  const sorted = sortTools(state.analyzedTools, el.sortSelect.value);
  const filtered = sorted.filter((tool) => {
    if (!filterValue) {
      return true;
    }
    return `${tool.name} ${tool.description} ${tool.category} ${tool.reasons.join(" ")}`
      .toLowerCase()
      .includes(filterValue);
  });

  if (filtered.length === 0) {
    el.toolList.innerHTML = '<div class="empty-state">No tools match the current filter.</div>';
    return;
  }

  el.toolList.innerHTML = filtered.map(formatToolCard).join("");
}

function renderWarnings(summary) {
  el.warningList.innerHTML = summary.warnings
    .map(
      (warning) => `
        <article class="warning-card" data-tone="${warning.tone}">
          <strong>${warning.title}</strong>
          <p>${warning.body}</p>
        </article>
      `
    )
    .join("");
}

function renderProfileMatrix() {
  if (state.rawTools.length === 0) {
    el.profileMatrix.innerHTML = '<div class="empty-state">Analyze a manifest to compare profiles.</div>';
    return;
  }

  const matrix = buildProfileMatrix(state.rawTools, el.taskInput.value.trim(), el.riskBudgetSelect.value);
  el.profileMatrix.innerHTML = matrix
    .map(
      (item) => `
        <article class="matrix-card">
          <div class="panel-header">
            <h3>${item.label}</h3>
            <button class="mini-button" data-profile-apply="${item.key}">Apply</button>
          </div>
          <div class="matrix-stats">
            <span class="badge">${item.selectedCount} tools</span>
            <span class="badge" data-tone="accent">${item.savings}% saved</span>
            <span class="badge" data-tone="${item.selectedHighRisk > 0 ? "warning" : "accent"}">
              ${item.selectedHighRisk} high-risk kept
            </span>
          </div>
          <p>Top tool: ${item.topTool}</p>
          <p>${item.summary}</p>
        </article>
      `
    )
    .join("");
}

function renderComparison() {
  if (!state.comparisonReport) {
    el.comparisonPanel.innerHTML = '<div class="empty-state">Add a second manifest to compare overlap, safer packs, and migration paths.</div>';
    return;
  }

  const { left, right, overlap, narrative } = state.comparisonReport;
  el.comparisonPanel.innerHTML = `
    <article class="comparison-card">
      <div class="panel-header">
        <h3>${left.server}</h3>
        <span class="badge">${left.summary.selectedCount} selected</span>
      </div>
      <p>${left.recommendation}</p>
      <div class="matrix-stats">
        <span class="badge" data-tone="accent">${left.summary.savingsPercent}% saved</span>
        <span class="badge">${left.summary.highRiskCount} high-risk total</span>
      </div>
    </article>

    <article class="comparison-card">
      <div class="panel-header">
        <h3>${right.server}</h3>
        <span class="badge">${right.summary.selectedCount} selected</span>
      </div>
      <p>${right.recommendation}</p>
      <div class="matrix-stats">
        <span class="badge" data-tone="accent">${right.summary.savingsPercent}% saved</span>
        <span class="badge">${right.summary.highRiskCount} high-risk total</span>
      </div>
    </article>

    <article class="comparison-card">
      <div class="panel-header">
        <h3>Overlap</h3>
        <span class="badge">${overlap.sharedAllCount} shared tools</span>
      </div>
      <ul>
        <li>Shared selected tools: ${overlap.sharedSelectedCount}</li>
        <li>${left.server} unique tools: ${overlap.leftOnlyAllCount}</li>
        <li>${right.server} unique tools: ${overlap.rightOnlyAllCount}</li>
      </ul>
      <p>${narrative}</p>
    </article>

    <article class="comparison-card">
      <div class="panel-header">
        <h3>Migration hints</h3>
        <span class="badge" data-tone="warning">${overlap.leftOnlySelectedCount + overlap.rightOnlySelectedCount} pack diffs</span>
      </div>
      <ul>
        <li>${left.server} only in pack: ${overlap.leftOnlySelectedNames.slice(0, 4).join(", ") || "None"}</li>
        <li>${right.server} only in pack: ${overlap.rightOnlySelectedNames.slice(0, 4).join(", ") || "None"}</li>
        <li>Shared pack tools: ${overlap.sharedSelectedNames.slice(0, 4).join(", ") || "None"}</li>
      </ul>
    </article>
  `;
}

function renderBreakdownRows(container, items, getLabel, getTone = () => "accent") {
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No breakdown data available yet.</div>';
    return;
  }

  const maxCount = Math.max(...items.map((item) => item.all), 1);
  container.innerHTML = items
    .map((item) => {
      const width = Math.max(8, Math.round((item.selected / maxCount) * 100));
      return `
        <div class="bar-row">
          <div class="bar-topline">
            <strong>${getLabel(item)}</strong>
            <span class="dual-count">${item.selected} selected / ${item.all} total</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" data-tone="${getTone(item)}" style="width: ${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderBreakdowns() {
  renderBreakdownRows(
    el.categoryBreakdown,
    buildCategoryBreakdown(state.analyzedTools, state.selectedIds),
    (item) => titleCase(item.category)
  );
  renderBreakdownRows(
    el.riskBreakdown,
    buildRiskBreakdown(state.analyzedTools, state.selectedIds),
    (item) => titleCase(item.level),
    (item) => getRiskTone(item.level)
  );
}

function updateSummary() {
  const summary = buildPackSummary(
    state.analyzedTools,
    state.selectedIds,
    el.profileSelect.value,
    el.riskBudgetSelect.value
  );

  el.allToolsValue.textContent = String(summary.allTools);
  el.selectedToolsValue.textContent = String(summary.selectedCount);
  el.allTokensValue.textContent = String(summary.allTokens);
  el.savingsValue.textContent = `${summary.savings}%`;
  el.highRiskValue.textContent = String(summary.highRiskCount);
  el.duplicateValue.textContent = String(summary.duplicateCount);
  el.profileValue.textContent = PROFILE_CONFIG[el.profileSelect.value].label;
  el.budgetValue.textContent = titleCase(el.riskBudgetSelect.value);
  el.recommendationText.textContent = summary.recommendation;
  renderWarnings(summary);
}

function updateExports() {
  const payloads = buildExportPayloads(state.serverName, state.analyzedTools, state.selectedIds);
  const report = buildAnalysisReport(
    state.serverName,
    state.rawTools,
    el.taskInput.value.trim(),
    el.profileSelect.value,
    el.riskBudgetSelect.value,
    state.selectedIds
  );
  el.allowlistOutput.value = payloads.allowlist;
  el.packOutput.value = payloads.pack;
  el.pythonOutput.value = payloads.python;
  el.typescriptOutput.value = payloads.typescript;
  el.markdownOutput.value = payloads.markdown;
  el.reportOutput.value = JSON.stringify(report, null, 2);
  el.comparisonOutput.value = state.comparisonReport ? JSON.stringify(state.comparisonReport, null, 2) : "";
}

function refreshAll() {
  renderTools();
  updateSummary();
  renderProfileMatrix();
  renderBreakdowns();
  renderComparison();
  updateExports();
}

function analyzeManifest() {
  const input = el.manifestInput.value.trim();
  if (!input) {
    el.statusMessage.textContent = "Paste a manifest or load the sample before analyzing.";
    return;
  }

  try {
    const parsed = parseManifest(input);
    state.serverName = parsed.server;
    state.rawTools = parsed.tools;
    state.analyzedTools = analyzeTools(parsed.tools, el.taskInput.value.trim(), el.profileSelect.value);
    state.recommendedIds = recommendPack(
      state.analyzedTools,
      el.profileSelect.value,
      el.riskBudgetSelect.value
    );
    state.selectedIds = new Set(state.recommendedIds);
    const compareInput = el.compareManifestInput.value.trim();
    if (compareInput) {
      const compareParsed = parseManifest(compareInput);
      state.comparisonServerName = compareParsed.server;
      state.comparisonRawTools = compareParsed.tools;
      state.comparisonReport = buildComparisonReport(
        { server: state.serverName, tools: state.rawTools },
        { server: state.comparisonServerName, tools: state.comparisonRawTools },
        el.taskInput.value.trim(),
        el.profileSelect.value,
        el.riskBudgetSelect.value
      );
    } else {
      state.comparisonServerName = "";
      state.comparisonRawTools = [];
      state.comparisonReport = null;
    }
    el.statusMessage.textContent = `Analyzed ${state.analyzedTools.length} tools from ${state.serverName}. Recommended pack ready.`;
    refreshAll();
  } catch (error) {
    el.statusMessage.textContent = error instanceof Error ? error.message : "Unable to parse the manifest.";
  }
}

function loadSample() {
  el.manifestInput.value = JSON.stringify(SAMPLE_MANIFEST, null, 2);
  el.compareManifestInput.value = "";
  el.taskInput.value = TASK_PRESETS.review;
  el.profileSelect.value = "balanced";
  el.riskBudgetSelect.value = "medium";
  analyzeManifest();
}

function loadComparisonPair() {
  el.manifestInput.value = JSON.stringify(SAMPLE_MANIFEST, null, 2);
  el.compareManifestInput.value = JSON.stringify(COMPARISON_MANIFEST, null, 2);
  el.taskInput.value = TASK_PRESETS.coding;
  el.profileSelect.value = "coding";
  el.riskBudgetSelect.value = "medium";
  analyzeManifest();
}

el.loadSampleButton.addEventListener("click", loadSample);
el.loadCompareButton.addEventListener("click", loadComparisonPair);
el.analyzeButton.addEventListener("click", analyzeManifest);
el.profileSelect.addEventListener("change", analyzeManifest);
el.riskBudgetSelect.addEventListener("change", analyzeManifest);
el.taskInput.addEventListener("change", analyzeManifest);
el.filterInput.addEventListener("input", renderTools);
el.sortSelect.addEventListener("change", renderTools);
el.selectRecommendedButton.addEventListener("click", () => {
  state.selectedIds = new Set(state.recommendedIds);
  refreshAll();
});

el.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }
  el.manifestInput.value = await file.text();
  analyzeManifest();
});

el.compareFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }
  el.compareManifestInput.value = await file.text();
  analyzeManifest();
});

document.querySelectorAll("[data-task]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-task");
    if (!key) {
      return;
    }
    el.taskInput.value = TASK_PRESETS[key];
    analyzeManifest();
  });
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const profileKey = target.getAttribute("data-profile-apply");
  if (!profileKey) {
    return;
  }
  el.profileSelect.value = profileKey;
  analyzeManifest();
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const toolId = target.getAttribute("data-tool-toggle");
  if (!toolId) {
    return;
  }
  if (target.checked) {
    state.selectedIds.add(toolId);
  } else {
    state.selectedIds.delete(toolId);
  }
  refreshAll();
});

document.querySelectorAll(".copy-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const fieldId = button.getAttribute("data-copy");
    if (!fieldId) {
      return;
    }
    const field = document.getElementById(fieldId);
    if (!(field instanceof HTMLTextAreaElement)) {
      return;
    }
    await copyWithFallback(field.value);
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = COPY_LABELS[fieldId];
    }, 1200);
  });
});

loadSample();
