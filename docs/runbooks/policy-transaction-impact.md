# Deterministic policy transaction impact

## Boundary

`treasury.simulation.v2` is an immutable decision-support snapshot. The current implementation performs deterministic integer arithmetic over explicitly supplied offline inputs. It does not call `eth_estimateGas`, read a wallet balance, sign, broadcast, submit a Proposal, vote, or move assets.

Every result therefore records `sourceMode=MOCK_DETERMINISTIC_INPUT` and `onchainEstimateVerified=false`. These labels must remain visible wherever the result is presented. A later RPC adapter must create a distinct, confirmed source mode; it must not silently replace or relabel existing snapshots.

## Frozen impact

The request supplies decimal integer strings, each limited to 78 digits:

- estimated gas units;
- maximum fee per gas in wei;
- native balance before the transaction in wei;
- token balance before the transaction in base units;
- proposed transfer amount in base units.

AEOS computes maximum gas cost as `gas units × max fee`, native balance after maximum gas, and token balance after transfer. The transaction value is fixed to zero for the supported ERC-20 transfer action. A product exceeding 78 digits is rejected rather than rounded.

## Fail-closed checks

- Gas units and transfer amount must be greater than zero.
- Native balance must cover maximum gas cost.
- Token balance must cover the exact transfer amount.
- Evidence, freshness, quality, conflict, adjustment, slippage, liquidity, turnover, target and selector checks continue to run independently.
- Any failed check produces `BLOCKED`, forces `suggestedAdjustmentBps=0`, and leaves an insufficient after-balance as `null` rather than a negative or wrapped value.
- Proposal Builder accepts only `treasury.simulation.v2` and requires its transfer amount to equal both the Simulation input and frozen transaction-impact value.

The resulting Proposal remains a DRAFT with `governanceAuthorization=NOT_SUBMITTED` and `assetExecutionAuthorized=false`. Confirmed RPC estimation and balances remain separate future evidence and do not weaken the later Preflight, Governor, Guard or Safe controls.
