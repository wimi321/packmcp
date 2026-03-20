# PackMCP

![PackMCP social card](./assets/social-card.svg)

![CI](https://github.com/wimi321/packmcp/actions/workflows/ci.yml/badge.svg)

PackMCP helps you build smaller, safer MCP toolsets for real tasks.

Instead of handing every tool to the agent, PackMCP lets you:

- inspect a `tools/list` manifest or raw tool array
- estimate how much tool metadata costs in context tokens
- spot risky write, merge, deploy, or dispatch tools early
- score tools against a concrete task and pack profile
- generate a reusable PackMCP pack JSON with only the selected tools
- export a tighter allowlist for Python and TypeScript runtimes
- run the same analysis from the CLI for scripts and CI
- compare two MCP manifests before migration or rollout
- analyze a real `mcp.json` server through the official MCP Inspector CLI

## Why this matters

As of `2026-03-20`, MCP is already broad enough that the problem is no longer just connection setup. The more common problem is tool overload:

- too many tools in the prompt
- too many side-effecting actions exposed by default
- too little clarity about what the agent actually needs

PackMCP is built for that layer.

## What the current version does

- local-first static UI
- task-aware tool scoring
- risk classification and warning cards
- recommended pack generation by profile and risk budget
- copyable exports for allowlists and SDK filters
- reusable pack artifact export for downstream enforcement or review flows
- optional multi-manifest comparison mode
- official MCP Inspector CLI integration for live server analysis
- sample manifest and testable core logic

## Quickstart

```bash
npm start
```

Then open `http://localhost:4174`.

You can also run the tests:

```bash
npm test
```

You can run a CLI analysis too:

```bash
npm run analyze:sample
```

Or generate a reusable pack artifact:

```bash
npm run pack:sample
```

And compare two manifests:

```bash
npm run compare:sample
```

You can also exercise the Inspector path with a fixture:

```bash
npm run inspect:sample
```

## Project structure

- `index.html` app shell
- `styles.css` visual design
- `src/app.js` browser UI controller
- `src/core.js` scoring, recommendation, export logic
- `src/data.js` presets and sample data
- `src/inspector.js` MCP Inspector CLI bridge
- `examples/github-mcp-server.sample.json` example input
- `test/core.test.mjs` regression tests
- `scripts/serve.mjs` zero-dependency dev server
- `bin/packmcp.mjs` CLI entrypoint

## Example use cases

- Give a coding agent read-only GitHub tools for issue triage.
- Trim a huge MCP server down before wiring it into OpenAI Agents or Claude.
- Review a vendor MCP manifest and surface high-risk tools before rollout.
- Compare how much schema/token cost you save by curating a smaller pack.
- Generate a structured JSON report in CI before approving an MCP server rollout.
- Compare two MCP servers or two versions of the same server before migration.
- Pull a real server's `tools/list` through MCP Inspector and analyze it immediately.

## Design principles

- local-first by default
- no framework lock-in
- explain the recommendation, not just the output
- keep the core logic pure and testable
- export artifacts that are easy to paste into real runtimes
- work both as a browser product and a command-line utility

## Current boundaries

- no live MCP transport or proxy yet
- no schema compression beyond lightweight heuristics
- no client-specific config generators beyond simple snippets
- no browser-based comparison history yet

## CLI example

```bash
packmcp analyze \
  --input ./examples/github-mcp-server.sample.json \
  --preset review \
  --profile balanced \
  --risk medium \
  --format json
```

Write the output to a file:

```bash
packmcp analyze \
  --input ./examples/github-mcp-server.sample.json \
  --preset coding \
  --profile coding \
  --risk medium \
  --format json \
  --output ./packmcp-report.json
```

Generate a filtered PackMCP pack artifact you can re-import later:

```bash
packmcp analyze \
  --input ./examples/github-mcp-server.sample.json \
  --preset review \
  --profile balanced \
  --risk medium \
  --format pack \
  --output ./github-review.pack.json
```

Compare two manifests:

```bash
packmcp compare \
  --left ./examples/github-mcp-server.sample.json \
  --right ./examples/browser-ops.sample.json \
  --preset coding \
  --profile coding \
  --risk medium \
  --format json
```

Analyze a real `mcp.json` server entry through MCP Inspector:

```bash
packmcp inspect \
  --config ./examples/mcp.json.sample \
  --server github \
  --preset review \
  --profile balanced \
  --risk medium \
  --format json \
  --timeout 45000 \
  --manifest-output ./inspector-tools.json
```

This command follows the official Inspector CLI shape using `--cli --config ... --server ... --method tools/list`.

PackMCP applies a `30000ms` Inspector timeout by default so CI and local scripts do not hang forever if the target server fails to boot. Pass `--timeout 0` to disable the guardrail for slower servers.

The bundled `examples/mcp.json.sample` file uses placeholder credentials. Use real values for a live run, or stick with `npm run inspect:sample` for an offline fixture-based smoke test.

The `pack` export keeps the selected tools in a normalized `{ server, tools }`-compatible shape, so you can version it in git, feed it back into PackMCP later, or hand it off to a future runtime proxy layer.

## Next upgrades

- add direct Inspector export import in the browser UI
- add runtime proxy mode for enforcement
- compare multiple manifests side by side with diff history
- improve token estimation using schema-aware compression rules
- generate client-specific configs for more runtimes
