---
mode: agent
description: Write tests for a named module in mcp-cloud-explorer
---

Write tests for the module I name, following this repo's existing test
style, layout, and fixtures. Cover the behavior the module documents,
including these invariants where they apply:

- Tools are READ-ONLY by design; never add a mutating tool or any code path that writes anywhere.
- The mock dataset is the only data source: no cloud SDK calls, no network, no credentials.
- The tool surface (names, schemas, output shapes) must stay identical if the data module is ever swapped for real SDK calls.

Then run the test suite:

    npm run build && npm run smoke   # the smoke test is the gate

Show the result. Do not claim done unless the suite is green; if a
test cannot pass, say why instead of weakening the assertion.
