import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { getCommitteeWorkspace } from '@/lib/services/ic';

export const GET = withAdminApi({
  requiredRole: 'ADMIN',
  auditAction: 'ic.workspace.list',
  auditEntityType: 'committee_workspace',
  async handler() {
    const workspace = await getCommitteeWorkspace();
    return NextResponse.json(workspace);
  }
});
