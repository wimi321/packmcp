# Security

PackMCP is a local-first planning tool. It does not currently proxy or execute MCP tools at runtime, but it does process tool manifests that may describe sensitive operations.

## Reporting a vulnerability

If you find a security issue, please open a private GitHub security advisory or contact the maintainer privately before opening a public issue.

## Scope notes

- Treat uploaded manifests as sensitive when they expose internal tool names or schemas.
- Review generated allowlists before using them in production.
- Do not assume PackMCP's current risk heuristics are a substitute for a formal security review.
