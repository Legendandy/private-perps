import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  getArciumEnv,
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import type { StealthPerps } from "../target/types/stealth_perps";
import IDL from "../target/idl/stealth_perps.json";

const LUT_PROGRAM_ID = new anchor.web3.PublicKey(
  "AddressLookupTab1e1111111111111111111111111"
);

async function getMxeLutAddress(
  mxeAccount: anchor.web3.PublicKey,
  program: Program<StealthPerps>
): Promise<anchor.web3.PublicKey> {
  const mxeData = await program.account.mxeAccount.fetch(mxeAccount);
  const lutOffsetSlot = (mxeData as any).lutOffsetSlot;
  const [lut] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("AddressLookupTable"),
      mxeAccount.toBuffer(),
      new anchor.BN(lutOffsetSlot).toArrayLike(Buffer, "le", 8),
    ],
    LUT_PROGRAM_ID
  );
  return lut;
}

function compDefAddress(programId: anchor.web3.PublicKey, ixName: string) {
  return getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE()
  );
}

async function initCompDef(
  program: Program<StealthPerps>,
  provider: anchor.AnchorProvider,
  methodName: string,
  ixName: string,
  mxeAccount: anchor.web3.PublicKey,
  addressLookupTable: anchor.web3.PublicKey,
  step: string
) {
  console.log(`${step} Initializing ${ixName} comp def...`);
  try {
    const sig = await (program.methods as any)
      [methodName]()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        mxeAccount,
        compDefAccount: compDefAddress(program.programId, ixName),
        addressLookupTable,
        lutProgram: LUT_PROGRAM_ID,
        arciumProgram: new anchor.web3.PublicKey(
          "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        ),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    console.log(`  ✓ ${ixName}:`, sig);
  } catch (e: any) {
    if (
      e.message?.includes("already in use") ||
      e.message?.includes("custom program error: 0x0")
    ) {
      console.log(`  ↳ already initialized, skipping`);
    } else {
      throw e;
    }
  }
}

async function main() {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = new Program(IDL as any, provider) as any;

  console.log("Program ID:", program.programId.toBase58());

  const mxeAccount = getMXEAccAddress(program.programId);
  console.log("MXE Account:", mxeAccount.toBase58());

  const addressLookupTable = new anchor.web3.PublicKey("3Bxhq5TYdGwD4uAPZYpMYoNUyyksYvUrDfAz51c6iWwd");
  console.log("LUT:", addressLookupTable.toBase58());

  await initCompDef(program, provider, "initOpenPositionCompDef",     "open_position",     mxeAccount, addressLookupTable, "[1/4]");
  await initCompDef(program, provider, "initCheckLiquidationCompDef", "check_liquidation", mxeAccount, addressLookupTable, "[2/4]");
  await initCompDef(program, provider, "initCalculatePnlCompDef",     "calculate_pnl",     mxeAccount, addressLookupTable, "[3/4]");
  await initCompDef(program, provider, "initApplyFundingCompDef",     "apply_funding",     mxeAccount, addressLookupTable, "[4/4]");

  console.log("\n✅ All computation definitions initialized.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
