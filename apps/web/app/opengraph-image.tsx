import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Nexus Seoul — AI Real Estate Underwriting OS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          backgroundColor: '#050813',
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(56,189,248,0.18), transparent 55%), radial-gradient(circle at 85% 90%, rgba(125,211,252,0.12), transparent 55%)',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(125,211,252,0.32)',
              background: 'rgba(125,211,252,0.08)',
              color: '#7dd3fc',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.26em',
              borderRadius: 18
            }}
          >
            NS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: '#ffffff' }}>Nexus Seoul</div>
            <div
              style={{
                fontSize: 14,
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: '0.26em',
                color: '#64748b',
                textTransform: 'uppercase',
                marginTop: 4
              }}
            >
              AI Real Estate Underwriting
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 600,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: '-0.04em',
              maxWidth: 1000,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <span>리서치 · 언더라이팅 · IC를</span>
            <span>한 워크플로 안에서.</span>
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#94a3b8',
              maxWidth: 900,
              display: 'flex'
            }}
          >
            한국 부동산 기관투자를 위한 AI 네이티브 운영 시스템.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 18,
            fontFamily: 'ui-monospace, monospace',
            letterSpacing: '0.22em',
            color: '#64748b',
            textTransform: 'uppercase'
          }}
        >
          <span>QUANT · IM · TOKENIZATION</span>
          <span>nexus-seoul</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
