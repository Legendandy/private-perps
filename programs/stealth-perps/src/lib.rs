/// stealth-perps — Solana Anchor Program
///
/// This program coordinates private perpetual futures trading via Arcium.
/// Sensitive operations (liquidation checks, PnL calculations) are queued
/// to Arcium's MPC network and results returned via callbacks.
///
/// On-chain state stores ONLY encrypted blobs — no plaintext position data.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// ─── Computation Definition Offsets ────────────────────────────────────────
// Each encrypted instruction gets a unique u32 offset derived from its name.

const COMP_DEF_OFFSET_OPEN_POSITION: u32 = comp_def_offset("open_position");
const COMP_DEF_OFFSET_CHECK_LIQUIDATION: u32 = comp_def_offset("check_liquidation");
const COMP_DEF_OFFSET_CALCULATE_PNL: u32 = comp_def_offset("calculate_pnl");
const COMP_DEF_OFFSET_APPLY_FUNDING: u32 = comp_def_offset("apply_funding");

declare_id!("StLtHpErPs1111111111111111111111111111111111");

// ─── Program ────────────────────────────────────────────────────────────────

#[arcium_program]
pub mod stealth_perps {
    use super::*;

    // ════════════════════════════════════════════════════════════════════════
    // INITIALIZATION — run once after deployment
    // ════════════════════════════════════════════════════════════════════════

