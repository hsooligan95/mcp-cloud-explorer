#!/usr/bin/env node
/**
 * mcp-cloud-explorer
 *
 * A Model Context Protocol (MCP) server that exposes read-only tools over
 * LOCAL mock datasets for four cloud providers - AWS, Microsoft Azure,
 * Google Cloud, and Oracle Cloud Infrastructure (OCI). It never calls a
 * real cloud account: every dataset is synthetic, which makes the server
 * safe to run, demo, and test anywhere.
 *
 * The four tools are provider-agnostic: each takes a `provider` parameter
 * (default "aws") and returns the same normalized shape, with the
 * provider's own native service and region names inside the payload.
 * Providers are defined in src/providers.ts; datasets live in src/data/.
 *
 * Tools:
 *   list_resources      - list compute / storage / functions / database resources
 *   get_resource_detail - look up one resource by name
 *   get_cost_summary    - month-to-date cost by service, with deltas
 *   find_idle_resources - resources not used within a threshold of days
 *
 * Transport: stdio (the standard for local MCP servers).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  PROVIDER_IDS,
  RESOURCE_KINDS,
  getProvider,
  type ProviderId,
  type ResourceKind,
} from "./providers.js";

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

const providerParam = z
  .enum(PROVIDER_IDS)
  .default("aws")
  .describe(
    "Cloud provider to query: 'aws', 'azure', 'gcp', or 'oci'. " +
      "All datasets are local mock data.",
  );

function idleReason(r: {
  kind: ResourceKind;
  lastActivityDaysAgo: number;
  [key: string]: unknown;
}): string {
  const d = r.lastActivityDaysAgo;
  switch (r.kind) {
    case "storage":
      return `No access in ${d} days; ${r.sizeGB} GB stored`;
    case "functions":
      return `No invocations in ${d} days`;
    case "compute":
      return r.state === "stopped" || r.state === "deallocated"
        ? `Instance stopped for ${d} days`
        : `No recorded activity in ${d} days`;
    case "database":
      return `No recorded activity in ${d} days`;
  }
}

const server = new McpServer({
  name: "mcp-cloud-explorer",
  version: "2.0.0",
});

server.tool(
  "list_resources",
  "List resources for a cloud provider (mock data). Optionally filter by resource kind.",
  {
    provider: providerParam,
    resourceType: z
      .enum(["compute", "storage", "functions", "database", "s3", "lambda", "all"])
      .default("all")
      .describe(
        "Which resource kind to list: 'compute', 'storage', 'functions', " +
          "'database', or 'all'. ('s3' and 'lambda' are accepted as legacy " +
          "aliases for 'storage' and 'functions'.)",
      ),
  },
  async ({ provider, resourceType }) => {
    const data = getProvider(provider as ProviderId);
    const kind =
      resourceType === "s3"
        ? "storage"
        : resourceType === "lambda"
          ? "functions"
          : resourceType;
    const kinds = kind === "all" ? RESOURCE_KINDS : [kind as ResourceKind];
    const grouped: Record<string, unknown[]> = {};
    for (const k of kinds) {
      grouped[k] = data.resources.filter((r) => r.kind === k);
    }
    return textResult({
      provider: data.id,
      providerDisplayName: data.displayName,
      accountId: data.accountId,
      accountKind: data.accountKind,
      serviceNames: data.serviceNames,
      ...grouped,
    });
  },
);

server.tool(
  "get_resource_detail",
  "Get full details for a single resource by name, within one provider's mock dataset.",
  {
    provider: providerParam,
    name: z.string().describe("Exact resource name, e.g. 'demo-api-handler'"),
  },
  async ({ provider, name }) => {
    const data = getProvider(provider as ProviderId);
    const found = data.resources.find((r) => r.name === name);
    if (found) return textResult({ provider: data.id, ...found });
    return errorResult(
      `No resource named '${name}' in the mock ${data.displayName} dataset. ` +
        `Try list_resources with provider '${data.id}' to see what exists.`,
    );
  },
);

server.tool(
  "get_cost_summary",
  "Summarize mock cost by service for the current month, with the change versus last month.",
  {
    provider: providerParam,
  },
  async ({ provider }) => {
    const data = getProvider(provider as ProviderId);
    const rows = data.costByService.map((row) => ({
      service: row.service,
      currentMonthUsd: row.currentMonthUsd,
      previousMonthUsd: row.previousMonthUsd,
      changePct:
        row.previousMonthUsd === 0
          ? 0
          : Math.round(
              ((row.currentMonthUsd - row.previousMonthUsd) /
                row.previousMonthUsd) *
                1000,
            ) / 10,
    }));
    const totalCurrent = rows.reduce((sum, r) => sum + r.currentMonthUsd, 0);
    const totalPrevious = rows.reduce((sum, r) => sum + r.previousMonthUsd, 0);
    const topService = [...rows].sort(
      (a, b) => b.currentMonthUsd - a.currentMonthUsd,
    )[0];
    return textResult({
      provider: data.id,
      providerDisplayName: data.displayName,
      accountId: data.accountId,
      accountKind: data.accountKind,
      totalCurrentMonthUsd: Math.round(totalCurrent * 100) / 100,
      totalPreviousMonthUsd: Math.round(totalPrevious * 100) / 100,
      topService: topService.service,
      byService: rows,
    });
  },
);

server.tool(
  "find_idle_resources",
  "Find resources that look idle: resources of any kind not used within the given number of days.",
  {
    provider: providerParam,
    idleDaysThreshold: z
      .number()
      .int()
      .positive()
      .default(30)
      .describe("Days without use for a resource to count as idle"),
  },
  async ({ provider, idleDaysThreshold }) => {
    const data = getProvider(provider as ProviderId);
    const idle = data.resources
      .filter((r) => r.lastActivityDaysAgo >= idleDaysThreshold)
      .map((r) => ({
        kind: r.kind,
        service: r.service,
        name: r.name,
        region: r.region,
        daysSinceActivity: r.lastActivityDaysAgo,
        reason: idleReason(r),
      }));
    return textResult({
      provider: data.id,
      providerDisplayName: data.displayName,
      idleDaysThreshold,
      idleCount: idle.length,
      idleResources: idle,
    });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP protocol channel - log to stderr only.
  console.error(
    "mcp-cloud-explorer running on stdio (mock datasets: aws, azure, gcp, oci; read-only)",
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
