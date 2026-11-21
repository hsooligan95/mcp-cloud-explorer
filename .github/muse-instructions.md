# Copilot instructions — mcp-aws-explorer

You are working in **mcp-aws-explorer**, a Model Context Protocol server
in TypeScript that lets an AI assistant explore an AWS account's
inventory and costs through four read-only tools, running entirely
against a local mock dataset — no real AWS account, no credentials.

## Stack

- TypeScript (strict) on Node.js, official MCP TypeScript SDK, Zod for
  tool input validation, stdio transport.
- `src/index.ts` — the server: tool definitions and handlers.
- `src/data/mock-aws.json` — the synthetic dataset (S3, Lambda,
  cost-by-service).

## Tests

```bash
npm run build     # tsc
npm run smoke     # spawns the built server over stdio and exercises the tools end to end
npm start         # node dist/index.js
```

There is no unit-test suite; the smoke test is the gate — keep it green.

## Architecture notes

- Tools are READ-ONLY by design (list resources, inspect one resource,
  summarize cost by service, find idle resources). Never add a
  mutating tool or a code path that writes anywhere.
- The mock dataset is the only data source: no AWS SDK calls, no
  network, no credentials. The documented extension path swaps the
  data module for real SDK calls — the tool surface (names, schemas,
  output shapes) must stay identical when that happens.
- Tool inputs are Zod-validated; failures return explicit structured
  error results rather than throwing across the wire.

## Shared rules

- Use Unix LF line endings in every file; never CRLF.
- Never commit secrets, tokens, or credentials — real or synthetic-looking.
- Tests must pass before you describe a change as complete; run the test
  command above and report honestly if you cannot.
- Prefer the smallest complete implementation: reuse what already exists in
  this repo before adding new code, files, or dependencies.