    /// Initialize the program state (global market config).
    pub fn initialize(
        ctx: Context<Initialize>,
        usdc_mint: Pubkey,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.usdc_mint = usdc_mint;
        state.total_open_interest_long = 0;
        state.total_open_interest_short = 0;
        state.funding_rate_bps = 10; // 0.01% per hour default
        state.paused = false;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    /// Initialize Arcium computation definition for open_position circuit.
    pub fn init_open_position_comp_def(
        ctx: Context<InitOpenPositionCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize Arcium computation definition for check_liquidation circuit.
    pub fn init_check_liquidation_comp_def(
        ctx: Context<InitCheckLiquidationCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize Arcium computation definition for calculate_pnl circuit.
    pub fn init_calculate_pnl_comp_def(
        ctx: Context<InitCalculatePnlCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize Arcium computation definition for apply_funding circuit.
    pub fn init_apply_funding_comp_def(
        ctx: Context<InitApplyFundingCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ════════════════════════════════════════════════════════════════════════
    // TRADING OPERATIONS
    // ════════════════════════════════════════════════════════════════════════

    /// Open a new private position.
    ///
    /// The client encrypts: collateral, size, entry_price, leverage, direction
    /// using x25519 key exchange + RescueCipher before calling this instruction.
    ///
    /// Arcium's MPC computes the liquidation price privately and returns it
    /// encrypted in the callback.
    pub fn open_position(
        ctx: Context<OpenPosition>,
        computation_offset: u64,
        // Encrypted field: collateral_usdc (u64 ciphertext, 32 bytes)
        ct_collateral: [u8; 32],
        // Encrypted field: size (u64 ciphertext)
        ct_size: [u8; 32],
        // Encrypted field: entry_price (u64 ciphertext)
        ct_entry_price: [u8; 32],
        // Encrypted field: leverage_bps (u32 ciphertext)
        ct_leverage_bps: [u8; 32],
        // Encrypted field: is_long (u8 ciphertext)
        ct_is_long: [u8; 32],
        // Trader's x25519 public key for shared secret derivation
        pub_key: [u8; 32],
        // Nonce for RescueCipher
        nonce: u128,
    ) -> Result<()> {
        require!(!ctx.accounts.state.paused, StealthPerpsError::MarketPaused);

        // Initialize the position account with encrypted blobs
        let position = &mut ctx.accounts.position;
        position.trader = ctx.accounts.trader.key();
        position.market = ctx.accounts.market.key();
        position.collateral_ct = ct_collateral;
        position.size_ct = ct_size;
        position.entry_price_ct = ct_entry_price;
        position.leverage_ct = ct_leverage_bps;
        position.direction_ct = ct_is_long;
        position.is_open = true;
        position.opened_at = Clock::get()?.unix_timestamp;
        position.computation_offset = computation_offset;
        position.bump = ctx.bumps.position;

        // Store pub_key and nonce for decryption in callback
        position.pub_key = pub_key;
        position.nonce = nonce.to_le_bytes();

        // Build the MPC argument bundle for the open_position circuit
        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(ct_collateral)
            .encrypted_u64(ct_size)
            .encrypted_u64(ct_entry_price)
            .encrypted_u32(ct_leverage_bps)
            .encrypted_u8(ct_is_long)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Queue computation to Arcium — MPC nodes will execute open_position circuit
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![OpenPositionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        emit!(PositionOpenedEvent {
            trader: ctx.accounts.trader.key(),
            market: ctx.accounts.market.key(),
            position: ctx.accounts.position.key(),
            // Note: no price/size/leverage emitted — fully private
        });

        Ok(())
    }

    /// Callback from Arcium after open_position circuit completes.
    /// Stores the encrypted liquidation price returned by MPC.
    #[arcium_callback(encrypted_ix = "open_position")]
    pub fn open_position_callback(
        ctx: Context<OpenPositionCallback>,
        output: SignedComputationOutputs<OpenPositionOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(OpenPositionOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Arcium MPC error: {}", e);
                return Err(StealthPerpsError::MpcComputationFailed.into());
            }
        };

        // Store the encrypted liquidation price in the position account
        let position = &mut ctx.accounts.position;
        position.liq_price_ct = o.ciphertexts[0];
        position.liq_nonce = o.nonce.to_le_bytes();

        emit!(LiqPriceStoredEvent {
            position: position.key(),
            liq_price_ct: o.ciphertexts[0],
            nonce: o.nonce.to_le_bytes(),
        });

        Ok(())
    }

    /// Check if a position should be liquidated (called by keeper bots).
    ///
    /// Keeper provides the current mark price (encrypted with the MXE public key).
    /// Arcium computes `mark_price < liq_price` in MPC.
    /// Returns encrypted boolean: 1 = liquidate, 0 = healthy.
    pub fn check_liquidation(
        ctx: Context<CheckLiquidation>,
        computation_offset: u64,
        // Mark price encrypted by keeper with MXE pubkey (Enc<Mxe, u64>)
        ct_mark_price: [u8; 32],
        // Maintenance margin in BPS (plaintext — public parameter)
        maintenance_margin_bps: u32,
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.is_open, StealthPerpsError::PositionNotOpen);

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            // Encrypted position data (stored on-chain, re-used as MPC inputs)
            .encrypted_u64(position.collateral_ct)
            .encrypted_u64(position.size_ct)
            .encrypted_u64(position.entry_price_ct)
            .encrypted_u32(position.leverage_ct)
            .encrypted_u8(position.direction_ct)
            // Mark price encrypted by keeper
            .encrypted_u64(ct_mark_price)
            .plaintext_u32(maintenance_margin_bps)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CheckLiquidationCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// Callback: if MPC returns 1, mark position for liquidation.
    #[arcium_callback(encrypted_ix = "check_liquidation")]
    pub fn check_liquidation_callback(
        ctx: Context<CheckLiquidationCallback>,
        output: SignedComputationOutputs<CheckLiquidationOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CheckLiquidationOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Arcium MPC error: {}", e);
                return Err(StealthPerpsError::MpcComputationFailed.into());
            }
        };

        // The MPC result is still encrypted — emit it for the keeper to decrypt.
        // Keeper holds the shared secret and can check if result == 1.
        emit!(LiquidationCheckResultEvent {
            position: ctx.accounts.position.key(),
            result_ct: o.ciphertexts[0],
            nonce: o.nonce.to_le_bytes(),
        });

        Ok(())
    }

    /// Close a position — computes final PnL privately in Arcium MPC.
    pub fn close_position(
        ctx: Context<ClosePosition>,
        computation_offset: u64,
        // Exit price encrypted by oracle/trader
        ct_exit_price: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.is_open, StealthPerpsError::PositionNotOpen);
        require!(
            position.trader == ctx.accounts.trader.key(),
            StealthPerpsError::Unauthorized
        );

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(position.collateral_ct)
            .encrypted_u64(position.size_ct)
            .encrypted_u64(position.entry_price_ct)
            .encrypted_u64(ct_exit_price)
            .encrypted_u8(position.direction_ct)
            .encrypted_u32(position.leverage_ct)
            .encrypted_u64(position.funding_owed_ct)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ClosePositionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// Callback: mark position as closed, emit encrypted PnL for trader.
    #[arcium_callback(encrypted_ix = "calculate_pnl")]
    pub fn close_position_callback(
        ctx: Context<ClosePositionCallback>,
        output: SignedComputationOutputs<CalculatePnlOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CalculatePnlOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Arcium MPC error: {}", e);
                return Err(StealthPerpsError::MpcComputationFailed.into());
            }
        };

        let position = &mut ctx.accounts.position;
        position.is_open = false;
        position.closed_at = Clock::get()?.unix_timestamp;

        // Emit encrypted PnL — only the trader can decrypt with their shared secret
        emit!(PositionClosedEvent {
            trader: position.trader,
            position: position.key(),
            pnl_ct: o.ciphertexts[0],
            pnl_nonce: o.nonce.to_le_bytes(),
            // No plaintext price or size emitted
        });

        Ok(())
    }

    /// Apply funding to a position (called by keeper).
    pub fn apply_funding(
        ctx: Context<ApplyFunding>,
        computation_offset: u64,
        hours_elapsed: u32,
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.is_open, StealthPerpsError::PositionNotOpen);

        let funding_rate = ctx.accounts.state.funding_rate_bps;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(position.size_ct)
            .encrypted_u64(position.entry_price_ct)
            .plaintext_u32(funding_rate)
            .plaintext_u32(hours_elapsed)
            .encrypted_u8(position.direction_ct)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ApplyFundingCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// Callback: update position's encrypted funding owed accumulator.
    #[arcium_callback(encrypted_ix = "apply_funding")]
    pub fn apply_funding_callback(
        ctx: Context<ApplyFundingCallback>,
        output: SignedComputationOutputs<ApplyFundingOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ApplyFundingOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Arcium MPC error: {}", e);
                return Err(StealthPerpsError::MpcComputationFailed.into());
            }
        };

