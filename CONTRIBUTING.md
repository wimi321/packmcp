# Contributing

PackMCP is intentionally small and easy to reason about. Contributions work best when they preserve that clarity.

## Development

```bash
npm start
npm test
```

## Good contribution targets

- improve MCP manifest compatibility
- make risk heuristics more explicit and reviewable
- improve export targets for common agent runtimes
- add better examples from real MCP servers
- improve accessibility and clarity in the browser UI

## Pull request guidelines

- keep changes focused
- include or update tests when logic changes
- explain behavior changes in the pull request body
- prefer simple heuristics over opaque magic

## Philosophy

PackMCP should stay:

- local-first
- easy to audit
- useful without a backend
- clear about why it recommends a tool pack
