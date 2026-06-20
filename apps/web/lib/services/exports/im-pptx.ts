/**
 * Investment-memo PowerPoint (.pptx) deck builder.
 *
 * Turns a clean, presentation-oriented `ImDeckInput` into a brand-styled
 * institutional deck (cover + one slide per section, with bullets / metric
 * grids / tables). Decoupled from the rich `SampleReportData` bundle on
 * purpose — any caller (the IM page, the operator console, an export script)
 * maps its data to `ImDeckInput` and gets a consistent deck.
 *
 * Brand palette mirrors `app/globals.css` :root (the Figma token source). Keep
 * these in sync with `design/figma-tokens.json` — pptxgenjs wants hex WITHOUT
 * the leading `#`.
 */
import pptxgen from 'pptxgenjs';

/** Hex (no #) mirror of the globals.css :root palette. */
const BRAND = {
  accent: '0A74AE', // --accent
  ink: '151B28', // --foreground
  muted: '515E72', // --foreground-muted
  faint: '97A0AD', // --foreground-faint
  hairline: 'DDE2E9', // --border
  panelAlt: 'F6F7F9', // --panel-alt
  white: 'FFFFFF',
  success: '20794F', // --success
  warning: 'A86511', // --warning
  danger: 'BC2E24' // --danger
} as const;

const FONT = 'Inter';

export type ImDeckMetric = { label: string; value: string; tone?: 'good' | 'warn' | 'bad' };

export type ImDeckTable = { headers: string[]; rows: string[][] };

export type ImDeckSection = {
  heading: string;
  /** Short lead paragraph under the heading. */
  body?: string;
  bullets?: string[];
  /** Rendered as a metric grid (up to 4 across). */
  metrics?: ImDeckMetric[];
  table?: ImDeckTable;
};

export type ImDeckInput = {
  title: string;
  subtitle?: string;
  /** e.g. "CONFIDENTIAL — for the named recipient only". */
  confidentiality?: string;
  /** Footer line (firm name / date). */
  footer?: string;
  sections: ImDeckSection[];
};

function toneColor(tone: ImDeckMetric['tone']): string {
  if (tone === 'good') return BRAND.success;
  if (tone === 'warn') return BRAND.warning;
  if (tone === 'bad') return BRAND.danger;
  return BRAND.ink;
}

function addFooter(slide: pptxgen.Slide, footer: string | undefined, pageNo: number) {
  slide.addText(
    [
      { text: footer ?? '', options: { color: BRAND.faint, fontSize: 8 } },
      { text: footer ? '  ·  ' : '', options: { color: BRAND.faint, fontSize: 8 } },
      { text: String(pageNo), options: { color: BRAND.faint, fontSize: 8 } }
    ],
    { x: 0.5, y: 7.0, w: 12.33, h: 0.3, align: 'right', fontFace: FONT }
  );
}

function addCover(pptx: pptxgen, input: ImDeckInput) {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.ink };
  if (input.confidentiality) {
    slide.addText(input.confidentiality.toUpperCase(), {
      x: 0.6,
      y: 0.5,
      w: 12.1,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9,
      color: BRAND.faint,
      charSpacing: 2
    });
  }
  slide.addText(input.title, {
    x: 0.6,
    y: 2.6,
    w: 12.1,
    h: 1.6,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: BRAND.white
  });
  if (input.subtitle) {
    slide.addText(input.subtitle, {
      x: 0.62,
      y: 4.2,
      w: 12.1,
      h: 0.8,
      fontFace: FONT,
      fontSize: 18,
      color: BRAND.faint
    });
  }
  // Accent rule.
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.65,
    y: 2.45,
    w: 1.6,
    h: 0.06,
    fill: { color: BRAND.accent }
  });
  if (input.footer) {
    slide.addText(input.footer, {
      x: 0.6,
      y: 6.9,
      w: 12.1,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9,
      color: BRAND.faint
    });
  }
}

