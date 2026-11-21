#!/usr/bin/env node
/**
 * Smoke test: spawn the compiled MCP server over stdio, run the MCP
 * initialize handshake, list tools, and call find_idle_resources.
 * Exits non-zero on any failure. Run `npm run build` first.
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

const init = await request("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "1.0.0" },
});
assert(
  init.result?.serverInfo?.name === "mcp-aws-explorer",
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

const idle = await request("tools/call", {
  name: "find_idle_resources",
  arguments: { idleDaysThreshold: 30 },
});
const idlePayload = JSON.parse(idle.result.content[0].text);
assert(idlePayload.idleCount >= 2, `find_idle_resources found idle resources (count=${idlePayload.idleCount})`);
assert(
  idlePayload.idleResources.some((r) => r.name === "demo-legacy-backups-2019"),
  "find_idle_resources flags demo-legacy-backups-2019",
);

const cost = await request("tools/call", {
  name: "get_cost_summary",
  arguments: {},
});
const costPayload = JSON.parse(cost.result.content[0].text);
assert(
  costPayload.totalCurrentMonthUsd > 0 && costPayload.byService.length === 6,
  `get_cost_summary totals $${costPayload.totalCurrentMonthUsd} across ${costPayload.byService.length} services`,
);

console.log("\nAll smoke tests passed.");
proc.kill();
process.exit(0);
