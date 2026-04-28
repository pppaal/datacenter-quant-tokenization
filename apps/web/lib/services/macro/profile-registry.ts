import { AssetClass } from '@prisma/client';
import type { MacroSensitivityProfile } from '@/lib/services/macro/factors';

type SensitivityModifier = Partial<
  Pick<
    MacroSensitivityProfile,
    | 'capitalRateSensitivity'
    | 'liquiditySensitivity'
    | 'leasingSensitivity'
    | 'constructionSensitivity'
  >
>;

export type MacroSensitivityTemplate = {
  label: string;
  capitalRateSensitivity: number;
  liquiditySensitivity: number;
  leasingSensitivity: number;
  constructionSensitivity: number;
};

export const macroSensitivityTemplateRegistry: Partial<
  Record<AssetClass, MacroSensitivityTemplate>
> = {
  [AssetClass.OFFICE]: {
    label: 'Long-duration leasing and capital-markets sensitive',
    capitalRateSensitivity: 1.15,
    liquiditySensitivity: 1.1,
    leasingSensitivity: 1.15,
    constructionSensitivity: 0.95
  },
  [AssetClass.INDUSTRIAL]: {
    label: 'Flow-of-goods demand with moderate rate sensitivity',
    capitalRateSensitivity: 0.95,
    liquiditySensitivity: 0.95,
    leasingSensitivity: 0.9,
    constructionSensitivity: 1.05
  },
  [AssetClass.RETAIL]: {
    label: 'Consumer and tenant-mix sensitive with higher leasing beta',
    capitalRateSensitivity: 1.05,
    liquiditySensitivity: 1.05,
    leasingSensitivity: 1.2,
    constructionSensitivity: 0.9
  },
  [AssetClass.MULTIFAMILY]: {
    label: 'Residential demand is relatively resilient but cap rates still matter',
    capitalRateSensitivity: 1.05,
    liquiditySensitivity: 0.9,
    leasingSensitivity: 0.85,
    constructionSensitivity: 1.1
  },
  [AssetClass.HOTEL]: {
    label: 'Daily-rate cash flow with higher demand and liquidity volatility',
    capitalRateSensitivity: 1.08,
    liquiditySensitivity: 1.12,
    leasingSensitivity: 1.25,
    constructionSensitivity: 0.92
  },
  [AssetClass.LAND]: {
    label: 'Land pricing is highly rate- and construction-cycle sensitive',
    capitalRateSensitivity: 1.18,
    liquiditySensitivity: 1.05,
    leasingSensitivity: 0.7,
    constructionSensitivity: 1.25
  },
  [AssetClass.MIXED_USE]: {
    label: 'Mixed-use underwriting blends rate sensitivity with multi-tenant leasing dispersion',
    capitalRateSensitivity: 1.08,
    liquiditySensitivity: 1.02,
    leasingSensitivity: 1.02,
    constructionSensitivity: 1.08
  },
  [AssetClass.DATA_CENTER]: {
    label:
      'Infrastructure-style underwriting with elevated replacement-cost and funding sensitivity',
    capitalRateSensitivity: 1.2,
    liquiditySensitivity: 1,
    leasingSensitivity: 0.95,
    constructionSensitivity: 1.3
  }
};

export type CountryProfileRule = {
  country: string;
  assetClass?: AssetClass;
  label: string;
  modifiers: SensitivityModifier;
};

export type SubmarketProfileRule = {
  pattern: RegExp;
  country?: string;
  assetClass?: AssetClass;
  label: string;
  modifiers: SensitivityModifier;
};

export type MacroProfileRuntimeRules = {
  countryRules: CountryProfileRule[];
  submarketRules: SubmarketProfileRule[];
};

export const countryProfileRegistry: CountryProfileRule[] = [
  {
    country: 'US',
    label: 'US liquidity and capital-market depth',
    modifiers: {
      capitalRateSensitivity: 1.05,
      liquiditySensitivity: 1.08
    }
  },
  {
    country: 'KR',
    label: 'Korea construction and refinancing sensitivity',
    modifiers: {
      liquiditySensitivity: 0.96,
      constructionSensitivity: 1.05
    }
  },
  {
    country: 'JP',
    label: 'Japan lower-rate but tighter construction profile',
    modifiers: {
      capitalRateSensitivity: 0.92,
      liquiditySensitivity: 0.95,
      constructionSensitivity: 1.04
    }
  },
  {
    country: 'SG',
    label: 'Singapore gateway liquidity with elevated build-cost pressure',
    modifiers: {
      capitalRateSensitivity: 0.98,
      liquiditySensitivity: 1.08,
      constructionSensitivity: 1.08
    }
  },
  {
    country: 'GB',
    label: 'UK market depth with tighter pricing transmission',
    modifiers: {
      capitalRateSensitivity: 1.04,
      liquiditySensitivity: 1.1
    }
  },
  {
    country: 'AE',
    label: 'UAE growth and supply volatility profile',
    modifiers: {
      liquiditySensitivity: 1.08,
      leasingSensitivity: 1.08,
      constructionSensitivity: 1.1
    }
  },
  {
    country: 'UAE',
    label: 'UAE growth and supply volatility profile',
    modifiers: {
      liquiditySensitivity: 1.08,
      leasingSensitivity: 1.08,
      constructionSensitivity: 1.1
    }
  }
];

export const submarketProfileRegistry: SubmarketProfileRule[] = [
  {
    pattern: /(seoul cbd|gangnam|yeouido)/,
    assetClass: AssetClass.OFFICE,
    label: 'Seoul office core leasing convexity',
    modifiers: {
      capitalRateSensitivity: 1.04,
      leasingSensitivity: 1.08,
      liquiditySensitivity: 0.96
    }
  },
  {
    pattern: /(manhattan|new york|nyc)/,
    assetClass: AssetClass.OFFICE,
    label: 'NYC office duration and liquidity premium',
    modifiers: {
      capitalRateSensitivity: 1.08,
      liquiditySensitivity: 1.12,
      leasingSensitivity: 1.04
    }
  },
  {
    pattern: /(city of london|west end|canary wharf|london)/,
    assetClass: AssetClass.OFFICE,
    label: 'London office market-depth premium',
    modifiers: {
      capitalRateSensitivity: 1.06,
      liquiditySensitivity: 1.1
    }
  },
  {
    pattern: /(northern virginia|ashburn)/,
    assetClass: AssetClass.DATA_CENTER,
    label: 'Northern Virginia data-center power and capital intensity',
    modifiers: {
      capitalRateSensitivity: 1.08,
      liquiditySensitivity: 1.1,
      constructionSensitivity: 1.12
    }
  },
  {
    pattern: /(tokyo|otemachi|marunouchi)/,
    assetClass: AssetClass.OFFICE,
    label: 'Tokyo office lower-rate but tighter replacement-cost profile',
    modifiers: {
      capitalRateSensitivity: 0.95,
      liquiditySensitivity: 0.96,
      constructionSensitivity: 1.06
    }
  },
  {
    pattern: /(singapore cbd|marina bay|raffles place|singapore)/,
    label: 'Singapore gateway pricing transmission',
    modifiers: {
      liquiditySensitivity: 1.08,
      capitalRateSensitivity: 1.02
    }
  },
  {
    pattern: /(incheon|memphis|inland empire|rotterdam)/,
    assetClass: AssetClass.INDUSTRIAL,
    label: 'Global logistics hub flow sensitivity',
    modifiers: {
      leasingSensitivity: 1.08,
      liquiditySensitivity: 1.04
    }
  }
];