function addSectionSlide(
  pptx: pptxgen,
  section: ImDeckSection,
  footer: string | undefined,
  pageNo: number
) {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.white };
  // Heading + accent underline.
  slide.addText(section.heading, {
    x: 0.5,
    y: 0.45,
    w: 12.33,
    h: 0.6,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: BRAND.ink
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.52,
    y: 1.08,
    w: 1.1,
    h: 0.05,
    fill: { color: BRAND.accent }
  });

  let y = 1.4;
  if (section.body) {
    slide.addText(section.body, {
      x: 0.5,
      y,
      w: 12.33,
      h: 0.8,
      fontFace: FONT,
      fontSize: 13,
      color: BRAND.muted
    });
    y += 0.9;
  }

  if (section.metrics && section.metrics.length > 0) {
    const perRow = Math.min(4, section.metrics.length);
    const gap = 0.2;
    const w = (12.33 - gap * (perRow - 1)) / perRow;
    section.metrics.forEach((metric, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = 0.5 + col * (w + gap);
      const my = y + row * 1.15;
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: my,
        w,
        h: 1.0,
        fill: { color: BRAND.panelAlt },
        line: { color: BRAND.hairline, width: 1 },
        rectRadius: 0.06
      });
      slide.addText(metric.label.toUpperCase(), {
        x: x + 0.12,
        y: my + 0.1,
        w: w - 0.24,
        h: 0.3,
        fontFace: FONT,
        fontSize: 9,
        color: BRAND.faint,
        charSpacing: 1
      });
      slide.addText(metric.value, {
        x: x + 0.12,
        y: my + 0.4,
        w: w - 0.24,
        h: 0.5,
        fontFace: FONT,
        fontSize: 20,
        bold: true,
        color: toneColor(metric.tone)
      });
    });
    y += Math.ceil(section.metrics.length / perRow) * 1.15 + 0.1;
  }

  if (section.bullets && section.bullets.length > 0) {
    slide.addText(
      section.bullets.map((text) => ({
        text,
        options: {
          bullet: { characterCode: '2022' },
          color: BRAND.ink,
          fontSize: 13,
          paraSpaceAfter: 6
        }
      })),
      { x: 0.6, y, w: 12.2, h: 5.8 - y, fontFace: FONT, valign: 'top' }
    );
  }

  if (section.table) {
    const header = section.table.headers.map((h) => ({
      text: h,
      options: { bold: true, color: BRAND.white, fill: { color: BRAND.accent }, fontSize: 11 }
    }));
    const body = section.table.rows.map((r, ri) =>
      r.map((cell) => ({
        text: cell,
        options: {
          color: BRAND.ink,
          fontSize: 11,
          fill: { color: ri % 2 === 0 ? BRAND.white : BRAND.panelAlt }
        }
      }))
    );
    slide.addTable([header, ...body], {
      x: 0.5,
      y,
      w: 12.33,
      border: { type: 'solid', color: BRAND.hairline, pt: 0.5 },
      fontFace: FONT,
      autoPage: true
    });
  }

  addFooter(slide, footer, pageNo);
}

/** Assemble the slides (shared by the Node-buffer and browser-blob writers). */
function assembleDeck(input: ImDeckInput): pptxgen {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'Investment Firm OS';
  pptx.title = input.title;

  addCover(pptx, input);
  input.sections.forEach((section, i) => addSectionSlide(pptx, section, input.footer, i + 2));
  return pptx;
}

/**
 * Render an `ImDeckInput` to a .pptx byte buffer (Node — server routes/scripts).
 * Async because pptxgenjs serializes the OOXML zip asynchronously.
 */
export async function buildImPptx(input: ImDeckInput): Promise<Buffer> {
  const out = await assembleDeck(input).write({ outputType: 'nodebuffer' });
  return out as Buffer;
}

/**
 * Render an `ImDeckInput` to a `Blob` (browser — client-side download without a
 * server route, so a public page like the sample IM can export without auth).
 */
export async function buildImPptxBlob(input: ImDeckInput): Promise<Blob> {
  const out = await assembleDeck(input).write({ outputType: 'blob' });
  return out as Blob;
}

/** Filename-safe slug for the downloaded deck. */
export function deckFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'investment-memo'}.pptx`;
}
