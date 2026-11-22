#!/usr/bin/env node
/**
 * Smoke test: spawn the compiled MCP server over stdio, run the MCP
 * initialize handshake, list tools, then exercise every tool against
 * every provider dataset (aws, azure, gcp, oci), plus the default
 * provider and the legacy AWS aliases. Exits non-zero on any failure.
 * Run `npm run build` first.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const proc = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
});

const pending = new Map();
let nextId = 1;

const rl = createInterface({ input: proc.stdout });
rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), 10000);
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
}

function notify(method, params = {}) {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    proc.kill();
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

async function callTool(name, args) {
  const res = await request("tools/call", { name, arguments: args });
  return res.result;
}

function payload(result) {
  return JSON.parse(result.content[0].text);
}

const init = await request("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "1.0.0" },
});
assert(
  init.result?.serverInfo?.name === "mcp-cloud-explorer",
  `initialize handshake (server: ${init.result?.serverInfo?.name})`,
);
notify("notifications/initialized");

const tools = await request("tools/list");
const names = tools.result.tools.map((t) => t.name);
for (const expected of [
  "list_resources",
  "get_resource_detail",
  "get_cost_summary",
  "find_idle_resources",
]) {
  assert(names.includes(expected), `tools/list includes ${expected}`);
}

// Per-provider expectations, straight from the mock datasets.
const MATRIX = [
  {
    provider: "aws",
    computeService: "Amazon EC2",
    resourceCount: 15,
    detailName: "demo-api-handler",
    detailKind: "functions",
    idleName: "demo-legacy-backups-2019",
    costServices: 6,
  },
  {
    provider: "azure",
    computeService: "Azure Virtual Machines",
    resourceCount: 6,
    detailName: "demo-order-processor",
    detailKind: "functions",
    idleName: "demolegacyarchive/backups-2019",
    costServices: 5,
  },
  {
    provider: "gcp",
    computeService: "Google Compute Engine",
    resourceCount: 6,
    detailName: "demo-image-resizer",
    detailKind: "functions",
    idleName: "demo-cold-archive-bucket",
    costServices: 5,
  },
  {
    provider: "oci",
    computeService: "OCI Compute",
    resourceCount: 6,
    detailName: "demo-event-processor",
    detailKind: "functions",
    idleName: "demo-legacy-exports",
    costServices: 5,
  },
];

for (const row of MATRIX) {
  const p = row.provider;

  const all = payload(
    await callTool("list_resources", { provider: p, resourceType: "all" }),
  );
  const total =
    all.compute.length +
    all.storage.length +
    all.functions.length +
    all.database.length;
  assert(
    all.provider === p && total === row.resourceCount,
    `${p}: list_resources returns ${total} resources across 4 kinds`,
  );
  assert(
    all.serviceNames.compute === row.computeService,
    `${p}: native compute service name is '${row.computeService}'`,
  );

  const storageOnly = payload(
    await callTool("list_resources", { provider: p, resourceType: "storage" }),
  );
  assert(
    storageOnly.storage.length > 0 && storageOnly.compute === undefined,
    `${p}: list_resources kind filter returns storage only`,
  );

  const detail = payload(
    await callTool("get_resource_detail", { provider: p, name: row.detailName }),
  );
  assert(
    detail.name === row.detailName && detail.kind === row.detailKind,
    `${p}: get_resource_detail finds '${row.detailName}' (${detail.service})`,
  );

  const missing = await callTool("get_resource_detail", {
    provider: p,
    name: "no-such-resource",
  });
  assert(
    missing.isError === true,
    `${p}: get_resource_detail errors explicitly on an unknown name`,
  );

  const cost = payload(await callTool("get_cost_summary", { provider: p }));
  assert(
    cost.provider === p &&
      cost.totalCurrentMonthUsd > 0 &&
      cost.byService.length === row.costServices,
    `${p}: get_cost_summary totals $${cost.totalCurrentMonthUsd} across ${cost.byService.length} services`,
  );

  const idle = payload(
    await callTool("find_idle_resources", {
      provider: p,
      idleDaysThreshold: 30,
    }),
  );
  assert(
    idle.idleCount >= 1 &&
      idle.idleResources.some((r) => r.name === row.idleName),
    `${p}: find_idle_resources flags ${row.idleName} (idle=${idle.idleCount})`,
  );
}

// Default provider is aws when the parameter is omitted.
const defaultCost = payload(await callTool("get_cost_summary", {}));
assert(
  defaultCost.provider === "aws" &&
    defaultCost.totalCurrentMonthUsd === 319.25 &&
    defaultCost.byService.length === 6,
  `default provider is aws (total $${defaultCost.totalCurrentMonthUsd})`,
);

const defaultIdle = payload(
  await callTool("find_idle_resources", { idleDaysThreshold: 30 }),
);
assert(
  defaultIdle.provider === "aws" && defaultIdle.idleCount === 5,
  `default find_idle_resources scans aws (idle=${defaultIdle.idleCount})`,
);

// Legacy AWS aliases from the pre-generalization tool surface still work.
const legacy = payload(
  await callTool("list_resources", { provider: "aws", resourceType: "s3" }),
);
assert(
  legacy.storage.length === 5 && legacy.compute === undefined,
  "legacy resourceType 's3' still maps to storage",
);

console.log("\nAll smoke tests passed.");
proc.kill();
process.exit(0);
