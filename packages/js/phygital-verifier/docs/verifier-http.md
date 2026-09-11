# Verifier HTTP Contract

A phygital verifier is an HTTP service that implements five endpoints. The
service may be operated by Revibase or by a third party. The verifier selected
for a token is the service that issues the bearer used for that token's
`/preview` and `/sign` requests.

For a runnable, framework-agnostic reference that wires all five endpoints
with the SDK, see [the verifier scaffold](./scaffold.md).

## Endpoint Summary

| Method | Path           | Access                           | Purpose                                             |
| ------ | -------------- | -------------------------------- | --------------------------------------------------- |
| `GET`  | `/health`      | Public                           | Confirm that the verifier is live.                  |
| `POST` | `/connect`     | Public                           | Verify a WebAuthn/NFC assertion and issue a bearer. |
| `POST` | `/connect/tap` | Public, Revibase app origin only | Verify a dynamic NFC tap and issue a bearer.        |
| `POST` | `/preview`     | Bearer required                  | Authorize a transaction preview.                    |
| `POST` | `/sign`        | Bearer required                  | Co-sign a transaction.                              |

All JSON error responses should use this shape where applicable:

```json
{
  "error": "Human-readable message",
  "code": "machine_readable_code"
}
```

## `GET /health`

Public liveness check used before a token verifier is configured.

Successful response:

```json
{ "ok": true }
```

Return a non-2xx response when the service cannot accept connect, preview, or
sign requests.

## `POST /connect`

Public and callable by the Revibase app or a third-party integration. This is
the portable WebAuthn connect contract.

Request:

```json
{
  "blockhash": "recent Solana blockhash",
  "response": "WebAuthn AuthenticationResponseJSON"
}
```

The `blockhash` is the WebAuthn challenge. The verifier must:

1. Verify that the assertion signed exactly the supplied blockhash.
2. Check that the blockhash is still valid.
3. Derive the phygital token PDA from the assertion's passkey public key.
4. Check the WebAuthn sign counter for replay.
5. Check that the derived PDA matches the verifier's token context.
6. Issue a short-lived bearer signed by the configured verifier key.

The verifier derives the token PDA from `response.id` with
`findPhygitalTokenPda(response.id)`. The client does not provide a token PDA.

Successful response:

```json
{
  "accessToken": "opaque verifier bearer",
  "tokenType": "Bearer",
  "expiresAt": 0,
  "expiresIn": 900,
  "phygitalToken": "token PDA"
}
```

Typical failures include `invalid_proof`, `passkey_invalid`,
`stale_blockhash`, `assertion_replay`, `token_mismatch`, `no_verifier`, and
`verifier_mismatch`.

## `POST /connect/tap`

Public to the network, but browser requests must be restricted to the Revibase
application origin (`https://app.revibase.com`; local development origins may be
allowed by deployment configuration). This endpoint is intended for the
Revibase app's dynamic NFC URL flow.

Request:

```json
{
  "pk": "base64url accessory identifier",
  "s": "base64url raw 64-byte ECDSA signature",
  "c": "uint32 counter as a decimal string",
  "n": "base64url 8-byte nonce"
}
```

`pk` is the accessory identifier from the NFC URL, not the token PDA or the
token's on-chain `secp256r1PublicKey` field. Its current encoding is a
base64url-encoded compressed P-256 key, which the verifier also uses to check
the tap signature. The signed message is `counter (4-byte big-endian) || nonce
(8 bytes)`. The verifier must:

1. Verify the P-256 signature.
2. Resolve the token from the accessory identifier `pk`.
3. Check that the counter is strictly newer than the stored counter.
4. Check that the resolved PDA matches the verifier's token context.
5. Issue a short-lived bearer signed by the configured verifier key.

The response has the same shape as `/connect`.

## `POST /preview`

Requires:

```http
Authorization: Bearer <accessToken>
```

Request:

```json
{
  "instructions": [
    {
      "programAddress": "base58 program address",
      "accounts": [{ "address": "base58 account address", "role": 0 }],
      "data": "base64 instruction data"
    }
  ]
}
```

The verifier must validate the bearer before reading the request body for
authorization. The bearer payload identifies the phygital token; callers must
not supply a separate token PDA. The verifier then applies its policy and
returns either:

```json
{ "ok": true, "intentHash": "hex or base64url intent hash" }
```

or a structured policy failure containing `ok: false`, `code`, `error`, and
`soft`.

## `POST /sign`

Requires the same bearer header as `/preview`.

Request:

```json
{
  "transactions": ["base64 wire transaction"]
}
```

The verifier must derive the token context from the validated bearer, apply its
fee and policy checks, and return:

```json
{ "signatures": ["base64 transaction signature", "..."] }
```

It must never sign solely because a bearer is valid. Any additional owner or
operation authorization required by the verifier remains mandatory.

## Bearer and Origin Rules

The bearer is signed by the verifier key and binds these claims:

- `sub`: phygital token PDA;
- `iss`: verifier public key;
- `origin`: canonical origin that established the session, or `null` for a
  non-browser client;
- `exp`: expiration time;
- `jti`: unique bearer identifier.

`/preview` and `/sign` must validate the bearer signature, expiration, and
on-chain authorization of `iss` for `sub`. They must also require the request's
canonical `Origin` to exactly match the bearer `origin` claim. A missing request
origin matches only a bearer with `origin: null`; a bearer cannot be reused from
another browser origin.

## Implementation Guidance

The security invariant is that the bearer's `sub` must be the token derived
from the proof's own identifier — the assertion passkey for `/connect`, or the
accessory id `pk` for `/connect/tap` — never a value the client supplies. A
front-end router may extract that token first only to locate the token-specific
verifier; treat it as untrusted and re-derive inside the verifier boundary
unless the router performed exactly the same trusted on-chain resolution.
