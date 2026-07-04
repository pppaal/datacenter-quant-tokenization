import { cookies } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { INVESTOR_TOKEN_COOKIE, verifyInvestorToken } from '@/lib/security/investor-token';
import { buildLpPortalOverviewForInvestor } from '@/lib/services/investor-portal-data';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * LP portal — the rendered investor-facing surface over the same
 * investor-scoped view the read-only `/api/portal/overview` serves.
 *
 * Auth model: the page verifies the signed investor cookie itself (this path
 * sits outside the middleware matcher). No valid cookie → an access form that
 * redeems an admin-issued token via POST /portal/access. Everything shown is
 * the LP's own capital account plus high-level fund metrics — never other
 * investors' data (scoping enforced in `buildLpPortalView`).
 */
export default async function PortalPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const investor = await verifyInvestorToken(cookieStore.get(INVESTOR_TOKEN_COOKIE)?.value);

  if (!investor) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
        <Card>
          <div className="eyebrow">Investor Portal</div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Access your capital account</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Paste the access token issued by your fund manager. Tokens are time-limited; ask your
            manager for a fresh link if yours has expired.
          </p>
          {params.error === 'invalid-token' ? (
            <div
              className="mt-4 rounded-[18px] border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.08)] p-3 text-sm text-[hsl(var(--danger))]"
              role="alert"
            >
              That access token is invalid or has expired. Request a new link from your fund
              manager.
            </div>
          ) : null}
          <form method="POST" action="/portal/access" className="mt-6 space-y-3">
            <input
              type="password"
              name="token"
              required
              placeholder="Access token"
              autoComplete="off"
              className="w-full rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/20"
              data-testid="portal-token-input"
            />
            <button
              type="submit"
              className="w-full rounded-[18px] bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              data-testid="portal-token-submit"
            >
              Open portal
            </button>
          </form>
        </Card>
      </main>
    );
  }

  const view = await buildLpPortalOverviewForInvestor(investor.investorId);

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <EmptyState className="rounded-[22px]">
          This investor record is no longer available. Contact your fund manager.
        </EmptyState>
      </main>
    );
  }

  const summaryItems = [
    { label: 'Committed', value: formatCurrency(view.summary.committedKrw) },
    { label: 'Called', value: formatCurrency(view.summary.calledKrw) },
    { label: 'Distributed', value: formatCurrency(view.summary.distributedKrw) },
    { label: 'Unfunded', value: formatCurrency(view.summary.unfundedKrw) },
    { label: 'NAV Share', value: formatCurrency(view.summary.navShareKrw) }
  ];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-12">
      <Card className="hero-mesh">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Investor Portal</div>
            <h1 className="mt-3 text-4xl font-semibold text-white">
              {view.investorName ?? 'Limited Partner'}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {view.investorCode ? `${view.investorCode} / ` : ''}
              {formatNumber(view.summary.fundCount, 0)} fund
              {view.summary.fundCount === 1 ? '' : 's'} — read-only capital account view
            </p>
          </div>
          <a
            href="/portal/access?signout=1"
            className="rounded-full border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
            data-testid="portal-signout"
          >
            Sign out
          </a>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="fine-print">{item.label}</div>
              <div className="mt-2 text-sm font-semibold text-white">{item.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {view.funds.length > 0 ? (
        view.funds.map((fund) => (
          <Card key={fund.fundId} data-testid="portal-fund-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white">{fund.fundName}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {fund.vehicleName ?? 'Fund vehicle'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">Fund NAV {formatCurrency(fund.fundMetrics.navKrw)}</Badge>
                {fund.fundMetrics.navUsedCostBasisFallback ? (
                  <Badge tone="warn">NAV uses cost-basis fallback</Badge>
                ) : null}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="fine-print">Committed</div>
                <div className="mt-1 text-sm text-white">
                  {formatCurrency(fund.capitalAccount.committedKrw)}
                </div>
              </div>
              <div>
                <div className="fine-print">Called</div>
                <div className="mt-1 text-sm text-white">
                  {formatCurrency(fund.capitalAccount.calledKrw)}
                </div>
              </div>
              <div>
                <div className="fine-print">Distributed</div>
                <div className="mt-1 text-sm text-white">
                  {formatCurrency(fund.capitalAccount.distributedKrw)}
                </div>
              </div>
              <div>
                <div className="fine-print">Unfunded</div>
                <div className="mt-1 text-sm text-white">
                  {formatCurrency(fund.capitalAccount.unfundedKrw)}
                </div>
              </div>
              <div>
                <div className="fine-print">NAV Share</div>
                <div className="mt-1 text-sm text-white">
                  {formatCurrency(fund.capitalAccount.navShareKrw)}
                </div>
              </div>
              <div>
                <div className="fine-print">Ownership</div>
                <div className="mt-1 text-sm text-white">
                  {formatPercent(fund.capitalAccount.sharePct)}
                </div>
              </div>
              <div>
                <div className="fine-print">TVPI / DPI</div>
                <div className="mt-1 text-sm text-white">
                  {formatNumber(fund.capitalAccount.tvpiMultiple, 2)}x /{' '}
                  {formatNumber(fund.capitalAccount.dpiMultiple, 2)}x
                </div>
              </div>
              <div>
                <div className="fine-print">Net IRR</div>
                <div className="mt-1 text-sm text-white">
                  {fund.capitalAccount.irrPct === null
                    ? 'N/A'
                    : formatPercent(fund.capitalAccount.irrPct)}
                </div>
              </div>
            </div>
            {fund.capitalAccount.cashflowsAllocatedProRata ? (
              <div className="mt-4 text-xs text-slate-500">
                Cashflow timing allocated pro-rata from fund-level events.
              </div>
            ) : null}
          </Card>
        ))
      ) : (
        <EmptyState className="rounded-[22px]">
          No fund commitments are linked to this account yet.
        </EmptyState>
      )}

      <div className="text-center text-xs text-slate-600">
        Read-only view. Figures are unaudited and provided for information only — refer to your
        official capital account statements.
      </div>
    </main>
  );
}
