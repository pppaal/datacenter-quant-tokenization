import json
import math
import sys
from typing import Any, Dict, List


STAGE_MULTIPLIER: Dict[str, float] = {
    "SCREENING": 0.54,
    "LAND_SECURED": 0.62,
    "POWER_REVIEW": 0.72,
    "PERMITTING": 0.81,
    "CONSTRUCTION": 0.90,
    "LIVE": 0.97,
    "STABILIZED": 1.02,
}


def ensure_number(value: Any, fallback: float) -> float:
    try:
        parsed = float(value)
        if math.isfinite(parsed):
            return parsed
    except (TypeError, ValueError):
        pass
    return fallback


def round_krw(value: float) -> int:
    return int(round(value))


def risk_floor_ratio(stage_factor: float, scenario_factor: float = 1.0) -> float:
    base_ratio = 0.22 + (stage_factor * 0.12)
    return min(0.42, max(0.20, base_ratio * scenario_factor))


def build_key_risks(payload: Dict[str, Any]) -> List[str]:
    permit = payload["permitSnapshot"]
    site = payload["siteProfile"]
    market = payload["marketSnapshot"]
    return [
        permit.get("powerApprovalStatus") or "Utility allocation timing remains unconfirmed.",
        site.get("siteNotes") or "Climate resiliency assumptions should be validated against final engineering.",
        market.get("marketNotes") or "Market benchmark refresh is required before committee circulation.",
    ]


def build_checklist() -> List[str]:
    return [
        "Confirm KEPCO power-allocation timeline and redundancy plan.",
        "Validate EPC and cooling strategy against target IT load density.",
        "Reconcile zoning, permit, and environmental milestones with the critical path.",
        "Pressure-test occupancy assumptions against signed pipeline or tenant LOIs.",
        "Cross-check document hashes and version history before any registry anchoring.",
    ]


def scenario_row(name: str, valuation: float, noi: float, exit_cap_rate_pct: float, dscr: float, note: str, order: int) -> Dict[str, Any]:
    implied_yield_pct = 0.0 if valuation <= 0 else round((noi / valuation) * 100, 2)
    return {
        "name": name,
        "valuationKrw": round_krw(valuation),
        "impliedYieldPct": implied_yield_pct,
        "exitCapRatePct": round(exit_cap_rate_pct, 2),
        "debtServiceCoverage": round(max(dscr, 0.75), 2),
        "notes": note,
        "scenarioOrder": order,
    }


