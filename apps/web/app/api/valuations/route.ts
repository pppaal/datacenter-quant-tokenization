import { NextResponse } from 'next/server';
import { createValuationRun, listValuationRuns } from '@/lib/services/valuations';

export async function GET() {
  const runs = await listValuationRuns();
  return NextResponse.json(runs);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const run = await createValuationRun(payload);
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create valuation run' },
      { status: 400 }
    );
  }
}