        // Accumulate funding owed (encrypted)
        let position = &mut ctx.accounts.position;
        position.funding_owed_ct = o.ciphertexts[0];
        position.last_funding_update = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Admin: update global funding rate.
    pub fn update_funding_rate(
        ctx: Context<UpdateFundingRate>,
        new_rate_bps: u32,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.state.authority,
            StealthPerpsError::Unauthorized
        );
        ctx.accounts.state.funding_rate_bps = new_rate_bps;
        Ok(())
    }

    /// Admin: pause / unpause trading.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.state.authority,
            StealthPerpsError::Unauthorized
        );
        ctx.accounts.state.paused = paused;
        Ok(())
    }
}

// ─── Account Structures ──────────────────────────────────────────────────────

/// Global program state — no sensitive data stored here.
#[account]
pub struct ProgramState {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_open_interest_long: u64,
    pub total_open_interest_short: u64,
    pub funding_rate_bps: u32,
    pub paused: bool,
    pub bump: u8,
}

/// Market account (one per trading pair, e.g. SOL/USDC-PERP).
#[account]
pub struct Market {
    pub symbol: [u8; 16],   // e.g. b"SOL/USDC-PERP\0\0\0"
    pub oracle: Pubkey,
    pub max_leverage_bps: u32,
    pub is_active: bool,
    pub bump: u8,
}

/// Position account — stores ONLY encrypted blobs.
/// No plaintext price, size, or leverage is ever stored here.
#[account]
pub struct Position {
    pub trader: Pubkey,
    pub market: Pubkey,

    // Encrypted position data (32-byte ciphertexts from RescueCipher)
    pub collateral_ct: [u8; 32],
    pub size_ct: [u8; 32],
    pub entry_price_ct: [u8; 32],
    pub leverage_ct: [u8; 32],
    pub direction_ct: [u8; 32],

    // Returned by Arcium MPC after open_position circuit
    pub liq_price_ct: [u8; 32],
    pub liq_nonce: [u8; 16],

    // Accumulated funding (encrypted, updated by apply_funding callback)
    pub funding_owed_ct: [u8; 32],
    pub last_funding_update: i64,

    // Encryption metadata (public key used for this position's shared secret)
    pub pub_key: [u8; 32],
    pub nonce: [u8; 16],

    // Position lifecycle
    pub is_open: bool,
    pub opened_at: i64,
    pub closed_at: i64,
    pub computation_offset: u64,
    pub bump: u8,
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<ProgramState>() + 64,
        seeds = [b"state"],
        bump,
    )]
    pub state: Account<'info, ProgramState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct InitOpenPositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
    )]
    pub state: Account<'info, ProgramState>,

    /// CHECK: Arcium MXE account — validated by arcium-anchor
    #[account(mut)]
    pub mxe_account: UncheckedAccount<'info>,

    /// CHECK: Arcium computation definition account
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,

    /// CHECK: Arcium cluster account
    pub cluster_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

