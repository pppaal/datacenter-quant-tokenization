import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authorizeAdminScimRequest, deprovisionAdminUser } from '@/lib/security/admin-scim';

type UserPatchPayload = {
  role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
  isActive?: boolean;
  name?: string;
  email?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as UserPatchPayload | null;
  if (!payload) {
    return NextResponse.json({ error: 'Patch payload is required.' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: {
      id
    },
    data: {
      role: payload.role,
      isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
      name: payload.name?.trim() || undefined,
      email: payload.email?.trim() || undefined
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  });

  return NextResponse.json({
    ok: true,
    user
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const user = await deprovisionAdminUser(
      {
        userId: id
      },
      prisma
    );

    return NextResponse.json({
      ok: true,
      user
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to deprovision user.'
      },
      { status: 400 }
    );
  }
}
