/**
 * Wrap an IDL-generated module (`PROGRAM_ID`, `tryDecode`, `FIELD_SCHEMA`)
 * as a `ProgramParser` for createVerifier / defineProgram.
 *
 * When layouts are present, builds a first-byte disc index for O(bucket)
 * identity before full tryDecode.
 */
import type { Instruction } from "@solana/instructions";
import type {
  FieldSchemaEntry,
  FieldValue,
  ParsedIx,
  ProgramParser,
} from "../core/types.js";
import type { InstructionLayout } from "../core/layout.js";
import { discEq } from "./codec-readers.js";
import { ixData } from "../core/compile-policy.js";

export type GeneratedIx = {
  name: string;
  fields: Record<string, FieldValue>;
};

type GeneratedMod = {
  PROGRAM_ID: string;
  tryDecode: (
    data: Uint8Array,
    accounts: readonly { address: string }[],
  ) => GeneratedIx | null;
  FIELD_SCHEMA: readonly FieldSchemaEntry[];
  INSTRUCTION_LAYOUTS?: readonly InstructionLayout[];
};

type DiscBucket = { disc: Uint8Array; name: string };

function buildFirstByteIndex(
  layouts: readonly InstructionLayout[] | undefined,
): Map<number, DiscBucket[]> | null {
  if (!layouts?.length) return null;
  const byFirst = new Map<number, DiscBucket[]>();
  for (const lay of layouts) {
    if (lay.discriminator.length === 0) continue;
    const b0 = lay.discriminator[0]!;
    const list = byFirst.get(b0) ?? [];
    list.push({ disc: lay.discriminator, name: lay.name });
    byFirst.set(b0, list);
  }
  for (const [, list] of byFirst) {
    list.sort((a, b) => b.disc.length - a.disc.length);
  }
  return byFirst;
}

function identifyByLayouts(
  data: Uint8Array,
  index: Map<number, DiscBucket[]>,
): string | null {
  if (data.length === 0) return null;
  const bucket = index.get(data[0]!);
  if (!bucket) return null;
  for (const e of bucket) {
    if (discEq(data, e.disc)) return e.name;
  }
  return null;
}

/** Wrap IDL-generated tryDecode as a ProgramParser. */
export function fromGenerated(
  mod: GeneratedMod,
  mapFields?: (decoded: GeneratedIx) => GeneratedIx,
  layouts?: readonly InstructionLayout[],
): ProgramParser {
  const resolvedLayouts = layouts ?? mod.INSTRUCTION_LAYOUTS;
  const discIndex = buildFirstByteIndex(resolvedLayouts);
  const layoutCount = resolvedLayouts?.length ?? 0;
  const layoutsComplete =
    layoutCount > 0 && layoutCount >= mod.FIELD_SCHEMA.length;

  return {
    programId: mod.PROGRAM_ID,
    fieldSchema: mod.FIELD_SCHEMA,
    layouts: resolvedLayouts,
    parse(ix: Instruction): ParsedIx {
      const data = ixData(ix);
      const accounts = ix.accounts ?? [];

      if (discIndex && layoutsComplete && !identifyByLayouts(data, discIndex)) {
        return {
          programId: ix.programAddress,
          instructionName: "Unknown",
          fields: {},
        };
      }

      const decoded = mod.tryDecode(data, accounts);
      if (!decoded) {
        return {
          programId: ix.programAddress,
          instructionName: "Unknown",
          fields: {},
        };
      }
      const mapped = mapFields ? mapFields(decoded) : decoded;
      return {
        programId: ix.programAddress,
        instructionName: mapped.name,
        fields: mapped.fields,
      };
    },
  };
}
