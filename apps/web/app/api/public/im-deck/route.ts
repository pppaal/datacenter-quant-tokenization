/**
 * POST /api/public/im-deck — render an ImDeckInput to a .pptx.
 *
 * Public (the IM / sample report is public). Server-side render keeps pptxgenjs
 * (which pulls node:fs / node:https) OUT of the client bundle — generating the
 * deck client-side broke the webpack browser build. Pure render of caller-
 * supplied content: no data fetch, no side effects; zod caps bound the payload.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildImPptx, deckFilename, type ImDeckInput } from '@/lib/services/exports/im-pptx';

export const dynamic = 'force-dynamic';

const metricSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(60),
  tone: z.enum(['good', 'warn', 'bad']).optional()
});

const sectionSchema = z.object({
  heading: z.string().min(1).max(120),
  body: z.string().max(2000).optional(),
  bullets: z.array(z.string().min(1).max(500)).max(20).optional(),
  metrics: z.array(metricSchema).max(12).optional(),
  table: z
    .object({
      headers: z.array(z.string().max(80)).min(1).max(8),
      rows: z.array(z.array(z.string().max(200)).max(8)).max(200)
    })
    .optional()
});

const deckSchema = z.object({
  title: z.string().min(1).max(160),
  subtitle: z.string().max(200).optional(),
  confidentiality: z.string().max(200).optional(),
  footer: z.string().max(200).optional(),
  sections: z.array(sectionSchema).max(60)
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = deckSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid deck input.' }, { status: 400 });
  }
  const input = parsed.data as ImDeckInput;
  const buffer = await buildImPptx(input);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${deckFilename(input.title)}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store'
    }
  });
}
