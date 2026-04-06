import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { AdminLoginForm } from '@/components/admin/admin-login-form';
import { AdminSsoButton } from '@/components/admin/admin-sso-button';
import { getAdminSsoConfig } from '@/lib/security/admin-sso';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const ssoConfig = getAdminSsoConfig();
  const showSso = ssoConfig.mode === 'configured';

  return (
    <main className="app-shell pb-16 pt-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Operator Session</Badge>
            <Badge tone="neutral">Session / SSO-ready</Badge>
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white">
            Sign in to the investment-firm operating console.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            Session-based operator access is now the primary path for admin workflows. Basic auth remains available for
            automation, browser smoke coverage, and protected cron routes.
          </p>
        </Card>

        <Card>
          <div className="grid gap-8 md:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="eyebrow">Session Login</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Start a role-aware operator session</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Viewer, analyst, and admin credentials map into the same role matrix enforced by middleware and admin
                API routes. This shell is designed to lift the platform from shared basic auth toward SSO-backed
                sessions without changing the operator workflows.
              </p>
              {showSso ? (
                <div className="mt-5 space-y-3">
                  <div className="fine-print">SSO Provider</div>
                  <AdminSsoButton />
                </div>
              ) : null}
            </div>
            <div className="space-y-4">
              {params.error ? (
                <div className="rounded-[18px] border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  Unable to complete operator sign-in. Check SSO/session configuration or retry with operator
                  credentials.
                </div>
              ) : null}
              <AdminLoginForm />
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