def main() -> int:
    payload = json.loads(sys.stdin.read() or "{}")
    asset = payload["asset"]
    address = payload["address"]
    site = payload["siteProfile"]
    permit = payload["permitSnapshot"]
    energy = payload["energySnapshot"]
    market = payload["marketSnapshot"]

    capacity_mw = ensure_number(asset.get("powerCapacityMw") or asset.get("targetItLoadMw"), 12.0)
    capacity_kw = capacity_mw * 1000.0
    occupancy_pct = ensure_number(asset.get("occupancyAssumptionPct"), 92.0 if asset.get("stage") == "STABILIZED" else 68.0)
    monthly_rate_per_kw = ensure_number(market.get("colocationRatePerKwKrw"), 195000.0)
    power_price = ensure_number(energy.get("tariffKrwPerKwh"), 140.0)
    pue = ensure_number(energy.get("pueTarget"), 1.33)
    cap_rate_pct = ensure_number(market.get("capRatePct"), 6.5)
    debt_cost_pct = ensure_number(market.get("debtCostPct"), ensure_number(asset.get("financingRatePct"), 5.3))
    discount_rate_pct = ensure_number(market.get("discountRatePct"), 9.8)
    replacement_cost_per_mw = ensure_number(market.get("constructionCostPerMwKrw"), 7200000000.0)
    capex = ensure_number(asset.get("capexAssumptionKrw"), replacement_cost_per_mw * capacity_mw)
    opex = ensure_number(asset.get("opexAssumptionKrw"), capacity_kw * 62000.0)
    stage_factor = STAGE_MULTIPLIER.get(asset.get("stage"), 0.62)
    power_status = str(permit.get("powerApprovalStatus") or "").lower()
    permit_penalty = 0.93 if "pending" in power_status else 0.98
    flood_penalty = max(0.90, 1 - ensure_number(site.get("floodRiskScore"), 2.0) * 0.015)
    city = str(address.get("city") or "").lower()
    location_premium = 1.04 if "seoul" in city or "incheon" in city else 1.0

    annual_revenue = capacity_kw * monthly_rate_per_kw * 12.0 * (occupancy_pct / 100.0)
    annual_power_cost = capacity_kw * 24.0 * 365.0 * 0.72 * pue * power_price
    annual_opex = annual_power_cost + opex
    stabilized_noi = max(annual_revenue - annual_opex, capex * 0.01)

    income_approach_value = (stabilized_noi / max(cap_rate_pct / 100.0, 0.04)) * stage_factor * permit_penalty * flood_penalty * location_premium
    replacement_cost_floor = max((replacement_cost_per_mw * capacity_mw * 0.82) - (capex * 0.10), capex * 0.35)

    ramp_years = 5
    ramp_start = occupancy_pct * 0.55
    annual_growth = max(0.0, ensure_number(market.get("inflationPct"), 2.3) / 100.0)
    discounted_cashflows: List[float] = []

    for year in range(1, ramp_years + 1):
        year_occupancy = min(occupancy_pct, ramp_start + (occupancy_pct - ramp_start) * (year / ramp_years))
        year_revenue = capacity_kw * monthly_rate_per_kw * 12.0 * (year_occupancy / 100.0) * ((1 + annual_growth) ** (year - 1))
        year_opex = annual_opex * ((1 + annual_growth * 0.75) ** (year - 1))
        year_noi = max(year_revenue - year_opex, capex * 0.008)
        discounted_cashflows.append(year_noi / ((1 + discount_rate_pct / 100.0) ** year))

    terminal_noi = max(stabilized_noi * ((1 + annual_growth) ** ramp_years), capex * 0.01)
    terminal_value = terminal_noi / max((cap_rate_pct + 0.25) / 100.0, 0.045)
    discounted_terminal_value = terminal_value / ((1 + discount_rate_pct / 100.0) ** ramp_years)
    dcf_value = sum(discounted_cashflows) + discounted_terminal_value - (capex * 0.18)

    weighted_value = max(
        (replacement_cost_floor * 0.25) + (income_approach_value * 0.45) + (dcf_value * 0.30) - (capex * 0.05),
        capex * risk_floor_ratio(stage_factor),
    )

    scenario_defs = [
        ("Bull", 1.08, -0.35, 0.97, 0.16, 1.08, "Stronger lease-up and pricing with faster utility approvals."),
        ("Base", 1.00, 0.00, 1.00, 0.00, 1.00, "Base committee case using current source snapshots and analyst assumptions."),
        ("Bear", 0.91, 0.70, 1.08, -0.22, 0.90, "Delayed power allocation and weaker occupancy ramp."),
    ]

    scenarios: List[Dict[str, Any]] = []
    for order, (name, revenue_factor, cap_shift, cost_factor, dscr_bump, floor_factor, note) in enumerate(scenario_defs):
        scenario_noi = max((annual_revenue * revenue_factor) - (annual_opex * cost_factor), capex * 0.01)
        scenario_exit_cap_rate = cap_rate_pct + cap_shift
        scenario_income_value = (
            (scenario_noi / max(scenario_exit_cap_rate / 100.0, 0.045))
            * stage_factor
            * permit_penalty
            * flood_penalty
            * location_premium
        )
        scenario_weighted_value = max(
            (replacement_cost_floor * 0.25)
            + (scenario_income_value * 0.45)
            + (dcf_value * (1.03 if name == "Bull" else 1.0 if name == "Base" else 0.92) * 0.30)
            - (capex * 0.05),
            capex * risk_floor_ratio(stage_factor, floor_factor),
        )
        debt_service = max(capex * (ensure_number(asset.get("financingLtvPct"), 55.0) / 100.0) * (debt_cost_pct / 100.0), 1.0)
        dscr = (scenario_noi / debt_service) + dscr_bump
        scenarios.append(scenario_row(name, scenario_weighted_value, scenario_noi, scenario_exit_cap_rate, dscr, note, order))

    filled_external_sections = sum(
        1 for section in [site, payload.get("buildingSnapshot"), permit, energy, market] if section
    )
    confidence_score = round(
        min(
            9.7,
            4.5
            + (filled_external_sections * 0.85)
            + (0.35 if address.get("latitude") else 0.0)
            + (0.25 if permit.get("powerApprovalStatus") else 0.0)
            - (ensure_number(site.get("floodRiskScore"), 2.0) * 0.05),
        ),
        1,
    )

    assumptions = {
        "capacityMw": capacity_mw,
        "occupancyPct": occupancy_pct,
        "monthlyRatePerKwKrw": monthly_rate_per_kw,
        "powerPriceKrwPerKwh": power_price,
        "pueTarget": pue,
        "capRatePct": cap_rate_pct,
        "debtCostPct": debt_cost_pct,
        "discountRatePct": discount_rate_pct,
        "replacementCostPerMwKrw": replacement_cost_per_mw,
        "capexKrw": capex,
        "opexKrw": opex,
        "stageFactor": stage_factor,
        "permitPenalty": permit_penalty,
        "floodPenalty": flood_penalty,
        "locationPremium": location_premium,
        "replacementCostFloorKrw": round_krw(replacement_cost_floor),
        "incomeApproachValueKrw": round_krw(income_approach_value),
        "dcfValueKrw": round_krw(dcf_value),
        "weightedValueKrw": round_krw(weighted_value),
    }

    result = {
        "baseCaseValueKrw": round_krw(scenarios[1]["valuationKrw"]),
        "confidenceScore": confidence_score,
        "keyRisks": build_key_risks(payload),
        "ddChecklist": build_checklist(),
        "assumptions": assumptions,
        "scenarios": scenarios,
    }

    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
