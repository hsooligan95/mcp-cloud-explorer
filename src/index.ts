#!/usr/bin/env node
/**
 * mcp-aws-explorer
 *
 * A Model Context Protocol (MCP) server that exposes read-only tools over a
 * LOCAL mock AWS dataset (src/data/mock-aws.json). It never calls a real AWS
 * account: the dataset is synthetic, which makes the server safe to run,
 * demo, and test anywhere.
 *
 * Tools:
 *   list_resources      - list S3 buckets and/or Lambda functions
 *   get_resource_detail - look up one resource by name
 *   get_cost_summary    - month-to-date cost by service, with deltas
 *   find_idle_resources - resources not used within a threshold of days
 *
 * Transport: stdio (the standard for local MCP servers).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dataset from "./data/mock-aws.json" with { type: "json" };

type Bucket = (typeof dataset.s3Buckets)[number];
type LambdaFn = (typeof dataset.lambdaFunctions)[number];

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

const server = new McpServer({
  name: "mcp-aws-explorer",
  version: "1.0.0",
});

server.tool(
  "list_resources",
  "List resources in the mock AWS account. Optionally filter by resource type.",
  {
    resourceType: z
      .enum(["s3", "lambda", "all"])
      .default("all")
      .describe("Which resource type to list: 's3', 'lambda', or 'all'"),
  },
  async ({ resourceType }) => {
    const result: { s3Buckets?: Bucket[]; lambdaFunctions?: LambdaFn[] } = {};
    if (resourceType === "s3" || resourceType === "all") {
      result.s3Buckets = dataset.s3Buckets;
    }
    if (resourceType === "lambda" || resourceType === "all") {
      result.lambdaFunctions = dataset.lambdaFunctions;
    }
    return textResult({ accountId: dataset.accountId, ...result });
  },
);

server.tool(
  "get_resource_detail",
  "Get full details for a single S3 bucket or Lambda function by name.",
  {
    name: z.string().describe("Exact resource name, e.g. 'demo-api-handler'"),
  },
  async ({ name }) => {
    const bucket = dataset.s3Buckets.find((b) => b.name === name);
    if (bucket) return textResult({ type: "s3", ...bucket });
    const fn = dataset.lambdaFunctions.find((f) => f.name === name);
    if (fn) return textResult({ type: "lambda", ...fn });
    return errorResult(
      `No resource named '${name}' in the mock dataset. ` +
        `Try list_resources to see what exists.`,
    );
  },
);

server.tool(
  "get_cost_summary",
  "Summarize mock AWS cost by service for the current month, with the change versus last month.",
  {},
  async () => {
    const rows = dataset.costByService.map((row) => ({
      service: row.service,
      currentMonthUsd: row.currentMonthUsd,
      previousMonthUsd: row.previousMonthUsd,
      changePct:
        Math.round(
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
      accountId: dataset.accountId,
      totalCurrentMonthUsd: Math.round(totalCurrent * 100) / 100,
      totalPreviousMonthUsd: Math.round(totalPrevious * 100) / 100,
      topService: topService.service,
      byService: rows,
    });
  },
);

server.tool(
  "find_idle_resources",
  "Find resources that look idle: S3 buckets not accessed and Lambda functions not invoked within the given number of days.",
  {
    idleDaysThreshold: z
      .number()
      .int()
      .positive()
      .default(30)
      .describe("Days without access/invocation for a resource to count as idle"),
  },
  async ({ idleDaysThreshold }) => {
    const idleBuckets = dataset.s3Buckets
      .filter((b) => b.lastAccessedDaysAgo >= idleDaysThreshold)
      .map((b) => ({
        type: "s3",
        name: b.name,
        region: b.region,
        daysSinceAccess: b.lastAccessedDaysAgo,
        sizeGB: b.sizeGB,
        reason: `No access in ${b.lastAccessedDaysAgo} days; ${b.sizeGB} GB stored`,
      }));
    const idleFunctions = dataset.lambdaFunctions
      .filter((f) => f.lastInvokedDaysAgo >= idleDaysThreshold)
      .map((f) => ({
        type: "lambda",
        name: f.name,
        region: f.region,
        daysSinceInvocation: f.lastInvokedDaysAgo,
        reason: `No invocations in ${f.lastInvokedDaysAgo} days`,
      }));
    return textResult({
      idleDaysThreshold,
      idleCount: idleBuckets.length + idleFunctions.length,
      idleResources: [...idleBuckets, ...idleFunctions],
    });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP protocol channel - log to stderr only.
  console.error("mcp-aws-explorer running on stdio (mock dataset, read-only)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
