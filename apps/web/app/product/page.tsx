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

const faqs = [
  {
    q: '블록체인은 어떤 범위에서 쓰입니까?',
    a: 'Registry-only 구조입니다. 문서 해시, 레지스트리 식별자, 패킷 메타데이터만 앵커링됩니다. 증거 · 추출 텍스트 · 평가 · 워크플로 · 투자자 정보는 모두 오프체인에 머무릅니다. 토큰화 모듈도 ERC-3643 스타일 등록·이전 권한을 별도 운영자 키로 통제합니다.'
  },
  {
    q: '어떤 자산군을 다룹니까?',
    a: '데이터센터 · 오피스 · 산업/물류 · 랜드까지 동일한 검토 게이팅 증거 모델 위에서 다룹니다. 자산군별로 가정 템플릿과 KPI 셋이 다르지만, 데이터 레이어와 IC 워크플로는 동일합니다.'
  },
  {
    q: '기존 모델 · 자료를 그대로 가져올 수 있습니까?',
    a: 'PDF · 이미지 · CSV · 엑셀 등 문서 인테이크에서 추출된 텍스트는 출처와 함께 레코드에 적재됩니다. 평가 모델은 시스템의 결정론적 가정 트리에 매핑되어야 하므로 일부 마이그레이션이 필요하지만, 기존 IM · IC 메모는 첨부 · 인용으로 유지됩니다.'
  },
  {
    q: '배포 형태는 어떻게 됩니까?',
    a: '단일 운용사 인스턴스를 기본으로 합니다. Vercel + Postgres + S3 호환 스토리지 위에서 동작하며, IP 화이트리스트, Rate limit, 감사 로그, 세션 쿠키, registry-only 블록체인 키 운영 등 production hardening이 기본 포함됩니다.'
  },
  {
    q: 'IC · 위원회 워크플로를 우리 운영 규칙에 맞출 수 있습니까?',
    a: '예. 평가 → 다운사이드 → DD → 위원회 게이트는 자유롭게 구성됩니다. 검토자 역할, readiness 기준, 결재 단계는 운용사별로 정의되며, 시스템은 결정론적 readiness 메타데이터로 산출물을 잠급니다.'
  }
];

const comparison = [
  {
    dimension: '데이터 모델',
    legacy: '엑셀 시트 · PDF · 이메일 · 폴더로 분산. 같은 자산의 가정이 여러 버전으로 떠 다님.',
    nexus: '하나의 투자 레코드. 가정 · 증거 · 산출물이 같은 ID 아래 결정론적으로 묶입니다.'
  },
  {
    dimension: '증거 · 출처 추적',
    legacy: '평가 시트 한 칸의 숫자가 어느 시장 보고서에서 왔는지 추적 불가. IC 직전 검증 부담.',
    nexus: '신선도, 폴백 사용 여부, 출처(provenance), 리뷰 상태가 셀 단위로 따라옵니다.'
  },
  {
    dimension: 'IC · 위원회 워크플로',
    legacy: 'IM · 메모 · 모델을 매번 재정렬. 위원 의견이 별도 채널에 흩어짐.',
    nexus: '검토 게이팅 워크플로 위에서 평가 · 다운사이드 · DD가 묶여 readiness 메타데이터로 잠깁니다.'
  },
  {
    dimension: '포트폴리오 · LP 리포팅',
    legacy: '보유 자산 KPI · 펀드 리포트가 별도 스프레드시트에서 재집계. 분기마다 같은 작업 반복.',
    nexus: 'KPI 이력 · 커버넌트 · capex · 캐피털콜 · 배당 셸이 같은 OS에서 자동 누적됩니다.'
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

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">기존 워크플로 vs Nexus Seoul</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            엑셀 · PDF 핸드오프를 검토 게이팅 데이터 모델로.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            대부분의 한국 운용사는 리서치 · 언더라이팅 · 포트폴리오 데이터를 부서별 스프레드시트와
            메일로 다룹니다. Nexus Seoul은 같은 데이터를 하나의 운영 레코드 위에 두고 추적 가능한
            상태로 만듭니다.
          </p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40">
          <div className="grid grid-cols-12 border-b border-white/10 bg-white/5 px-6 py-3 text-[11px] font-mono uppercase tracking-[0.24em] text-slate-400">
            <div className="col-span-3">영역</div>
            <div className="col-span-4">기존 도구 (스프레드시트 · PDF · 메일)</div>
            <div className="col-span-5">Nexus Seoul</div>
          </div>
          {comparison.map((row, index) => (
            <div
              key={row.dimension}
              className={`grid grid-cols-12 gap-4 px-6 py-5 text-sm leading-7 ${
                index === comparison.length - 1 ? '' : 'border-b border-white/5'
              }`}
            >
              <div className="col-span-3 font-semibold text-white">{row.dimension}</div>
              <div className="col-span-4 text-slate-400">{row.legacy}</div>
              <div className="col-span-5 text-slate-200">{row.nexus}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">자주 묻는 질문</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            먼저 받는 질문 다섯 가지.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {faqs.map((faq, index) => (
            <Card key={faq.q} className="min-h-[200px]">
              <div className="fine-print">FAQ {String(index + 1).padStart(2, '0')}</div>
              <h3 className="mt-3 text-lg font-semibold text-white">{faq.q}</h3>
              <p className="mt-4 text-sm leading-7 text-slate-400">{faq.a}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
