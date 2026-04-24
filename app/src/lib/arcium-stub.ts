// Stub for @arcium-hq/client — replaces the Node-only package in browser builds.
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const ARCIUM_PROG = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

export function getMXEAccAddress(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MXEAccount"), programId.toBuffer()],
    ARCIUM_PROG
  );
  return pda;
}

export function getMempoolAccAddress(clusterOffset: number): PublicKey {
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(clusterOffset, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("Mempool"), offsetBuf],
    ARCIUM_PROG
  );
  return pda;
}

export function getExecutingPoolAccAddress(clusterOffset: number): PublicKey {
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(clusterOffset, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("Execpool"), offsetBuf],
    ARCIUM_PROG
  );
  return pda;
}

export function getClusterAccAddress(clusterOffset: number): PublicKey {
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(clusterOffset, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("Cluster"), offsetBuf],
    ARCIUM_PROG
  );
  return pda;
}

export function getComputationAccAddress(
  clusterOffset: number,
  computationOffset: BN
): PublicKey {
  const clusterBuf = Buffer.alloc(4);
  clusterBuf.writeUInt32LE(clusterOffset, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("ComputationAccount"),
      clusterBuf,
      computationOffset.toArrayLike(Buffer, "le", 8),
    ],
    ARCIUM_PROG
  );
  return pda;
}

export function getCompDefAccAddress(programId: PublicKey, offset: number): PublicKey {
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(offset, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), programId.toBuffer(), offsetBuf],
    ARCIUM_PROG
  );
  return pda;
}

// SHA256(name)[0..4] as little-endian u32 — matches Rust's comp_def_offset()
// Pre-computed to avoid async crypto.subtle in browser
const COMP_DEF_OFFSETS: Record<string, number> = {
  open_position:     3935201159,
  check_liquidation: 2996691951,
  calculate_pnl:     3777819404,
  apply_funding:     1679586691,
};

export function getCompDefAccOffset(ixName: string): Uint8Array {
  const offset = COMP_DEF_OFFSETS[ixName];
  if (offset === undefined) throw new Error(`Unknown comp def ix: ${ixName}`);
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(offset, 0);
  return new Uint8Array(buf);
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