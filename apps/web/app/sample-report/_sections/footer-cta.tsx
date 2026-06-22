import { Card } from '@/components/ui/card';

const glossary = [
  {
    term: 'Base Case Value',
    ko: '기본 시나리오 가치',
    body: '평가 엔진이 산출한 기본(중립) 시나리오 추정 가치. 위원회 논의의 기준선으로 사용되며, Bull/Bear 시나리오의 폭이 함께 제시됩니다.'
  },
  {
    term: 'Bull / Bear Case',
    ko: '상방 / 하방 시나리오',
    body: '시장 · 임대 · 자본비용 가정의 낙관/비관 케이스에서 산출된 가치. 기본 시나리오 대비 스프레드가 IC 토론의 리스크 한계를 정의합니다.'
  },
  {
    term: 'Implied Yield',
    ko: '암시 수익률',
    body: '평가 가치와 운영 NOI를 기반으로 역산된 수익률. 매입 가격 대비 운영 단계에서 기대되는 현금 수익률을 나타냅니다.'
  },
  {
    term: 'Exit Cap Rate',
    ko: '엑시트 캡레이트',
    body: '보유 종료 시점의 매각 가정 캡레이트. 잔존 가치(terminal value) 산정의 핵심 입력이며, 시장 캡레이트 대비 보수적/공격적 정도를 보여줍니다.'
  },
  {
    term: 'DSCR',
    ko: '부채상환계수 (Debt Service Coverage Ratio)',
    body: '운영 NOI를 연간 원리금 상환액으로 나눈 값. 1.00 이하는 부채 상환 부족, 1.20–1.50이 일반적인 대출 커버넌트 기준.'
  },
  {
    term: 'Confidence Score',
    ko: '신뢰 점수',
    body: '데이터 커버리지 · 신선도 · 폴백 사용 여부를 종합한 평가 신뢰도(0–10). 7.5 이상은 위원회 진행, 5.5–7.5는 조건부, 5.5 미만은 추가 실사 권고.'
  },
  {
    term: 'Provenance',
    ko: '출처 추적',
    body: '평가 입력값마다 어떤 시스템 · 보고서에서 왔는지, 언제 수집되었는지, 폴백 값인지 여부를 기록한 메타데이터. 위원회가 보는 모든 숫자의 추적 단위입니다.'
  },
  {
    term: 'Model Version',
    ko: '모델 버전',
    body: '평가를 산출한 모델의 버전 식별자. 같은 자산이라도 모델 버전이 다르면 가정 트리 · 가중치가 달라질 수 있어 비교 시 항상 함께 표기합니다.'
  }
];

export function FooterCtaSection() {
  return (
    <section className="app-shell space-y-6 py-10">
      <div className="max-w-3xl">
        <div className="eyebrow">용어 해설</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[hsl(var(--foreground))] md:text-4xl">
          이 메모에서 쓰는 평가 용어.
        </h2>
        <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
          샘플 IM은 영문 IC 양식을 그대로 보여줍니다. 표기된 평가 · 시나리오 · 신뢰도 용어는 아래
          정의를 참고해 주세요.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {glossary.map((entry) => (
          <Card key={entry.term} className="min-h-[170px]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{entry.term}</h3>
              <span className="text-sm text-[hsl(var(--foreground-muted))]">{entry.ko}</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
              {entry.body}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
