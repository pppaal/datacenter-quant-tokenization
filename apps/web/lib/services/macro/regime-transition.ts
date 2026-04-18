import type { MacroRegimeBlock, MacroInterpretation } from '@/lib/services/macro/regime';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegimeTransition = {
  block: string;
  label: string;
  previousState: string;
  currentState: string;
  direction: 'TIGHTENING' | 'EASING' | 'LATERAL';
  severity: 'MINOR' | 'MAJOR';
  commentary: string;
};

export type RegimeTransitionSummary = {
  hasTransition: boolean;
  transitions: RegimeTransition[];
  overallDirection: 'TIGHTENING' | 'EASING' | 'STABLE' | 'MIXED';
  alertLevel: 'NONE' | 'WATCH' | 'ALERT' | 'CRITICAL';
  headline: string;
};

// ---------------------------------------------------------------------------
// State ordering (looser → tighter)
// ---------------------------------------------------------------------------

const STATE_SEVERITY_ORDER: Record<string, number> = {
  // capitalMarkets
  SUPPORTIVE: 0,
  NEUTRAL: 1,
  TIGHT: 2,
  // leasing
  STRONG: 0,
  BALANCED: 1,
  SOFT: 2,
  // construction
  CONTAINED: 0,
  ELEVATED: 1,
  HIGH: 2,
  // refinance
  LOW: 0,
  MODERATE: 1,
  // HIGH is already 2
};

function getStateSeverity(state: string): number {
  return STATE_SEVERITY_ORDER[state] ?? 1;
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

const BLOCK_LABELS: Record<string, string> = {
  capitalMarkets: 'Capital Markets',
  leasing: 'Leasing',
  construction: 'Construction',
  refinance: 'Refinancing',
};

function classifyTransitionDirection(prevSeverity: number, currSeverity: number): RegimeTransition['direction'] {
  if (currSeverity > prevSeverity) return 'TIGHTENING';
  if (currSeverity < prevSeverity) return 'EASING';
  return 'LATERAL';
}

function classifyTransitionSeverity(prevSeverity: number, currSeverity: number): RegimeTransition['severity'] {
  return Math.abs(currSeverity - prevSeverity) >= 2 ? 'MAJOR' : 'MINOR';
}

function buildTransitionCommentary(
  blockKey: string,
  prevState: string,
  currState: string,
  direction: RegimeTransition['direction']
): string {
  const label = BLOCK_LABELS[blockKey] ?? blockKey;
  if (direction === 'TIGHTENING') {
    return `${label} regime shifted from ${prevState} to ${currState}. Conditions are deteriorating — review underwriting assumptions.`;
  }
  if (direction === 'EASING') {
    return `${label} regime improved from ${prevState} to ${currState}. Conditions are becoming more supportive.`;
  }
  return `${label} regime moved laterally from ${prevState} to ${currState}. No material change in stance.`;
}

// ---------------------------------------------------------------------------
// Core: detect regime transitions
// ---------------------------------------------------------------------------

export function detectRegimeTransitions(
  current: MacroInterpretation,
  previous: MacroInterpretation | null
): RegimeTransitionSummary {
  if (!previous) {
    return {
      hasTransition: false,
      transitions: [],
      overallDirection: 'STABLE',
      alertLevel: 'NONE',
      headline: 'No prior regime available for comparison.'
    };
  }

  const transitions: RegimeTransition[] = [];
  const blockKeys = ['capitalMarkets', 'leasing', 'construction', 'refinance'] as const;

  for (const key of blockKeys) {
    const prevBlock = previous.regimes[key];
    const currBlock = current.regimes[key];

    if (prevBlock.state === currBlock.state) continue;

    const prevSev = getStateSeverity(prevBlock.state);
    const currSev = getStateSeverity(currBlock.state);
    const direction = classifyTransitionDirection(prevSev, currSev);
    const severity = classifyTransitionSeverity(prevSev, currSev);

    transitions.push({
      block: key,
      label: BLOCK_LABELS[key] ?? key,
      previousState: prevBlock.state,
      currentState: currBlock.state,
      direction,
      severity,
      commentary: buildTransitionCommentary(key, prevBlock.state, currBlock.state, direction)
    });
  }

  if (transitions.length === 0) {
    return {
      hasTransition: false,
      transitions: [],
      overallDirection: 'STABLE',
      alertLevel: 'NONE',
      headline: 'All regime blocks are unchanged from the prior period.'
    };
  }

  const tighteningCount = transitions.filter((t) => t.direction === 'TIGHTENING').length;
  const easingCount = transitions.filter((t) => t.direction === 'EASING').length;
  const majorCount = transitions.filter((t) => t.severity === 'MAJOR').length;

  const overallDirection: RegimeTransitionSummary['overallDirection'] =
    tighteningCount > 0 && easingCount > 0
      ? 'MIXED'
      : tighteningCount > 0
        ? 'TIGHTENING'
        : easingCount > 0
          ? 'EASING'
          : 'STABLE';

  const alertLevel: RegimeTransitionSummary['alertLevel'] =
    majorCount >= 2
      ? 'CRITICAL'
      : majorCount >= 1 || tighteningCount >= 2
        ? 'ALERT'
        : tighteningCount >= 1
          ? 'WATCH'
          : 'NONE';

  const transitionLabels = transitions.map(
    (t) => `${t.label}: ${t.previousState} → ${t.currentState}`
  );

  const headline =
    alertLevel === 'CRITICAL'
      ? `Multiple major regime shifts detected: ${transitionLabels.join('; ')}. Immediate underwriting review recommended.`
      : alertLevel === 'ALERT'
        ? `Regime alert: ${transitionLabels.join('; ')}. Review active deal assumptions.`
        : alertLevel === 'WATCH'
          ? `Regime watch: ${transitionLabels.join('; ')}. Monitor for further deterioration.`
          : `Minor regime changes: ${transitionLabels.join('; ')}.`;

  return {
    hasTransition: true,
    transitions,
    overallDirection,
    alertLevel,
    headline
  };
}
