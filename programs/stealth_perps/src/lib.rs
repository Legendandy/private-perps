use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;
use arcium_anchor::{
    comp_def_offset, init_comp_def, queue_computation,
    derive_cluster_pda, derive_comp_def_pda, derive_comp_pda,
    derive_execpool_pda, derive_mempool_pda, derive_mxe_pda,
    derive_sign_pda, derive_mxe_lut_pda,
    ARCIUM_FEE_POOL_ACCOUNT_ADDRESS, ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    SIGN_PDA_SEED, LUT_PROGRAM_ID,
    ArgBuilder, SignedComputationOutputs,
};

#[derive(Debug, Clone, Copy)]
pub enum ErrorCode {
    ClusterNotSet,
}
impl From<ErrorCode> for anchor_lang::error::Error {
    fn from(_e: ErrorCode) -> Self {
        anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountNotInitialized)
    }
}

declare_id!("57dAxRF57a33kHwa51Xhd4eNjLg7vc7Q1phfMKS4xtfy");

const COMP_DEF_OFFSET_OPEN_POSITION: u32     = comp_def_offset("open_position");
const COMP_DEF_OFFSET_CHECK_LIQUIDATION: u32 = comp_def_offset("check_liquidation");
const COMP_DEF_OFFSET_CALCULATE_PNL: u32     = comp_def_offset("calculate_pnl");
const COMP_DEF_OFFSET_APPLY_FUNDING: u32     = comp_def_offset("apply_funding");

#[arcium_program]
pub mod stealth_perps {
    use super::*;

    pub fn init_open_position_comp_def(ctx: Context<InitOpenPositionCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://snkekjxagpohoxwnqplm.supabase.co/storage/v1/object/public/arcium-circuits/open_position.arcis".to_string(),
                hash: circuit_hash!("open_position"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_check_liquidation_comp_def(ctx: Context<InitCheckLiquidationCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://snkekjxagpohoxwnqplm.supabase.co/storage/v1/object/public/arcium-circuits/check_liquidation.arcis".to_string(),
                hash: circuit_hash!("check_liquidation"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_calculate_pnl_comp_def(ctx: Context<InitCalculatePnlCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://snkekjxagpohoxwnqplm.supabase.co/storage/v1/object/public/arcium-circuits/calculate_pnl.arcis".to_string(),
                hash: circuit_hash!("calculate_pnl"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_apply_funding_comp_def(ctx: Context<InitApplyFundingCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://snkekjxagpohoxwnqplm.supabase.co/storage/v1/object/public/arcium-circuits/apply_funding.arcis".to_string(),
                hash: circuit_hash!("apply_funding"),
            })),
            None,
        )?;
        Ok(())
    }

    #[inline(never)]
    pub fn open_position(
        ctx: Context<OpenPosition>,
        computation_offset: u64,
        ct_collateral: [u8; 32],
        ct_size: [u8; 32],
        ct_entry_price: [u8; 32],
        ct_leverage_bps: [u8; 32],
        ct_is_long: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        position.owner              = ctx.accounts.trader.key();
        position.computation_offset = computation_offset;
        position.ct_collateral      = ct_collateral;
        position.ct_size            = ct_size;
        position.ct_entry_price     = ct_entry_price;
        position.ct_leverage_bps    = ct_leverage_bps;
        position.ct_is_long         = ct_is_long;
        position.pub_key            = pub_key;
        position.nonce              = nonce;
        position.state              = PositionState::Opening;
        position.opened_at          = Clock::get()?.unix_timestamp;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(ct_collateral)
            .encrypted_u64(ct_size)
            .encrypted_u64(ct_entry_price)
            .encrypted_u64(ct_leverage_bps)
            .encrypted_u64(ct_is_long)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let position_key = position.key();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![OpenPositionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount { pubkey: position_key, is_writable: true }],
            )?],
            1,
            0,
        )?;

        emit!(PositionOpenedEvent {
            trader: ctx.accounts.trader.key(),
            position: position_key,
            computation_offset,
        });