// Similar init structs for other comp defs (abbreviated for clarity — generated by arcium init)
#[derive(Accounts)]
pub struct InitCheckLiquidationCompDef<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitCalculatePnlCompDef<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitApplyFundingCompDef<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,

    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = trader,
        space = 8 + std::mem::size_of::<Position>() + 64,
        seeds = [b"position", trader.key().as_ref(), market.key().as_ref(), &computation_offset.to_le_bytes()],
        bump,
    )]
    pub position: Account<'info, Position>,

    // Arcium required accounts
    /// CHECK: Arcium MXE
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    /// CHECK: Arcium mempool
    #[account(mut)] pub mempool_account: UncheckedAccount<'info>,
    /// CHECK: Arcium executing pool
    #[account(mut)] pub executing_pool: UncheckedAccount<'info>,
    /// CHECK: Arcium computation account
    #[account(mut)] pub computation_account: UncheckedAccount<'info>,
    /// CHECK: Arcium comp def
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    /// CHECK: Arcium cluster
    pub cluster_account: UncheckedAccount<'info>,
    /// CHECK: Sign PDA
    #[account(mut, seeds = [b"sign_pda"], bump)]
    pub sign_pda_account: Account<'info, SignPdaAccount>,

    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenPositionCallback<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    /// CHECK: Arcium cluster account
    pub cluster_account: UncheckedAccount<'info>,
    /// CHECK: Arcium computation account
    pub computation_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
}

#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CheckLiquidation<'info> {
    #[account(mut)] pub keeper: Signer<'info>,
    pub position: Account<'info, Position>,
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    #[account(mut)] pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)] pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)] pub computation_account: UncheckedAccount<'info>,
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"sign_pda"], bump)]
    pub sign_pda_account: Account<'info, SignPdaAccount>,
    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckLiquidationCallback<'info> {
    pub position: Account<'info, Position>,
    pub cluster_account: UncheckedAccount<'info>,
    pub computation_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
}

#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ClosePosition<'info> {
    #[account(mut)] pub trader: Signer<'info>,
    #[account(mut, has_one = trader)] pub position: Account<'info, Position>,
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    #[account(mut)] pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)] pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)] pub computation_account: UncheckedAccount<'info>,
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"sign_pda"], bump)]
    pub sign_pda_account: Account<'info, SignPdaAccount>,
    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePositionCallback<'info> {
    #[account(mut)] pub position: Account<'info, Position>,
    pub cluster_account: UncheckedAccount<'info>,
    pub computation_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
}

#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ApplyFunding<'info> {
    #[account(mut)] pub keeper: Signer<'info>,
    #[account(seeds = [b"state"], bump = state.bump)] pub state: Account<'info, ProgramState>,
    pub position: Account<'info, Position>,
    #[account(mut)] pub mxe_account: UncheckedAccount<'info>,
    #[account(mut)] pub mempool_account: UncheckedAccount<'info>,
    #[account(mut)] pub executing_pool: UncheckedAccount<'info>,
    #[account(mut)] pub computation_account: UncheckedAccount<'info>,
    #[account(mut)] pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"sign_pda"], bump)]
    pub sign_pda_account: Account<'info, SignPdaAccount>,
    pub arcium_program: Program<'info, ArciumProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApplyFundingCallback<'info> {
    #[account(mut)] pub position: Account<'info, Position>,
    pub cluster_account: UncheckedAccount<'info>,
    pub computation_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, ArciumProgram>,
}

#[derive(Accounts)]
pub struct UpdateFundingRate<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,
}

// ─── Events ──────────────────────────────────────────────────────────────────

/// Emitted when a position is opened. No sensitive data included.
#[event]
pub struct PositionOpenedEvent {
    pub trader: Pubkey,
    pub market: Pubkey,
    pub position: Pubkey,
}

/// Emitted when Arcium stores the encrypted liquidation price.
#[event]
pub struct LiqPriceStoredEvent {
    pub position: Pubkey,
    pub liq_price_ct: [u8; 32],
    pub nonce: [u8; 16],
}

/// Emitted by check_liquidation_callback. Encrypted boolean result.
/// Keeper decrypts with shared secret to determine if liquidatable.
#[event]
pub struct LiquidationCheckResultEvent {
    pub position: Pubkey,
    pub result_ct: [u8; 32],
    pub nonce: [u8; 16],
}

/// Emitted when position is closed. PnL is encrypted — only trader can read.
#[event]
pub struct PositionClosedEvent {
    pub trader: Pubkey,
    pub position: Pubkey,
    pub pnl_ct: [u8; 32],
    pub pnl_nonce: [u8; 16],
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum StealthPerpsError {
    #[msg("Market is paused")]
    MarketPaused,
    #[msg("Position is not open")]
    PositionNotOpen,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arcium MPC computation failed")]
    MpcComputationFailed,
    #[msg("Invalid leverage")]
    InvalidLeverage,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
}

// ─── Arcium Output Types (auto-generated by arcium build) ────────────────────

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct OpenPositionOutput {
    pub field_0: ComputationOutput,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct CheckLiquidationOutput {
    pub field_0: ComputationOutput,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct CalculatePnlOutput {
    pub field_0: ComputationOutput,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct ApplyFundingOutput {
    pub field_0: ComputationOutput,
}
