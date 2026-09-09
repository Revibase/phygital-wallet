# From IDL to policy (Codama)

`phygital-verifier-sdk` does **not** ship program parsers. You generate a
[Solana Kit](https://www.solanakit.com/) client from your program IDL with
[Codama](https://github.com/codama-idl/codama), then wrap the generated
`identify*` / `parse*` helpers with `fromCodamaProgram`.

This guide is the path from a raw IDL to a working `policy(…).verify(…)`.

Official references:

- [Codama](https://github.com/codama-idl/codama)
- [Solana docs — Codama clients](https://solana.com/docs/programs/codama/clients)
- [`@codama/renderers-js`](https://github.com/codama-idl/renderers-js)

---

## What you need from Codama

For each program you gate, the generated Kit client must export:

| Symbol | Role |
|--------|------|
| `*_PROGRAM_ADDRESS` | Program id constant |
| `*Instruction` enum | Instruction discriminant (e.g. `TokenInstruction.TransferChecked`) |
| `identify*Instruction` | Map wire `Instruction` → enum branch |
| `parse*Instruction` | Typed `{ accounts, data, instructionType }` |

Builders (`get*Instruction`), account `fetch*` / `decode*`, PDAs, and errors are
optional for policy. Prefer trimming them away for smaller bundles (step 5).

---

## 1. Get an IDL

Codama accepts **Codama IDLs** and **Anchor IDLs** (via
`@codama/nodes-from-anchor`).

| Source | Typical path |
|--------|----------------|
| Anchor | `target/idl/<program_name>.json` after `anchor build` |
| Shank / Codama macros | Your program’s published JSON IDL |
| On-chain / vendor | Copy into the repo (record URL + version beside the file) |

Example layout:

```text
your-app/
  idl/
    my_program.json
  package.json
```

---

## 2. Install Codama

From the project root (pnpm shown; npm/yarn work the same):

```bash
pnpm add -D codama @codama/renderers-js @codama/nodes-from-anchor
```

| Package | Why |
|---------|-----|
| `codama` | CLI (`codama init`, `codama run`) + `createFromRoot` |
| `@codama/renderers-js` | Emits Kit TypeScript clients |
| `@codama/nodes-from-anchor` | Converts Anchor IDL JSON → Codama root (CLI uses this when needed) |

Optional (for trimming unused instructions before render):

```bash
pnpm add -D @codama/visitors
```

Also install the runtime the generated client imports (renderer default):

```bash
pnpm add @solana/kit
```

And this SDK:

```bash
pnpm add phygital-verifier-sdk
```

---

## 3. Create `codama.json`

Interactive (recommended the first time):

```bash
pnpm exec codama init
# or: npx codama init
```

You will be asked:

1. **Where is your IDL?** — e.g. `idl/my_program.json`
2. **Which script preset?** — choose **Generate JavaScript client** (skip Rust unless you need it)
3. **Where should the JavaScript code be generated?** — e.g. `packages/js/my-program`

`init` may offer to install the packages from step 2 if they are missing.

Or write the config by hand (matches this monorepo’s wallet client):

```json
{
  "idl": "idl/my_program.json",
  "before": [],
  "scripts": {
    "js": {
      "from": "@codama/renderers-js",
      "args": [
        "packages/js/my-program",
        {
          "formatCode": true,
          "syncPackageJson": true,
          "kitImportStrategy": "rootOnly"
        }
      ]
    }
  }
}
```

Notes on `args`:

- The **first** argument is the **package folder** (where `package.json` lives).
  `@codama/renderers-js` writes generated sources under that folder’s
  `src/generated/` by default.
- `syncPackageJson: true` creates/updates that package’s dependencies for Kit.
- `kitImportStrategy: "rootOnly"` keeps imports on `@solana/kit` (and Kit
  subpaths) instead of many granular `@solana/*` packages.

Add a script to `package.json`:

```json
{
  "scripts": {
    "generate:client": "codama run js"
  }
}
```

---

## 4. Generate the client

```bash
pnpm exec codama run js
# or all scripts: pnpm exec codama run --all
```

You should see files such as:

```text
packages/js/my-program/
  package.json          # if syncPackageJson
  src/generated/
    programs/
      myProgram.ts      # PROGRAM_ADDRESS, identify*, parse*, *Instruction
    instructions/
      …
    …
```

Open the program module and confirm the four symbols from the table above exist.
Names follow the IDL program name (e.g. `identifyMyProgramInstruction`,
`MyProgramInstruction`, `MY_PROGRAM_PROGRAM_ADDRESS`).

Re-run `codama run js` whenever the IDL changes. Do not hand-edit
`src/generated/`.

---

### Import hygiene

In policy code, import **named** `identify*` / `parse*` / enums — avoid
`export *` barrels on hot paths so bundlers can tree-shake unused builders.

---

## 5. Wire into `phygital-verifier-sdk`

```ts
import {
  fromCodamaProgram,
  allow,
  aggregate,
  policy,
} from "phygital-verifier-sdk";
import {
  MY_PROGRAM_PROGRAM_ADDRESS,
  MyProgramInstruction,
  identifyMyProgramInstruction,
  parseMyProgramInstruction,
} from "../packages/js/my-program/src/generated"; // adjust to your package exports

const my = fromCodamaProgram({
  programAddress: MY_PROGRAM_PROGRAM_ADDRESS,
  identify: identifyMyProgramInstruction,
  parse: parseMyProgramInstruction,
});

const gate = policy([
  allow(my.instruction(MyProgramInstruction.DoThing), (ix) => {
    // Codama-typed accounts + data
    return ix.data.amount <= 1_000_000n;
  }),
  aggregate(
    [
      {
        matcher: my.instruction(MyProgramInstruction.DoThing),
        amount: (ix) => ix.data.amount,
      },
    ],
    { lte: 5_000_000n },
  ),
]);

const result = gate.verify(instructions);
if (!result.ok) {
  console.error(result.code, result.message, result.details);
}
```

Predicates receive Codama’s parsed shape (`accounts`, `data`, `instructionType`) —
not a verifier-specific field map.

See [Writing policies](./writing-policies.md) and
[Verify results](./verify-and-errors.md).

---

## 7. Checklist

1. IDL on disk (Anchor or Codama JSON)
2. `pnpm add -D codama @codama/renderers-js @codama/nodes-from-anchor`
3. `codama init` (or hand-written `codama.json`)
4. `codama run js` → `identify*` / `parse*` / `*Instruction` / `*_PROGRAM_ADDRESS`
5. `fromCodamaProgram` + `allow` / `deny` / `aggregate` + `policy(…).verify(…)`

Do **not** use a verifier-specific IDL→`tryDecode` generator or hand-rolled
discriminators. If a helper is missing, regenerate or extend Codama output.

---