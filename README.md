# Ovxa

Ovxa is a protocol on Solana. Each token takes one cell on a shared grid, each cell follows one outside signal, and every update is written to the ledger where anyone can replay it.

This repository holds the public site for [ovxa.fun](https://ovxa.fun): a static page that shows live Solana readings and carries the project's records.

## What the site does

- Shows the current Solana slot, polled from a public RPC endpoint.
- Shows a chain health pill (Live, Connecting or Offline) driven by that same poll.
- Shows total value locked for the chain, matched by the `solana` slug on DefiLlama.
- Shows a board of busy Solana pools from DexScreener, with logos, price and 24 hour volume.
- Keeps a contract slot at the top of the page. The slot is inert until an address is stated.

Every live reading backs off with jitter after a failure, falls back to a dash, and stops polling while the tab is hidden.

## Records, not claims

Every external fact lives in one record in [`src/register.json`](src/register.json) with a state of `stated`, `absent` or `unconfirmed`.

| Record   | State  | Effect on the page |
| -------- | ------ | ------------------ |
| contract | absent | Slot shows a placeholder and cannot be copied |
| x        | absent | Icon renders, no link |
| github   | absent | Icon renders, no link |

To state a fact, edit its record and rebuild. Links store the full URL and the handle is derived from it. An address is accepted when it is any base58 string between 32 and 44 characters.

## Build

```
npm install
npm run build     # writes dist/
npm run gates     # builds fixtures, runs every gate, exits non-zero on failure
```

`dist/` is the whole deploy. Drag it onto Cloudflare Pages. The `_headers` file inside carries the content security policy.

`npm run assets` regenerates the logo sizes and favicon from the files in `brand/`. It is only needed when those files change.

## Layout

```
brand/        logo source files
reference/    banner and layout references
src/          page, styles, scripts, register
tools/        build, asset prep, gates
docs/         whitepaper, tokenomics, roadmap, architecture
dist/         build output
```

## Colour

All colour literals live in [`src/css/tokens.css`](src/css/tokens.css). Each value is a real pixel from the brand or reference images, and the coordinate is recorded beside it. The gates re-read those pixels on every run.

## Licence

MIT. See [LICENSE](LICENSE).
