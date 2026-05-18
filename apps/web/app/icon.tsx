import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0b1220 0%, #112036 100%)',
          color: '#7dd3fc',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.18em',
          fontFamily: 'system-ui, sans-serif',
          borderRadius: 6
        }}
      >
        NS
      </div>
    ),
    { ...size }
  );
}
