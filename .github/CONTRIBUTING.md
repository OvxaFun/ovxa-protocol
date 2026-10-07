# Contributing to Ovxa

Thanks for taking a look. This repository holds the public site and the written design for Ovxa.

## Ground rules

1. **Facts live in the register.** If a detail comes from outside the repository, such as an address, a link or a figure, it belongs in `src/register.json` with a state and a source. Do not hard-code it in markup or scripts.
2. **No guessed links.** A record that is not stated must not produce an `href`.
3. **Colour comes from tokens.** Colour literals belong in `src/css/tokens.css` only, and each one must be a real pixel from an image in `brand/` or `reference/`, with its coordinate beside it.
4. **No dates on the page.** Timestamps stay in the register.

## Workflow

```
npm install
npm run build
npm run gates
```

Open a pull request when `npm run gates` exits with code 0. Describe what changed and why in a few plain sentences.

## Style

- Plain modules, no framework, no bundler.
- Match the surrounding code: naming, comment density and idiom.
- Comments explain why, not what.
- Keep the page working without scripts as far as content goes.

## Writing

Documents are written in plain, direct English. Prefer short sentences and concrete nouns.

## Reporting problems

Bugs go in the issue tracker once it is linked from the site. Security problems follow [SECURITY.md](SECURITY.md) instead.
