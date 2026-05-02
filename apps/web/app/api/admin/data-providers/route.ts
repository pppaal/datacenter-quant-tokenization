/**
 * GET /api/admin/data-providers
 *
 * Returns the current mode (live vs mock) for each public-data connector so
 * operators can verify which upstreams are wired in the running environment.
 * Source of truth is `resolveConnectorMode()` in public-data/registry — this
 * endpoint is a thin read-only view over that function.
 */
import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { resolveConnectorMode } from '@/lib/services/public-data/registry';

export const dynamic = 'force-dynamic';

export const GET = withAdminApi({
  auditAction: 'admin_data_providers.read',
  auditEntityType: 'PublicDataRegistry',
  async handler() {
    const modes = resolveConnectorMode();
    return NextResponse.json({ providers: modes });
  }
});
