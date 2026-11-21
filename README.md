# mcp-aws-explorer

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server in
TypeScript that lets an AI assistant explore an AWS account's inventory and
costs through **read-only tools** — list resources, inspect one resource,
summarize cost by service, and find idle resources that are quietly costing
money.

It runs entirely against a **local mock dataset** (synthetic JSON, no real AWS
account, no credentials), so it is safe to run, demo, and test anywhere.

## What this demonstrates

- **Model Context Protocol (MCP)** server design with the official TypeScript SDK
- **Tool use / function calling** patterns for LLM agents: typed inputs (Zod), structured JSON outputs, explicit error results
- **TypeScript** on Node.js with stdio transport (the standard for local MCP servers)
- **AWS** domain modeling: S3, Lambda, and cost-by-service (Cost Explorer–style) data
- **Serverless / cloud cost visibility**: idle-resource detection, the same pattern used to find wasted spend in real accounts
- Safe-by-default engineering: read-only tools, no credentials, no network calls

## Architecture

```
MCP client (Claude Desktop, Cursor, an agent framework, ...)
        |  JSON-RPC over stdio
        v
src/index.ts  (McpServer, 4 tools, Zod-validated inputs)
        |
        v
src/data/mock-aws.json  (synthetic S3 buckets, Lambda functions, cost by service)
```

- `src/index.ts` — the server: tool definitions, handlers, stdio transport.
- `src/data/mock-aws.json` — the synthetic dataset. Swap this module for real
  AWS SDK calls (S3 `ListBuckets`, Lambda `ListFunctions`, Cost Explorer
  `GetCostAndUsage`) and the tool surface stays identical — that swap is the
  documented extension path.
- `scripts/smoke-test.mjs` — end-to-end test: spawns the server over stdio,
  performs the MCP initialize handshake, lists tools, and calls tools.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `list_resources` | `resourceType`: `s3` \| `lambda` \| `all` | Buckets and/or functions with region, size, runtime, usage signals |
| `get_resource_detail` | `name` | Full record for one bucket or function (explicit error if not found) |
| `get_cost_summary` | — | Current vs. previous month totals, per-service cost and % change, top service |
| `find_idle_resources` | `idleDaysThreshold` (default 30) | Buckets not accessed / functions not invoked within the threshold, each with a reason |

## Run it

```bash
npm install
npm run build
npm start          # speaks MCP over stdio; logs go to stderr
```

## Connect an MCP client

Example configuration (Claude Desktop `claude_desktop_config.json`, or any
MCP client that takes an `mcpServers` map):

```json
{
  "mcpServers": {
    "aws-explorer": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-aws-explorer/dist/index.js"]
    }
  }
}
```

Then ask the assistant things like:

- "What Lambda functions do I have, and which runtimes are they on?"
- "What did I spend this month, and what changed versus last month?"
- "Find resources that have been idle for 60+ days."

## Test

```bash
npm run build
npm run smoke
```

The smoke test spawns the compiled server, completes the MCP handshake,
verifies all four tools are listed, and calls `find_idle_resources` and
`get_cost_summary` against the mock dataset.

Verified output:

```
PASS: initialize handshake (server: mcp-aws-explorer)
PASS: tools/list includes list_resources
PASS: tools/list includes get_resource_detail
PASS: tools/list includes get_cost_summary
PASS: tools/list includes find_idle_resources
PASS: find_idle_resources found idle resources (count=4)
PASS: find_idle_resources flags demo-legacy-backups-2019
PASS: get_cost_summary totals $319.25 across 6 services

All smoke tests passed.
```

## License

MIT
