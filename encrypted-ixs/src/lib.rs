/// stealth-perps — Arcis Encrypted Instruction Circuits
///
/// These circuits run ENTIRELY inside Arcium's MPC network.
/// No node in the network sees plaintext data.
/// Results are returned as ciphertexts, decryptable only by the trader.

use arcis::*;

// ─── Shared Data Structures ────────────────────────────────────────────────

/// A position submitted by a trader — all values are encrypted.
/// Prices are stored as u64 representing the value × 1_000_000 (6 decimal places).
pub struct PositionInputs {
    /// Collateral in USDC (× 1_000_000)
    pub collateral_usdc: u64,
    /// Notional size in the base asset (× 1_000_000)
    pub size: u64,
    /// Entry price (× 1_000_000)
    pub entry_price: u64,
    /// Leverage multiplier (× 100, e.g. 1000 = 10x)
    pub leverage_bps: u32,
    /// 1 = LONG, 0 = SHORT
    pub is_long: u8,
}

/// Liquidation check inputs — both position data and current mark price.
pub struct LiquidationCheckInputs {
    /// Encrypted collateral (× 1_000_000)
    pub collateral_usdc: u64,
    /// Encrypted notional size (× 1_000_000)
    pub size: u64,
    /// Encrypted entry price (× 1_000_000)
    pub entry_price: u64,
    /// Leverage in BPS (× 100)
    pub leverage_bps: u32,
    /// Direction: 1 = LONG, 0 = SHORT
    pub is_long: u8,
    /// Current mark price from oracle (× 1_000_000) — encrypted by keeper
    pub mark_price: u64,
    /// Maintenance margin rate in BPS (e.g. 50 = 0.5%)
    pub maintenance_margin_bps: u32,
}

/// Inputs for PnL calculation on position close.
pub struct PnlInputs {
    /// Original collateral (× 1_000_000)
    pub collateral_usdc: u64,
    /// Position size (× 1_000_000)
    pub size: u64,
    /// Entry price (× 1_000_000)
    pub entry_price: u64,
    /// Exit / mark price (× 1_000_000)
    pub exit_price: u64,
    /// Direction: 1 = LONG, 0 = SHORT
    pub is_long: u8,
    /// Leverage (× 100)
    pub leverage_bps: u32,
    /// Accumulated funding (in USDC × 1_000_000, can be large)
    pub funding_owed_usdc: u64,
}

/// Funding rate application inputs.
pub struct FundingInputs {
    /// Position notional (× 1_000_000)
    pub size: u64,
    /// Entry price (× 1_000_000)
    pub entry_price: u64,
    /// Funding rate per hour in BPS (× 100)
    pub funding_rate_bps: u32,
    /// Number of hours elapsed since last funding
    pub hours_elapsed: u32,
    /// Direction: 1 = LONG, 0 = SHORT
    pub is_long: u8,
}

// ─── MPC Circuit Module ─────────────────────────────────────────────────────

#[encrypted]
mod circuits {
    use arcis::*;
    use super::*;

    // ── Circuit 1: open_position ────────────────────────────────────────────
    //
    // Called when a trader opens a position. Returns an encrypted summary of
    // the position (liquidation price) that is stored on-chain but unreadable
    // by anyone except the MXE.
    //
    // Privacy benefit: entry price, size, and leverage are NEVER exposed.
    // The on-chain account stores only encrypted blobs.

    #[instruction]
    pub fn open_position(
        input_ctxt: Enc<Shared, PositionInputs>,
    ) -> Enc<Shared, u64> {
        let pos = input_ctxt.to_arcis();

        // Compute liquidation price in MPC:
        //   For LONG:  liq_price = entry * (1 - 1/leverage)
        //   For SHORT: liq_price = entry * (1 + 1/leverage)
        //
        // All arithmetic in integer (scaled) form.
        // leverage_bps = leverage * 100, e.g. 10x = 1000

        let leverage = pos.leverage_bps as u64;
        let entry = pos.entry_price;

        // maintenance margin: 1 / leverage
        // liq_distance = entry_price / leverage (in bps units)
        // We multiply by 100 to keep precision, then divide by leverage_bps
        let liq_distance = (entry * 100) / leverage;

        let liq_price: u64 = if pos.is_long == 1 {
            if entry > liq_distance {
                entry - liq_distance
            } else {
                0
            }
        } else {
            entry + liq_distance
        };

        // Return encrypted liquidation price to be stored in MXE account.
        // The Solana program will store this encrypted blob on-chain.
        input_ctxt.owner.from_arcis(liq_price)
    }

