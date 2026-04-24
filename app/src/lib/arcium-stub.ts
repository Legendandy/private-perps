// app/src/lib/arcium-stub.ts
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const ARCIUM_PROG = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

export function getMXEAccAddress(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mxe"), programId.toBuffer()],
    ARCIUM_PROG
  );
  return pda;
}

export function getMempoolAccAddress(clusterOffset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mempool"), new BN(clusterOffset).toArrayLike(Buffer, "le", 4)],
    ARCIUM_PROG
  );
  return pda;
}

export function getExecutingPoolAccAddress(clusterOffset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("exec_pool"), new BN(clusterOffset).toArrayLike(Buffer, "le", 4)],
    ARCIUM_PROG
  );
  return pda;
}

export function getClusterAccAddress(clusterOffset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("cluster"), new BN(clusterOffset).toArrayLike(Buffer, "le", 4)],
    ARCIUM_PROG
  );
  return pda;
}

export function getComputationAccAddress(
  clusterOffset: number,
  computationOffset: BN
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("computation"),
      new BN(clusterOffset).toArrayLike(Buffer, "le", 4),
      computationOffset.toArrayLike(Buffer, "le", 8),
    ],
    ARCIUM_PROG
  );
  return pda;
}

export function getCompDefAccAddress(programId: PublicKey, offset: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("comp_def"), new BN(offset).toArrayLike(Buffer, "le", 4)],
    ARCIUM_PROG
  );
  return pda;
}

export function getCompDefAccOffset(ixName: string): Uint8Array {
  // sha256 of the ix name, first 4 bytes — matches arcium-anchor comp_def_offset! macro
  const encoder = new TextEncoder();
  const data = encoder.encode(ixName);
  // Use Web Crypto — available in all modern browsers and Vite build env
  return crypto.subtle.digestSync
    ? new Uint8Array(crypto.subtle.digestSync("SHA-256", data)).slice(0, 4)
    : new Uint8Array(4); // fallback — won't be called at build time
}

export function deserializeLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

export const RescueCipher = class {
  constructor(_: any) {}
  encrypt(_vals: any, _nonce: any): Uint8Array[] { return [new Uint8Array(32)]; }
  decrypt(_cts: any, _nonce: any): bigint[] { return [0n]; }
};

export const getMXEPublicKey = async (_: any, __: any): Promise<Uint8Array> => new Uint8Array(32);
export const getMXEPublicKeyWithRetry = async (_: any, __: any): Promise<Uint8Array> => new Uint8Array(32);
export const awaitComputationFinalization = async (_: any, __: any, ___: any, ____?: any): Promise<string> => "";
export const readKpJson = (_: any) => ({});
export const getArciumEnv = () => ({ arciumClusterOffset: 456 });
export const awaitEvent = (_: any, __: any) => Promise.resolve({});