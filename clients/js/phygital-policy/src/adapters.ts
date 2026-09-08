/**
 * Codama adapters for policy programs (from vendored IDLs).
 */
import { fromCodamaProgram } from "phygital-verifier-sdk";
import {
  SYSTEM_PROGRAM_ADDRESS,
  SystemInstruction,
  identifySystemInstruction,
  parseSystemInstruction,
} from "./generated/system/programs/system.js";
import {
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
  identifyTokenInstruction,
  parseTokenInstruction,
} from "./generated/token/programs/token.js";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  Token2022Instruction,
  identifyToken2022Instruction,
  parseToken2022Instruction,
} from "./generated/token-2022/programs/token2022.js";
import {
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS,
  AssociatedTokenAccountInstruction,
  identifyAssociatedTokenAccountInstruction,
  parseAssociatedTokenAccountInstruction,
} from "./generated/associated-token/programs/associatedTokenAccount.js";
import {
  TOKEN_METADATA_PROGRAM_ADDRESS,
  TokenMetadataInstruction,
  identifyTokenMetadataInstruction,
  parseTokenMetadataInstruction,
} from "./generated/token-metadata/programs/tokenMetadata.js";
import {
  BUBBLEGUM_PROGRAM_ADDRESS,
  BubblegumInstruction,
  identifyBubblegumInstruction,
  parseBubblegumInstruction,
} from "./generated/bubblegum/programs/bubblegum.js";
import {
  MPL_CORE_PROGRAM_PROGRAM_ADDRESS,
  MplCoreProgramInstruction,
  identifyMplCoreProgramInstruction,
  parseMplCoreProgramInstruction,
} from "./generated/mpl-core/programs/mplCoreProgram.js";

export const system = fromCodamaProgram({
  programAddress: SYSTEM_PROGRAM_ADDRESS,
  identify: identifySystemInstruction,
  parse: parseSystemInstruction,
});

export const token = fromCodamaProgram({
  programAddress: TOKEN_PROGRAM_ADDRESS,
  identify: identifyTokenInstruction,
  parse: parseTokenInstruction,
});

export const token2022 = fromCodamaProgram({
  programAddress: TOKEN_2022_PROGRAM_ADDRESS,
  identify: identifyToken2022Instruction,
  parse: parseToken2022Instruction,
});

export const associatedToken = fromCodamaProgram({
  programAddress: ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS,
  identify: identifyAssociatedTokenAccountInstruction,
  parse: parseAssociatedTokenAccountInstruction,
});

export const tokenMetadata = fromCodamaProgram({
  programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
  identify: identifyTokenMetadataInstruction,
  parse: parseTokenMetadataInstruction,
});

export const bubblegum = fromCodamaProgram({
  programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
  identify: identifyBubblegumInstruction,
  parse: parseBubblegumInstruction,
});

export const mplCore = fromCodamaProgram({
  programAddress: MPL_CORE_PROGRAM_PROGRAM_ADDRESS,
  identify: identifyMplCoreProgramInstruction,
  parse: parseMplCoreProgramInstruction,
});

export {
  SYSTEM_PROGRAM_ADDRESS,
  SystemInstruction,
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
  Token2022Instruction,
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS,
  AssociatedTokenAccountInstruction,
  TOKEN_METADATA_PROGRAM_ADDRESS,
  TokenMetadataInstruction,
  BUBBLEGUM_PROGRAM_ADDRESS,
  BubblegumInstruction,
  MPL_CORE_PROGRAM_PROGRAM_ADDRESS,
  MplCoreProgramInstruction,
};
