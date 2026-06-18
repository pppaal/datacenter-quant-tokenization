import { NextResponse } from 'next/server';
import { genericErrorResponse } from '@/lib/security/error-response';
import { generateRiskRegisterFromEngine } from '@/lib/services/asset-risk-register';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const asset = await generateRiskRegisterFromEngine(id);
    return NextResponse.json(asset);
  } catch (error) {
    return genericErrorResponse(error, { message: 'Failed to generate risk register.' });
  }
}
