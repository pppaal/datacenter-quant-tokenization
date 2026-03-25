import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { NextRequest, NextResponse } from 'next/server';

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return null;
  }
  return session;
}

export function ensureSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return false;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

export function forbidden() {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
