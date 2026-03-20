export const SAMPLE_MANIFEST = {
  server: "github-mcp-server",
  tools: [
    {
      name: "list_issues",
      description: "List repository issues with filters for state, labels, assignee, and pagination.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"] }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "get_issue",
      description: "Read a single issue including title, body, labels, assignees, and timeline summary.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "integer" }
        },
        required: ["owner", "repo", "issue_number"]
      }
    },
    {
      name: "comment_issue",
      description: "Post a comment on an issue or pull request thread.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "integer" },
          body: { type: "string" }
        },
        required: ["owner", "repo", "issue_number", "body"]
      }
    },
    {
      name: "create_branch",
      description: "Create a new branch from a source reference in a repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          branch: { type: "string" },
          from_ref: { type: "string" }
        },
        required: ["owner", "repo", "branch", "from_ref"]
      }
    },
    {
      name: "commit_files",
      description: "Create or update files in a branch and commit the changes.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          branch: { type: "string" },
          files: { type: "array" },
          commit_message: { type: "string" }
        },
        required: ["owner", "repo", "branch", "files", "commit_message"]
      }
    },
    {
      name: "create_pull_request",
      description: "Open a pull request from one branch to another and set title and body.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          head: { type: "string" },
          base: { type: "string" },
          title: { type: "string" },
          body: { type: "string" }
        },
        required: ["owner", "repo", "head", "base", "title"]
      }
    },
    {
      name: "merge_pull_request",
      description: "Merge a pull request using merge, squash, or rebase strategies.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "integer" },
          method: { type: "string" }
        },
        required: ["owner", "repo", "pull_number"]
      }
    },
    {
      name: "search_code",
      description: "Search code across one or more repositories for symbols or text matches.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          owner: { type: "string" },
          repo: { type: "string" }
        },
        required: ["query"]
      }
    },
    {
      name: "get_file_contents",
      description: "Read the contents of a file from a repository at a specific ref.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" }
        },
        required: ["owner", "repo", "path"]
      }
    },
    {
      name: "dispatch_workflow",
      description: "Trigger a GitHub Actions workflow dispatch with custom inputs.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          workflow_id: { type: "string" },
          ref: { type: "string" },
          inputs: { type: "object" }
        },
        required: ["owner", "repo", "workflow_id", "ref"]
      }
    },
    {
      name: "list_workflow_runs",
      description: "List recent workflow runs, statuses, conclusions, and metadata.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          workflow_id: { type: "string" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "delete_ref",
      description: "Delete a branch or git ref from a repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          ref: { type: "string" }
        },
        required: ["owner", "repo", "ref"]
      }
    }
  ]
};

export const COMPARISON_MANIFEST = {
  server: "browser-ops-mcp",
  tools: [
    {
      name: "open_page",
      description: "Open a browser page at a given URL and wait for it to finish loading.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          wait_until: { type: "string" }
        },
        required: ["url"]
      }
    },
    {
      name: "snapshot_dom",
      description: "Capture a DOM and accessibility snapshot for the current page.",
      inputSchema: {
        type: "object",
        properties: {
          include_accessibility: { type: "boolean" }
        }
      }
    },
    {
      name: "extract_table",
      description: "Extract a structured table from the current page into rows and columns.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string" }
        },
        required: ["selector"]
      }
    },
    {
      name: "download_csv",
      description: "Download a CSV export from the current browser session to local disk.",
      inputSchema: {
        type: "object",
        properties: {
          destination: { type: "string" },
          overwrite: { type: "boolean" }
        },
        required: ["destination"]
      }
    },
    {
      name: "fill_form",
      description: "Fill a browser form with structured input data and submit it.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string" },
          values: { type: "object" }
        },
        required: ["selector", "values"]
      }
    },
    {
      name: "take_screenshot",
      description: "Capture a screenshot of the current browser viewport.",
      inputSchema: {
        type: "object",
        properties: {
          full_page: { type: "boolean" }
        }
      }
    }
  ]
};

export const TASK_PRESETS = {
  review:
    "Triage new bug reports, inspect failing issues, read matching code, and comment with next steps without creating branches or merging changes.",
  coding:
    "Investigate a bug, read code, create a branch, update files, and open a draft pull request without merging or dispatching releases.",
  release:
    "Inspect release status, list workflow runs, dispatch the release workflow, and merge a ready pull request after validation.",
  browser:
    "Review browser automation traces, inspect failing steps, and keep only safe read-oriented debugging tools."
};

export const PROFILE_CONFIG = {
  balanced: {
    label: "Balanced",
    preferredCategories: ["repo", "issues", "code", "docs", "ci"],
    defaultLimit: 7,
    readBias: 0.8
  },
  "read-only": {
    label: "Read-only research",
    preferredCategories: ["repo", "code", "docs", "issues"],
    defaultLimit: 6,
    readBias: 1.6
  },
  coding: {
    label: "Safe coding",
    preferredCategories: ["code", "repo", "issues", "docs"],
    defaultLimit: 8,
    readBias: 0.5
  },
  release: {
    label: "Release operator",
    preferredCategories: ["ci", "deploy", "repo", "issues"],
    defaultLimit: 8,
    readBias: 0.2
  },
  browser: {
    label: "Browser automation",
    preferredCategories: ["browser", "auth", "data", "docs"],
    defaultLimit: 7,
    readBias: 1.2
  }
};

export const RISK_LIMITS = {
  low: 2,
  medium: 5,
  high: 100
};

export const CATEGORY_KEYWORDS = [
  ["issues", ["issue", "comment", "label", "triage"]],
  ["repo", ["repo", "repository", "branch", "ref", "pull", "commit"]],
  ["code", ["code", "file", "search", "symbol", "diff"]],
  ["ci", ["workflow", "run", "build", "check", "ci", "action"]],
  ["deploy", ["deploy", "release", "publish", "ship", "rollout"]],
  ["browser", ["browser", "page", "tab", "dom", "click", "form"]],
  ["auth", ["auth", "token", "credential", "secret", "session"]],
  ["docs", ["doc", "markdown", "read", "knowledge", "wiki"]],
  ["data", ["query", "sql", "table", "csv", "export", "report"]]
];

export const HIGH_RISK_WORDS = [
  "delete",
  "drop",
  "merge",
  "push",
  "deploy",
  "dispatch",
  "send",
  "write",
  "commit",
  "exec",
  "shell",
  "run",
  "publish"
];

export const MEDIUM_RISK_WORDS = [
  "create",
  "update",
  "edit",
  "comment",
  "approve",
  "close",
  "reopen"
];

export const READ_WORDS = ["get", "list", "read", "search", "fetch", "inspect", "view"];

export const COPY_LABELS = {
  allowlistOutput: "Copy allowlist",
  pythonOutput: "Copy Python",
  typescriptOutput: "Copy TypeScript",
  markdownOutput: "Copy markdown",
  reportOutput: "Copy JSON report",
  comparisonOutput: "Copy comparison report"
};
