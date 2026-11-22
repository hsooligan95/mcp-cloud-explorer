# mcp-cloud-explorer

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server in
TypeScript that lets an AI assistant explore a cloud account's inventory and
costs through **read-only, provider-agnostic tools** — list resources,
inspect one resource, summarize cost by service, and find idle resources
that are quietly costing money.

It covers four providers — **AWS, Microsoft Azure, Google Cloud, and Oracle
Cloud Infrastructure (OCI)** — through one tool surface. Every tool takes a
`provider` parameter (default `aws`) and returns the same normalized shape,
with the provider's own native service and region names inside the payload
(Amazon EC2 / Azure Virtual Machines / Google Compute Engine / OCI Compute,
and so on).

It runs entirely against **local mock datasets** (synthetic JSON — no real
cloud accounts, no credentials, no network calls), so it is safe to run,
demo, and test anywhere. The data is mock; only the tool design is real.

> Formerly `mcp-aws-explorer`: the AWS-only name undersold the design.
> The tools were never AWS-shaped — the datasets are. (The code, package,
> and docs have been renamed to match; the GitHub repository rename is
> following — until it lands, this repo still answers to the old name.)

## What this demonstrates

- **Model Context Protocol (MCP)** server design with the official TypeScript SDK
- **Provider-agnostic tool design**: one registry, one normalized dataset schema; providers differ in data, never in tool code
- **Tool use / function calling** patterns for LLM agents: typed inputs (Zod), structured JSON outputs, explicit error results
- **Multi-cloud domain modeling**: compute, storage, functions, and database resources plus cost-by-service data, in each cloud's own naming flavor
- **Serverless / cloud cost visibility**: idle-resource detection, the same pattern used to find wasted spend in real accounts
- Safe-by-default engineering: read-only tools, no credentials, no network calls

## Architecture

```
MCP client (Claude Desktop, Cursor, an agent framework, ...)
        |  JSON-RPC over stdio
        v
src/index.ts      (McpServer, 4 tools, Zod-validated inputs, provider param)
        |
        v
src/providers.ts  (registry: every provider in one normalized schema)
        |
        +-- src/data/mock-aws.json    (EC2, S3, Lambda, RDS + cost)
        +-- src/data/mock-azure.json  (VMs, Blob Storage, Functions, Azure SQL + cost)
        +-- src/data/mock-gcp.json    (Compute Engine, Cloud Storage, Cloud Functions, Cloud SQL + cost)
        +-- src/data/mock-oci.json    (Compute, Object Storage, Functions, Autonomous Database + cost)
```

- `src/index.ts` — the server: tool definitions, handlers, stdio transport.
  Handlers never branch on a provider; they read the registry.
- `src/providers.ts` — the registry and the normalized schema. Adding a
  provider is a new dataset plus one registry entry — never a new tool.
  The AWS dataset predates the schema (it is the fullest), so it is adapted
  here; the other three are written in the schema directly.
- `src/data/mock-*.json` — the synthetic datasets. Swap one provider's data
  module for real SDK calls (AWS SDK, Azure SDK, Google Cloud client
  libraries, OCI SDK) and the tool surface stays identical — that swap is
  the documented extension path.
- `scripts/smoke-test.mjs` — end-to-end test: spawns the server over stdio,
  performs the MCP initialize handshake, lists tools, and exercises every
  tool against every provider.

## Tools

All four tools accept `provider`: `aws` | `azure` | `gcp` | `oci`
(default `aws`).

| Tool | Input | Returns |
| --- | --- | --- |
| `list_resources` | `provider`, `resourceType`: `compute` \| `storage` \| `functions` \| `database` \| `all` | Resources grouped by kind, with native service names (`s3`/`lambda` remain as legacy aliases for `storage`/`functions`) |
| `get_resource_detail` | `provider`, `name` | Full record for one resource (explicit error if not found in that provider) |
| `get_cost_summary` | `provider` | Current vs. previous month totals, per-service cost and % change, top service |
| `find_idle_resources` | `provider`, `idleDaysThreshold` (default 30) | Resources of any kind not used within the threshold, each with a reason |

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
    "cloud-explorer": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-cloud-explorer/dist/index.js"]
    }
  }
}
```

Then ask the assistant things like:

- "What Azure VMs do I have, and what sizes are they?"
- "What did I spend on Google Cloud this month, and what changed versus last month?"
- "Find OCI resources that have been idle for 60+ days."
- "Compare idle resources across all four providers."

## Test

```bash
npm run build
npm run smoke
```

The smoke test spawns the compiled server, completes the MCP handshake,
verifies all four tools are listed, then runs a tool × provider matrix —
every tool against every provider's dataset — plus the default-provider
and legacy-alias behavior.

Verified output:

```
PASS: initialize handshake (server: mcp-cloud-explorer)
PASS: tools/list includes list_resources
PASS: tools/list includes get_resource_detail
PASS: tools/list includes get_cost_summary
PASS: tools/list includes find_idle_resources
PASS: aws: list_resources returns 15 resources across 4 kinds
PASS: aws: native compute service name is 'Amazon EC2'
PASS: aws: list_resources kind filter returns storage only
PASS: aws: get_resource_detail finds 'demo-api-handler' (AWS Lambda)
PASS: aws: get_resource_detail errors explicitly on an unknown name
PASS: aws: get_cost_summary totals $319.25 across 6 services
PASS: aws: find_idle_resources flags demo-legacy-backups-2019 (idle=5)
PASS: azure: list_resources returns 6 resources across 4 kinds
PASS: azure: native compute service name is 'Azure Virtual Machines'
PASS: azure: list_resources kind filter returns storage only
PASS: azure: get_resource_detail finds 'demo-order-processor' (Azure Functions)
PASS: azure: get_resource_detail errors explicitly on an unknown name
PASS: azure: get_cost_summary totals $458.5 across 5 services
PASS: azure: find_idle_resources flags demolegacyarchive/backups-2019 (idle=2)
PASS: gcp: list_resources returns 6 resources across 4 kinds
PASS: gcp: native compute service name is 'Google Compute Engine'
PASS: gcp: list_resources kind filter returns storage only
PASS: gcp: get_resource_detail finds 'demo-image-resizer' (Google Cloud Functions)
PASS: gcp: get_resource_detail errors explicitly on an unknown name
PASS: gcp: get_cost_summary totals $273.7 across 5 services
PASS: gcp: find_idle_resources flags demo-cold-archive-bucket (idle=2)
PASS: oci: list_resources returns 6 resources across 4 kinds
PASS: oci: native compute service name is 'OCI Compute'
PASS: oci: list_resources kind filter returns storage only
PASS: oci: get_resource_detail finds 'demo-event-processor' (OCI Functions)
PASS: oci: get_resource_detail errors explicitly on an unknown name
PASS: oci: get_cost_summary totals $229.9 across 5 services
PASS: oci: find_idle_resources flags demo-legacy-exports (idle=2)
PASS: default provider is aws (total $319.25)
PASS: default find_idle_resources scans aws (idle=5)
PASS: legacy resourceType 's3' still maps to storage

All smoke tests passed.
```

## License

MIT
