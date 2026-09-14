# AGENTS — phygital-wallet-sdk

Kit client for the **phygital-wallet** Solana program. Prefer exports from the package root (`phygital-wallet-sdk`). Do not deep-import internal `wallet/*` or `wallet-standard/*` modules.

## Routing

| Goal                                   | Use                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sign a spend or CPI as the wallet PDA  | `getPhygitalWalletSigner(rpc, phygitalTokenPda, options?)`                                  |
| Register a discoverable browser wallet | `registerPhygitalWallet({ rpc, … })` once at startup                                        |
| Authenticate an accessory manually     | `startAuthentication` + `verifyResponse` + `findPhygitalTokenPda` from `phygital-token-sdk` |
| Manage authority or wallet policy      | Generated `getSet*Instruction` / `getClear*Instruction` builders                            |
| Decode program state or derive PDAs    | Generated Codama `fetch*`, `decode*`, and `find*Pda` helpers                                |

## Mental model

1. A verified secp256r1 accessory key derives the **phygital token PDA**.
2. The phygital token PDA derives the **wallet PDA**.
3. The on-chain Authority account identifies the ed25519 authority used by the policy-preview instruction. It is distinct from the fee payer.
4. `getPhygitalWalletSigner` compacts the caller's instructions and simulates `execute_with_authority_using_policies` before requesting a passkey assertion.
5. After a successful preview, it builds `secp256r1 verify` + `execute`, applies compute/priority-fee settings, refreshes the recent blockhash when needed, and requests the fee-payer signature.
6. The final on-chain `execute` repeats policy checks and commits applicable counters. Simulation never commits state.

There is no connect-proof endpoint, verifier resolution, bearer session, or `getAccessToken` in the current signer flow.

## Direct signer

```ts
import { getPhygitalWalletSigner } from "phygital-wallet-sdk";

const walletSigner = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  fetch, // optional HTTP override for the default fee payer
  feePayer, // optional TransactionPartialSigner; independent of authority
  onPhaseChange,
});
```

`onPhaseChange` values are `preparing`, `previewing`, `awaitingPasskey`, `building`, `feePaying`, and `complete`.

Constraints:

- Exactly one transaction per `modifyAndSignTransactions` call.
- A lifetime constraint is required.
- Durable nonce transactions are unsupported and rejected before preview/authentication; use a recent blockhash.
- Without a configured `feePayer`, fetch its address from `https://api.revibase.com/getFeePayer` and use the corresponding `/sign` endpoint.
- Legacy, v0, and v1 messages are supported. V1 resource limits use message config rather than ComputeBudget instructions.
- Preserve the caller's non-wallet signatures. The wallet PDA itself cannot produce an outer ed25519 signature.
- Propagate abort signals through RPC and fee-payer requests.

## Policy preview

- Preview with `execute_with_authority_using_policies`, not `execute_with_authority`.
- Build the preview authority from `Authority.header.authority`; do not substitute the fee payer.
- The preview authority is a no-op signer identity. Simulation skips transaction signature verification but executes the program's authority and policy checks.
- The wallet/authority accounts must remain writable because policy execution may update spend counters.
- Add the passkey verification compute buffer when converting preview estimates into final limits.
- Fetch independent pre-passkey data concurrently where possible: policy simulation, recent priority fees, slot hash, and latest blockhash.
- Do not request the passkey if policy simulation fails.

## Wallet Standard

```ts
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc, feePayer }); // feePayer is optional
```

- Wallet name: **Revibase**.
- Browser connect uses a fresh random challenge with `startAuthentication`, verifies locally with `verifyResponse`, then derives the token PDA using `findPhygitalTokenPda`.
- Never trust a token PDA supplied by an authentication response; derive it from the verified secp256r1 public key.
- Failed local verification must leave the wallet disconnected and must not persist state.
- Persist only `{ phygitalTokenPda, walletPda }` under `revibase:wallet-standard:v3` for refresh restoration.
- Silent connect never initiates an accessory tap.
- `solana:signMessage` must throw: the wallet account is a PDA and cannot produce an ed25519 message signature.
- Default chains are mainnet only unless explicitly overridden for testing.

## Generated program client

Use generated Codama helpers rather than hand-rolling discriminators or compact instruction layouts. Relevant instructions include:

- `execute`: passkey-authenticated execution with policies
- `executeWithAuthority`: authority execution without policy enforcement
- `executeWithAuthorityUsingPolicies`: authority execution with the same policies as `execute`; used by SDK preview simulation
- `setAuthority` / `clearAuthority`
- `setWalletPolicy` / `clearWalletPolicy`

The wallet and any policy-counter account that can change must be writable.

## Tests and validation

From the repository root:

```bash
pnpm --filter phygital-wallet-sdk test
pnpm --filter phygital-wallet-sdk build
```

For Rust/Anchor commands, set `NO_DNA=1`.

## Do not

- Reintroduce the deleted `wallet/connect.ts`, verifier bearer flow, or stale TokenVerifier/Config helpers.
- Permit durable nonce transactions in `getPhygitalWalletSigner`.
- Put the wallet PDA in an outer-signature role.
- Treat `solana:signMessage` as SIWS support.
- Deep-import internal wrap, fee-payer, signer-support, or session modules.

## Orientation

```text
src/index.ts                    public API
src/wallet/signer.ts            Kit modifying signer
src/wallet/wrap-transaction.ts  policy preview and execute wrapping
src/wallet/feePayer.ts          default/custom fee-payer integration
src/wallet-standard/            Wallet Standard registration and local session
src/generated/                  Codama client
README.md                       integration guide
```
