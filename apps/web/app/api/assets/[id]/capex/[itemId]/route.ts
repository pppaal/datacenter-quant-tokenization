import { NextResponse } from 'next/server';
import { deleteCapexLineItem, updateCapexLineItem } from '@/lib/services/capex-book';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const payload = await request.json();
    const item = await updateCapexLineItem(id, itemId, payload);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update CAPEX line item' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const result = await deleteCapexLineItem(id, itemId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete CAPEX line item' },
      { status: 400 }
    );
  }
}
