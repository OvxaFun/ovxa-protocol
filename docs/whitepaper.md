# Ovxa whitepaper

Version 0.1, working draft.

## 1. Summary

Ovxa is a protocol on Solana that gives every participating token a fixed place on a shared grid. A place is called a cell. A cell is bound to one outside signal, such as a price series or a measured quantity, and the protocol records how that cell moves against its signal.

The grid is the product. It turns a pile of unrelated tokens into one readable surface where the question "what is this token tied to, and how closely does it follow?" has a public answer.

## 2. Problem

Tokens on Solana are cheap to create and hard to compare. Two tokens may claim a link to the same real-world thing and offer nothing to check the claim. Readers fall back on stories.

Ovxa replaces stories with records. A cell states its signal once, and the ledger keeps every later observation.

## 3. Model

### 3.1 Cells

A cell is a program-owned account. It holds:

- the mint of the token that claimed it,
- a signal identifier,
- the position of the cell on the grid,
- a rolling set of observations.

A mint can hold one cell at a time. A cell cannot change its signal after it is bound. Switching signals means releasing the cell and claiming a new one, which starts a fresh history.

### 3.2 Signals

A signal is a named series that lives outside the chain. Signals are listed in a public catalogue. Each entry names the origin of the data, the update rhythm and the party that publishes it.

The protocol does not pretend a signal is trustless. The catalogue states plainly who can change a reading and how the reading can be audited.

### 3.3 Observations

Observations are transactions. Each one carries the signal value, the slot at which it was read and a short proof or reference supplied by the publisher. Validators order these transactions like any other, which gives every observation a position in Solana's history.

### 3.4 The grid

Cells sit on a square lattice. Position has no price. It exists so that readers can scan the surface, group related signals and spot cells that have gone quiet.

## 4. Trust model

Three parties can influence a cell:

1. The token holder group that claimed it, who choose the signal.
2. The signal publisher, who supplies readings.
3. The program upgrade authority, while one exists.

Ovxa keeps the third party small and temporary. The roadmap describes how upgrade rights move to cell holders. Until then the authority is named in the site's records.

## 5. What Ovxa is not

- It is not a promise that a token will track its signal.
- It is not a venue. It does not match orders.
- It does not hold user funds.

## 6. Open questions

- How should the protocol treat a publisher that stops reporting?
- What proof formats can be checked cheaply enough on chain?
- How should related cells be grouped without creating a ranking that people mistake for advice?

These questions stay open until the program is deployed and observed in use.