        Ok(())
    }

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
                msg!("Error: {}", e);
                return Err(StealthPerpsError::AbortedComputation.into());
            }
        };
        let position = &mut ctx.accounts.position;
        position.ct_liq_price = o.ciphertexts[0];
        position.state = PositionState::Open;
        emit!(LiqPriceStoredEvent {
            position: position.key(),
            liq_price_ct: o.ciphertexts[0],
            nonce: o.nonce,
        });
        Ok(())
    }

    #[inline(never)]
    pub fn check_liquidation(
        ctx: Context<CheckLiquidation>,
        computation_offset: u64,
        ct_mark_price: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.state == PositionState::Open, StealthPerpsError::PositionNotOpen);

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(position.ct_collateral)
            .encrypted_u64(position.ct_size)
            .encrypted_u64(position.ct_entry_price)
            .encrypted_u64(position.ct_leverage_bps)
            .encrypted_u64(position.ct_is_long)
            .encrypted_u64(ct_mark_price)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let liq_check_key = ctx.accounts.liq_check.key();
        let position_key  = ctx.accounts.position.key();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CheckLiquidationCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount { pubkey: liq_check_key, is_writable: true },
                    CallbackAccount { pubkey: position_key,  is_writable: true },
                ],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

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
                msg!("Error: {}", e);
                return Err(StealthPerpsError::AbortedComputation.into());
            }
        };
        let liq_check = &mut ctx.accounts.liq_check;
        liq_check.result_ct = o.ciphertexts[0];
        emit!(LiquidationCheckResultEvent {
            position: ctx.accounts.position.key(),
            result_ct: o.ciphertexts[0],
            nonce: o.nonce,
        });
        Ok(())
    }

    #[inline(never)]
    pub fn close_position(
        ctx: Context<ClosePosition>,
        computation_offset: u64,
        ct_exit_price: [u8; 32],
        ct_funding_owed: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(position.state == PositionState::Open, StealthPerpsError::PositionNotOpen);
        require!(position.owner == ctx.accounts.trader.key(), StealthPerpsError::Unauthorized);

        position.state = PositionState::Closing;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(position.ct_collateral)
            .encrypted_u64(position.ct_size)
            .encrypted_u64(position.ct_entry_price)
            .encrypted_u64(ct_exit_price)
            .encrypted_u64(position.ct_is_long)
            .encrypted_u64(position.ct_leverage_bps)
            .encrypted_u64(ct_funding_owed)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let position_key = position.key();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CalculatePnlCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount { pubkey: position_key, is_writable: true }],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "calculate_pnl")]
    pub fn calculate_pnl_callback(
        ctx: Context<CalculatePnlCallback>,
        output: SignedComputationOutputs<CalculatePnlOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CalculatePnlOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Error: {}", e);
                return Err(StealthPerpsError::AbortedComputation.into());
            }
        };
        let position = &mut ctx.accounts.position;
        position.ct_pnl = o.ciphertexts[0];
        position.state  = PositionState::Closed;
        emit!(PositionClosedEvent {
            position: position.key(),
            owner: position.owner,
            pnl_ct: o.ciphertexts[0],
            pnl_nonce: o.nonce,
        });
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub computation_offset: u64,
    pub ct_collateral: [u8; 32],
    pub ct_size: [u8; 32],
    pub ct_entry_price: [u8; 32],
    pub ct_leverage_bps: [u8; 32],
    pub ct_is_long: [u8; 32],
    pub ct_liq_price: [u8; 32],
    pub ct_pnl: [u8; 32],
    pub pub_key: [u8; 32],
    pub nonce: u128,
    pub state: PositionState,
    pub opened_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct LiqCheck {
    pub position: Pubkey,
    pub result_ct: [u8; 32],
    pub nonce: u128,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PositionState { Opening, Open, Closing, Closed }

#[init_computation_definition_accounts("open_position", payer)]
#[derive(Accounts)]
pub struct InitOpenPositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: checked by arcium
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: checked by arcium
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("check_liquidation", payer)]
#[derive(Accounts)]
pub struct InitCheckLiquidationCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: checked by arcium
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: checked by arcium
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("calculate_pnl", payer)]
#[derive(Accounts)]
pub struct InitCalculatePnlCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: checked by arcium
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: checked by arcium
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("apply_funding", payer)]
#[derive(Accounts)]
pub struct InitApplyFundingCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: checked by arcium
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: checked by arcium
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("open_position", trader)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(
        init_if_needed, space = 9, payer = trader,
        seeds = [&SIGN_PDA_SEED], bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(
        init, payer = trader,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", trader.key().as_ref(), computation_offset.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_POSITION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("open_position")]
#[derive(Accounts)]
pub struct OpenPositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_POSITION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: checked by arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[queue_computation_accounts("check_liquidation", keeper)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CheckLiquidation<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(
        init_if_needed, space = 9, payer = keeper,
        seeds = [&SIGN_PDA_SEED], bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    pub position: Account<'info, Position>,
    #[account(
        init, payer = keeper,
        space = 8 + LiqCheck::INIT_SPACE,
        seeds = [b"liq_check", position.key().as_ref(), computation_offset.to_le_bytes().as_ref()],
        bump
    )]
    pub liq_check: Account<'info, LiqCheck>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("check_liquidation")]
#[derive(Accounts)]
pub struct CheckLiquidationCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: checked by arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub liq_check: Account<'info, LiqCheck>,
    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[queue_computation_accounts("calculate_pnl", trader)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(
        init_if_needed, space = 9, payer = trader,
        seeds = [&SIGN_PDA_SEED], bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut, constraint = position.owner == trader.key() @ StealthPerpsError::Unauthorized)]
    pub position: Account<'info, Position>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, StealthPerpsError::ClusterNotSet))]
    /// CHECK: checked by arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CALCULATE_PNL))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("calculate_pnl")]
#[derive(Accounts)]
pub struct CalculatePnlCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CALCULATE_PNL))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: checked by arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, StealthPerpsError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[event]
pub struct PositionOpenedEvent {
    pub trader: Pubkey,
    pub position: Pubkey,
    pub computation_offset: u64,
}

#[event]
pub struct LiqPriceStoredEvent {
    pub position: Pubkey,
    pub liq_price_ct: [u8; 32],
    pub nonce: u128,
}

#[event]
pub struct LiquidationCheckResultEvent {
    pub position: Pubkey,
    pub result_ct: [u8; 32],
    pub nonce: u128,
}

#[event]
pub struct PositionClosedEvent {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub pnl_ct: [u8; 32],
    pub pnl_nonce: u128,
}

#[error_code]
pub enum StealthPerpsError {
    #[msg("Position is not in Open state")]
    PositionNotOpen,
    #[msg("Unauthorized: caller is not position owner")]
    Unauthorized,
    #[msg("Computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
}