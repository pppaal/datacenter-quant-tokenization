# Day 01: Private Chain Basics

This note is for understanding what "our own private blockchain network" means in the context of this repository.

## 1. One-Line Definition

A private blockchain network is a group of servers you control that keep the same ledger and agree before the ledger changes.

## 2. Compare It To A Normal App

Normal app:

- Next.js app
- PostgreSQL database
- One owner controls writes

Private chain:

- Next.js app
- PostgreSQL database
- Multiple blockchain nodes
- Nodes agree before a write is accepted

The database still exists. The blockchain does not replace the app. It becomes the official shared ledger for important state changes.

## 3. The Five Core Terms

### Node

A node is a server running blockchain software.

It can:

- store the chain state
- receive transactions
- talk to other nodes
- verify blocks

### Validator

A validator is a node allowed to approve new blocks.

In your target design, validators are the critical servers that decide which transactions become final.

### Transaction

A transaction is a request to change chain state.

Examples for this repo:

- register an asset
- anchor a document hash
- record an approval event

### Block

A block is a batch of accepted transactions.

You can think of it as one signed page added to the ledger.

### RPC Node

An RPC node is the entry point your app talks to.

Your Next.js app usually sends requests to an RPC node, not directly to every validator.

## 4. Why Multiple Nodes Matter

If one server writes the ledger, that is just a normal database with extra steps.

Multiple nodes matter because:

- one server can fail and the network still works
- one server cannot silently rewrite history
- multiple operators can share the same official record

## 5. What Consensus Means

Consensus is the rule for deciding whether a new block is accepted.

For a private EVM network, you are targeting QBFT through Hyperledger Besu.

Simple mental model:

1. a transaction is submitted
2. validators inspect it
3. enough validators sign off
4. the block becomes final

That is the main difference from PostgreSQL, where one server can immediately commit a write.

## 6. What Goes Onchain In This Project

Good onchain data:

- asset identifier
- document hash
- important approval event
- distribution record

Bad onchain data:

- full PDF files
- valuation models
- extracted document text
- quant calculations
- private internal notes

Reason:

- onchain data should be small, durable, auditable
- offchain data should handle heavy storage and computation

## 7. How This Repo Fits The Model

This repository already has the beginnings of the split:

- offchain app: `apps/web`
- contract layer: `packages/contracts`

Current contract:

- `packages/contracts/src/DataCenterAssetRegistry.sol`

Current app-side integration points:

- `apps/web/lib/services/readiness.ts`
- `apps/web/app/api/registry/assets/[id]/register/route.ts`
- `apps/web/app/api/registry/assets/[id]/anchor/route.ts`

## 8. The Real Flow In Plain English

When an operator uploads a diligence document:

1. the file is stored offchain
2. the server computes a SHA-256 hash
3. the app sends a blockchain transaction
4. validators approve the transaction
5. the hash becomes part of the official ledger
6. the returned tx hash is saved in Postgres

So the blockchain stores proof, not the full document.

## 9. What "Owning Our Network" Actually Means

It does not mean inventing Ethereum from scratch.

It means you control:

- the validator nodes
- the chain configuration
- the permissioning rules
- the deployed contracts
- the application connected to the chain

That is already "your network."

## 10. Minimum Target Topology

Start with:

- 4 validator nodes
- 1 RPC node
- 1 bootnode

Later add:

- explorer
- monitoring
- backups
- external signer

## 11. Today’s Goal

By the end of Day 01 you should be able to say this out loud:

"Our private chain is a set of validator servers we control. They maintain the same ledger and approve important asset and document events before they become final."

## 12. Self-Test

If you cannot answer these, reread the note.

1. What is the difference between a node and a validator?
2. Why is a blockchain not the same as a normal database?
3. Why do we put document hashes onchain instead of PDFs?
4. Why does the app talk to an RPC node?
5. What does it mean to own a private chain network?

## 13. Tomorrow

Day 02 should cover:

- validator vs RPC vs bootnode in more detail
- how blocks are actually finalized
- why Besu + QBFT fits this project
