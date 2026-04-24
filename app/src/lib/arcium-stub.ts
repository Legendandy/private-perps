// Stub for browser — real functions run server-side only
export const RescueCipher = class {
  constructor(_: any) {}
  encrypt(_: any, __: any) { return []; }
  decrypt(_: any, __: any) { return []; }
};
export const deserializeLE = (_: any) => BigInt(0);
export const getMXEPublicKey = async (_: any, __: any) => new Uint8Array(32);
export const awaitComputationFinalization = async (_: any, __: any, ___: any) => "";
export const readKpJson = (_: any) => ({});
export const getArciumEnv = () => ({ arciumClusterOffset: 456 });
export const getMXEAccAddress = (_: any) => null;
export const getMempoolAccAddress = (_: any) => null;
export const getClusterAccAddress = (_: any) => null;
export const getExecutingPoolAccAddress = (_: any) => null;
export const getComputationAccAddress = (_: any, __: any) => null;
export const getCompDefAccAddress = (_: any, __: any) => null;
export const getCompDefAccOffset = (_: any) => new Uint8Array(4);
export const awaitEvent = (_: any, __: any) => Promise.resolve({});