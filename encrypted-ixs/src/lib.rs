use arcis::*;
#[encrypted]
mod circuits {
    use arcis::*;

    pub struct PositionInputs {
        pub collateral_usdc: u64,
        pub size: u64,
        pub entry_price: u64,
        pub leverage_bps: u64,
        pub is_long: u64,
    }

    pub struct LiquidationCheckInputs {
        pub collateral_usdc: u64,
        pub size: u64,
        pub entry_price: u64,
        pub leverage_bps: u64,
        pub is_long: u64,
        pub mark_price: u64,
        pub maintenance_margin_bps: u64,
    }

    pub struct PnlInputs {
        pub collateral_usdc: u64,
        pub size: u64,
        pub entry_price: u64,
        pub exit_price: u64,
        pub is_long: u64,
        pub leverage_bps: u64,
        pub funding_owed_usdc: u64,
    }

    pub struct FundingInputs {
        pub size: u64,
        pub entry_price: u64,
        pub funding_rate_bps: u64,
        pub hours_elapsed: u64,
        pub is_long: u64,
    }

    #[instruction]
    pub fn open_position(
        input_ctxt: Enc<Shared, PositionInputs>,
    ) -> Enc<Shared, u64> {
        let pos = input_ctxt.to_arcis();
        let entry = pos.entry_price;
        let leverage = pos.leverage_bps;
        // Single division: liq_distance = entry * 100 / leverage
        let liq_distance = (entry * 100u64) / leverage;
        let liq_price: u64 = if pos.is_long == 1u64 {
            if entry > liq_distance { entry - liq_distance } else { 1u64 }
        } else {
            entry + liq_distance
        };
        input_ctxt.owner.from_arcis(liq_price)
    }

    #[instruction]
    pub fn check_liquidation(
        input_ctxt: Enc<Shared, LiquidationCheckInputs>,
    ) -> Enc<Shared, u64> {
        let liq = input_ctxt.to_arcis();
        let entry = liq.entry_price;
        let mark = liq.mark_price;
        let leverage = liq.leverage_bps;
        // Simplified: just check if mark is below entry - (entry/leverage)*100
        let liq_distance = (entry * 100u64) / leverage;
        let liq_price: u64 = if liq.is_long == 1u64 {
            if entry > liq_distance { entry - liq_distance } else { 1u64 }
        } else {
            entry + liq_distance
        };
        let is_liquidatable: u64 = if liq.is_long == 1u64 {
            if mark < liq_price { 1u64 } else { 0u64 }
        } else {
            if mark > liq_price { 1u64 } else { 0u64 }
        };
        input_ctxt.owner.from_arcis(is_liquidatable)
    }

    #[instruction]
    pub fn calculate_pnl(
        input_ctxt: Enc<Shared, PnlInputs>,
    ) -> Enc<Shared, u64> {
        let data = input_ctxt.to_arcis();
        let entry = data.entry_price;
        let exit = data.exit_price;
        // Simplified: pnl = size * |exit - entry| / entry, then subtract funding
        let price_diff: u64 = if data.is_long == 1u64 {
            if exit > entry { exit - entry } else { 0u64 }
        } else {
            if entry > exit { entry - exit } else { 0u64 }
        };
        let pnl = (data.size * price_diff) / entry;
        let final_pnl = if pnl > data.funding_owed_usdc {
            pnl - data.funding_owed_usdc
        } else {
            0u64
        };
        input_ctxt.owner.from_arcis(final_pnl)
    }

    #[instruction]
    pub fn apply_funding(
        input_ctxt: Enc<Shared, FundingInputs>,
    ) -> Enc<Shared, u64> {
        let f = input_ctxt.to_arcis();
        // Simplified: funding = size * rate * hours / 1_000_000
        let funding = (f.size * f.funding_rate_bps * f.hours_elapsed) / 1_000_000u64;
        let funding_owed: u64 = if f.is_long == 1u64 { funding } else { 0u64 };
        input_ctxt.owner.from_arcis(funding_owed)
    }
}
