# Copilot instructions — mcp-cloud-explorer

You are working in **mcp-cloud-explorer**, a Model Context Protocol server
in TypeScript that lets an AI assistant explore cloud inventory and costs
through four read-only, provider-agnostic tools. It covers AWS, Microsoft
Azure, Google Cloud, and Oracle Cloud Infrastructure (OCI), running
entirely against local mock datasets — no real cloud accounts, no
credentials.

## Stack

- TypeScript (strict) on Node.js, official MCP TypeScript SDK, Zod for
  tool input validation, stdio transport.
- `src/index.ts` — the server: tool definitions and handlers. Tools take
  a `provider` parameter (default `aws`) and never branch on a cloud.
- `src/providers.ts` — the provider registry: every provider exposes the
  same normalized dataset shape; native service/region naming lives in
  the data, not the tool code.
- `src/data/mock-{aws,azure,gcp,oci}.json` — the synthetic datasets. The
  AWS file predates the normalized schema and is adapted in
  `src/providers.ts`; the other three are written in the schema directly.

## Tests

```bash
npm run build     # tsc
npm run smoke     # spawns the built server over stdio and exercises every tool against every provider
npm start         # node dist/index.js
```

There is no unit-test suite; the smoke test is the gate — keep it green.

## Architecture notes

- Tools are READ-ONLY by design (list resources, inspect one resource,
  summarize cost by service, find idle resources). Never add a
  mutating tool or a code path that writes anywhere.
- The mock datasets are the only data source: no cloud SDK calls, no
  network, no credentials. The documented extension path swaps a
  provider's data module for real SDK calls — the tool surface (names,
  schemas, output shapes) must stay identical when that happens.
- Provider-agnostic by construction: a new provider is a new dataset in
  the normalized schema plus one registry entry — never a new tool or a
  provider branch in a handler.
- Tool inputs are Zod-validated; failures return explicit structured
  error results rather than throwing across the wire.

## Shared rules

- Use Unix LF line endings in every file; never CRLF.
- Never commit secrets, tokens, or credentials — real or synthetic-looking.
- Tests must pass before you describe a change as complete; run the test
  command above and report honestly if you cannot.
- Prefer the smallest complete implementation: reuse what already exists in
  this repo before adding new code, files, or dependencies.
