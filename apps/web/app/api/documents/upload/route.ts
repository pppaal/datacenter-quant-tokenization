import { NextResponse } from 'next/server';
import { uploadDocumentVersion } from '@/lib/services/documents';
import { UploadPolicyError, validateDocumentUpload } from '@/lib/security/upload-policy';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    validateDocumentUpload(file);

    const payload = Object.fromEntries(formData.entries());
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadDocumentVersion(payload, {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      buffer
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    if (error instanceof UploadPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload document' },
      { status: 400 }
    );
  }
}