    // ── Circuit 2: check_liquidation ───────────────────────────────────────
    //
    // Called by a keeper at regular intervals. Returns a single encrypted bit:
    //   1 = position is liquidatable
    //   0 = position is healthy
    //
    // Privacy benefit: neither the keeper nor any observer learns the exact
    // position size, entry price, or liquidation threshold. Only a boolean
    // result is revealed, via the callback event.

    #[instruction]
    pub fn check_liquidation(
        input_ctxt: Enc<Shared, LiquidationCheckInputs>,
    ) -> Enc<Shared, u8> {
        let liq = input_ctxt.to_arcis();

        let leverage = liq.leverage_bps as u64;
        let entry = liq.entry_price;
        let mark = liq.mark_price;

        // Re-derive liquidation price inside MPC (same formula as open_position)
        let liq_distance = (entry * 100) / leverage;

        let liq_price: u64 = if liq.is_long == 1 {
            if entry > liq_distance { entry - liq_distance } else { 0 }
        } else {
            entry + liq_distance
        };

        // Apply maintenance margin cushion
        let margin_cushion = (liq_price * liq.maintenance_margin_bps as u64) / 10_000;

        // Is position liquidatable?
        let is_liquidatable: u8 = if liq.is_long == 1 {
            // Long: liquidate if mark price dropped below liq_price + cushion
            if mark < liq_price + margin_cushion { 1 } else { 0 }
        } else {
            // Short: liquidate if mark price rose above liq_price - cushion
            if liq_price > margin_cushion && mark > liq_price - margin_cushion { 1 } else { 0 }
        };

        input_ctxt.owner.from_arcis(is_liquidatable)
    }

    // ── Circuit 3: calculate_pnl ────────────────────────────────────────────
    //
    // Called when a trader closes a position. Computes realized PnL entirely
    // in MPC and returns it encrypted. The Solana callback emits the encrypted
    // value; the trader decrypts it client-side.
    //
    // Privacy benefit: exit price, position size, and leverage are never
    // visible on-chain. Only the trader can decrypt final PnL.

    #[instruction]
    pub fn calculate_pnl(
        input_ctxt: Enc<Shared, PnlInputs>,
    ) -> Enc<Shared, u64> {
        let data = input_ctxt.to_arcis();

        let size = data.size;
        let entry = data.entry_price;
        let exit = data.exit_price;
        let leverage = data.leverage_bps as u64;

        // Notional = size * entry_price / 1_000_000 (descale)
        // pnl_bps = (exit - entry) / entry * 10000
        // pnl_usdc = collateral * leverage * pnl_bps / 10000

        // We keep all math in integer scaled units.
        // Price diff scaled by 1_000_000 already.
        let raw_pnl: u64 = if data.is_long == 1 {
            if exit > entry {
                // Profit: (exit - entry) * size / entry
                let price_diff = exit - entry;
                (price_diff * size) / entry
            } else {
                0  // Represents a loss — handled below
            }
        } else {
            // Short: profit when price falls
            if entry > exit {
                let price_diff = entry - exit;
                (price_diff * size) / entry
            } else {
                0
            }
        };

        // Apply leverage
        let leveraged_pnl = (raw_pnl * leverage) / 100;

        // Subtract funding owed
        let final_pnl = if leveraged_pnl > data.funding_owed_usdc {
            leveraged_pnl - data.funding_owed_usdc
        } else {
            0
        };

        input_ctxt.owner.from_arcis(final_pnl)
    }

    // ── Circuit 4: apply_funding ────────────────────────────────────────────
    //
    // Computes how much funding a position owes, privately.
    // Returns encrypted funding amount owed by the position.
    //
    // Privacy benefit: position size and direction are not exposed to keepers.

    #[instruction]
    pub fn apply_funding(
        input_ctxt: Enc<Shared, FundingInputs>,
    ) -> Enc<Shared, u64> {
        let f = input_ctxt.to_arcis();

        // Notional value = size * entry_price / 1_000_000
        let notional = (f.size * f.entry_price) / 1_000_000;

        // funding_per_hour = notional * funding_rate_bps / 1_000_000
        let funding_per_hour = (notional * f.funding_rate_bps as u64) / 1_000_000;

        // Total funding owed
        let total_funding = funding_per_hour * f.hours_elapsed as u64;

        // Longs pay when funding rate > 0, shorts receive (and vice versa).
        // We return the absolute amount owed by this position direction.
        let funding_owed: u64 = if f.is_long == 1 {
            total_funding
        } else {
            // Shorts receive funding — return 0 as owed (credit handled by program)
            0
        };

        input_ctxt.owner.from_arcis(funding_owed)
    }
}
