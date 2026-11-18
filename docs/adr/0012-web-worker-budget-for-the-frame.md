# ADR 0012: the web Worker's budget for one address and one frame

**Status:** accepted, 17 November 2026 (owner decision).

Two steps grow the web Worker past the 255 KiB the owner set in Platform STEP 12 (ADR 0004). In Platform STEP 19, everything people use moves to one address: the old app host now redirects with a 308, and the "Mis rutas" link is added to pages after the edge cache. In Platform STEP 23, every signed-in page gets one frame: the side panel and the pages Inicio, Comunidad and Avisos. Both are pages and Worker code the web Worker has to carry.

## The numbers

Gzip, as `wrangler deploy --dry-run` reports it on CI:

| Web Worker | Size | Budget |
| --- | --- | --- |
| main before STEP 19 | 254.05 KiB | 255 KiB |
| with STEP 19 | 255.71 KiB | 255 KiB |
| with STEP 23 | 269.76 KiB | 285 KiB |

260 KiB would not hold STEP 23. 285 KiB leaves about 15 KiB above it.

## Decision

The owner raises the web Worker's budget to 285 KiB. The API Worker stays at 315 KiB, as ADR 0011 set it. The agent Worker stays at 615 KiB and the MCP Worker at 500 KiB.

## Alternatives not taken

- **260 KiB.** It holds STEP 19 but not STEP 23, and STEP 23 is the frame the owner approved.
- **Trimming STEP 23's pages and copy.** That would change a design the reviewer built and the owner approved.

## Consequences

Cloudflare's own limits are still far away: 64 MiB uncompressed and 1 s of startup. The storefront's budgets (no blocking JavaScript, Lighthouse) are separate and unchanged. The size check keeps failing the build on any growth past 285 KiB, and the next raise needs the same record: the before and after numbers, and why.
