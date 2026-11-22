---
mode: agent
description: Review the current diff against mcp-cloud-explorer's invariants
---

Review my current diff against this repo's invariants:

- Tools are READ-ONLY by design; never add a mutating tool or any code path that writes anywhere.
- The mock dataset is the only data source: no cloud SDK calls, no network, no credentials.
- The tool surface (names, schemas, output shapes) must stay identical if the data module is ever swapped for real SDK calls.
- Tool inputs are Zod-validated; failures return explicit structured error results rather than throwing across the wire.

Flag every violation with file and line. Also flag any change that
alters a documented behavior contract (output shapes, exit codes,
event schemas, recorded artifacts) without updating the docs and
tests that describe it. No style nitpicks — correctness and contract
violations only.
