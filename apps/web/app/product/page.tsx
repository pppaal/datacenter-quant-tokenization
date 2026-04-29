import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const sections = [
  {
    title: '리서치 인테이크 · 딜 도시에',
    body: '스폰서, 위치, 시장, 가격, 운영 가정, 금융 컨텍스트, 실시간 실행 데이터를 단일 투자 레코드 안에 구조화해 담습니다.'
  },
  {
    title: '증거 검토 · 출처 추적',
    body: '지리공간 · 인허가 · 유틸리티 · 시장 · 거시 · 문서 추출 증거를 같은 레코드로 끌어오면서 신선도, 폴백 사용 여부, 출처(provenance), 리뷰 상태를 함께 추적합니다.'
  },
  {
    title: '언더라이팅 · IC · 준비 패키징',
    body: '평가 · 다운사이드 · DD · 위원회 워크플로를 실행하고, 검토 게이팅(review-gated)된 산출물을 결정론적 readiness 메타데이터와 함께 패키징합니다.'
  },
  {
    title: '포트폴리오 · 자본조달 셸',
    body: '보유 자산 KPI 이력, 커버넌트 테스트, capex 계획, 펀드/SPV/투자자/약정/캐피털콜/배당/리포트 셸을 같은 운영 시스템에서 추적합니다.'
  }
];

const personas = [
  {
    role: '투자운용본부 / 자산운용본부',
    body: '딜 인테이크부터 IC, 클로징, 보유 자산 KPI까지 한 시스템에서 운영합니다. 부서 간 엑셀·PDF 핸드오프를 줄이고, IC가 보는 숫자의 출처를 즉시 추적할 수 있습니다.'
  },
  {
    role: '리서치 · 시장조사팀',
    body: '시장 · 거시 · 임대 · 거래 사례 데이터를 신선도와 출처와 함께 같은 레코드에 적재합니다. 매번 새 보고서를 만드는 대신, 살아있는 증거 모델을 IC에 연결합니다.'
  },
  {
    role: '실사(DD) · 언더라이팅팀',
    body: '재무 · 법률 · 기술 DD 산출물을 검토 게이팅 워크플로 위에서 관리합니다. 평가 · 다운사이드 · 민감도 시나리오는 결정론적으로 재계산되고 readiness 메타데이터로 잠깁니다.'
  },
  {
    role: '펀드 · 자본조달팀 (IR)',
    body: '펀드 · SPV · 투자자 · 약정 · 캐피털콜 · 배당 · 리포팅 셸을 같은 OS에서 추적합니다. 같은 데이터로 IM, 분기 리포트, LP 커뮤니케이션을 산출합니다.'
  }
];

export default function ProductOverviewPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">제품 개요</Badge>
            <Badge>한국 부동산 운용사 OS</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            리서치 · 언더라이팅 · 포트폴리오를
            <br />
            한 워크플로 안에서.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            Nexus Seoul은 한국 부동산 투자팀을 위한 AI 네이티브 운영 시스템입니다. 투자 건을 열고,
            레코드를 보강하고, 증거를 검토하고, 언더라이팅하고, 딜을 실행하고, 포트폴리오 ·
            자본조달 워크플로까지 같은 애플리케이션에서 처리합니다.
          </p>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            데이터센터 · 오피스 · 산업/물류 · 랜드 자산군을 동일한 검토 게이팅 증거 모델 위에서
            다룹니다. 한 곳에서 가정 · 문서 · 산출물이 함께 움직이므로 위원회가 읽는 숫자의 출처가
            항상 추적 가능합니다.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">
            블록체인 레이어는 registry-only 구조입니다 — 문서 해시, 레지스트리 식별자, 패킷
            메타데이터만 앵커링되며, 증거 · 추출 텍스트 · 평가 · 워크플로는 모두 오프체인에
            머무릅니다.
          </p>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">왜 필요한가</div>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            리서치 · 언더라이팅 · 실행 · 포트폴리오 운영 · 자본조달 데이터를 하나의 운영 시스템에
            통합합니다. 자산 인테이크, DD, IC 자료, 포트폴리오 추적, 투자자 리포팅을 별도 도구에
            나누지 않아도 됩니다.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {sections.map((section, index) => (
            <Card key={section.title} className="min-h-[250px]">
              <div className="fine-print">모듈 {String(index + 1).padStart(2, '0')}</div>
              <h2 className="mt-4 text-2xl font-semibold text-white">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">{section.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">누구를 위한 제품인가</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            한국 부동산 운용사의 투자 워크플로 전반.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            리서치팀이 쌓은 증거가 IC 자료가 되고, IC 자료가 클로징 패킷이 되고, 클로징 패킷이
            포트폴리오 KPI · 투자자 리포트로 이어지는 같은 레코드 위에서 동작합니다.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {personas.map((persona) => (
            <Card key={persona.role} className="min-h-[200px]">
              <div className="fine-print">대상 사용자</div>
              <h3 className="mt-4 text-xl font-semibold text-white">{persona.role}</h3>
              <p className="mt-4 text-sm leading-7 text-slate-400">{persona.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
