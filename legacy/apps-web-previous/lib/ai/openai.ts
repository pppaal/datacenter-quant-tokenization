import OpenAI from 'openai';
import { Asset } from '@prisma/client';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateDealReviewMemo(asset: Asset) {
  const prompt = `You are an analyst assistant for Korean institutional data-center deal review.\nReturn JSON with keys: oneLineSummary, investmentHighlights(3), keyRisks(3), dueDiligenceChecklist, investorMemoDraft.\nNo guarantees, no legal compliance claims, no investment certainty language.\nAsset: ${JSON.stringify(asset)}`;

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }]
  });

  const content = resp.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return {
      oneLineSummary: `${asset.name} 검토 요약 초안`,
      investmentHighlights: ['전력수급 확인', '임차 안정성 검증', 'CAPEX/OPEX 구조 확인'],
      keyRisks: ['전력 인입 지연', '원가 상승', '임차인 확정 지연'],
      dueDiligenceChecklist: ['인허가', '전력 인입', 'EPC 계약'],
      investorMemoDraft: '본 문서는 투자판단 자동화가 아닌 검토 보조 초안입니다.'
    };
  }
}
