/**
 * Thin adapters over Codama-generated identify + parse helpers.
 */
import type { Instruction } from "@solana/instructions";

export type AddressLike = string | { toString(): string };

export function addressString(a: AddressLike): string {
  return typeof a === "string" ? a : String(a);
}

/**
 * Minimum shape of a Codama program-level parse result.
 * Some instructions (e.g. Token `Batch`) omit accounts/data.
 */
export type ParsedProgramIx<TInstructionType = string | number> = {
  programAddress?: string;
  instructionType: TInstructionType;
  accounts?: unknown;
  data?: unknown;
};

export type ProgramAdapter<TParsed extends ParsedProgramIx = ParsedProgramIx> =
  {
    programAddress: string;
    tryParse(ix: Instruction): TParsed | undefined;
  };

/**
 * Matcher for a single Codama instruction branch.
 */
export type InstructionMatcher<
  TParsed extends ParsedProgramIx = ParsedProgramIx
> = {
  readonly kind: "instruction";
  readonly programAddress: string;
  readonly instructionType: TParsed["instructionType"];
  readonly adapter: ProgramAdapter;
  tryMatch(ix: Instruction): TParsed | undefined;
};

export type CodamaProgram<
  TEnum extends string | number,
  TParsed extends ParsedProgramIx<TEnum>
> = ProgramAdapter<TParsed> & {
  instruction<TType extends TEnum>(
    type: TType
  ): InstructionMatcher<Extract<TParsed, { instructionType: TType }>>;
};

export type FromCodamaProgramOptions<
  TEnum extends string | number,
  TParsed extends ParsedProgramIx<TEnum>
> = {
  programAddress: AddressLike;
  // Codama identify signatures vary slightly across Kit versions — keep loose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  identify: (instruction: any) => TEnum;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (instruction: any) => TParsed;
};

/**
 * Wrap Codama identify + parse into a fail-closed program adapter.
 */
export function fromCodamaProgram<
  TEnum extends string | number,
  TParsed extends ParsedProgramIx<TEnum>
>(
  options: FromCodamaProgramOptions<TEnum, TParsed>
): CodamaProgram<TEnum, TParsed> {
  const programAddress = addressString(options.programAddress);

  const adapter: ProgramAdapter<TParsed> = {
    programAddress,
    tryParse(ix: Instruction): TParsed | undefined {
      if (addressString(ix.programAddress) !== programAddress) return undefined;
      if (!ix.data) return undefined;
      try {
        options.identify(ix as Instruction & { data: Uint8Array });
        return options.parse(ix);
      } catch {
        return undefined;
      }
    },
  };

  return Object.assign(adapter, {
    instruction<TType extends TEnum>(
      type: TType
    ): InstructionMatcher<Extract<TParsed, { instructionType: TType }>> {
      type Matched = Extract<TParsed, { instructionType: TType }>;
      return {
        kind: "instruction",
        programAddress,
        instructionType: type,
        adapter,
        tryMatch(ix: Instruction): Matched | undefined {
          const parsed = adapter.tryParse(ix);
          if (!parsed || parsed.instructionType !== type) return undefined;
          return parsed as Matched;
        },
      };
    },
  });
}
