// Stubs ONLY for the Node-only things that break in the browser.
// The real PDA address functions are re-exported from @arcium-hq/client
// via the vite alias below — this file only covers what can't run in browser.

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
export const awaitEvent = (_: any, __: any) => Promise.resolve({});