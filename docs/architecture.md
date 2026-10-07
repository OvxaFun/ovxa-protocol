# Ovxa architecture

## Parts

```
          public RPC            public indexers
              |                      |
   getSlot ---+                      +--- chain TVL (DefiLlama)
              |                      +--- pool list (DexScreener)
              v                      v
        +---------------------------------+
        |        static site (dist/)      |
        |  register -> gate -> rendering  |
        +---------------------------------+
```

There is no server of our own. The site is plain files. All dynamic data is fetched by the visitor's browser from public endpoints.

## Site

### Register

`src/register.json` holds one record per external fact. A record has a state (`stated`, `absent` or `unconfirmed`), the fact itself, a source note and an internal timestamp. The build copies only the state and the fact into the page. Source notes and timestamps never leave the repository.

### Gates

Two small modules decide what the page may show.

- `gate.js` turns the contract record into a view. A stated address that is a base58 string of 32 to 44 characters becomes a copy button. Anything else becomes an inert placeholder. The check never rejects a string just for how it looks beyond that rule.
- `links.js` turns a social record into an icon. The record stores a URL. The handle is derived from it. A record that is not stated produces an icon with no `href`.

Both modules are pure and shared between the build and the browser, so the build output and the runtime agree.

### Live readings

| Reading | Endpoint | Cadence |
| ------- | -------- | ------- |
| Slot | Solana RPC `getSlot` | every 2.5 seconds |
| Chain TVL | DefiLlama chains list | every minute |
| Pools | DexScreener boosted tokens, then their pools | every 30 seconds |

Each reading runs through one poller. After a failure the poller waits for an exponentially growing, jittered delay. When the tab is hidden it stops, and it resumes at once when the tab returns. A failed reading shows a dash.

### Health pill

The slot poll drives the pill. No answer yet means Connecting. Fresh answers mean Live. Repeated misses mean Offline.

### Motion

Hero field, load wipe, parallax, reveals and count-ups are all skipped under `prefers-reduced-motion`. The matrix canvas also pauses when it leaves the viewport or the tab is hidden.

### Security headers

`dist/_headers` carries a content security policy that names every origin the page talks to: the RPC host, DefiLlama, DexScreener, the DexScreener image host and Google Fonts. Scripts and styles are served from the site itself, with no inline code.

## Protocol (design)

The on-chain side is described in the whitepaper. In short: one program, one account per cell, and observations written as ordinary transactions. The program is not deployed yet, which is why the contract slot is inert.

## Build

`tools/build.mjs` copies `src/` to `dist/`, renders the register-dependent pieces into the page and writes the headers file. `tools/gates.mjs` rebuilds into temporary folders with synthetic registers to exercise both branches of every gate.
