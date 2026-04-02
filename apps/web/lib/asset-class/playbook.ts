import { AssetClass } from '@prisma/client';

export type ResearchDisciplineKey =
  | 'location_parcel'
  | 'zoning_permit_entitlement'
  | 'building_physical'
  | 'ownership_encumbrance_planning'
  | 'lease_revenue'
  | 'tax_debt_structure'
  | 'document_coverage';

export type AssetClassPlaybook = {
  assetClass: AssetClass;
  label: string;
  shortLabel: string;
  verticalDescription: string;
  sizeLabel: string;
  sizeUnitLabel: string;
  intakeHeading: string;
  reviewQueueDescription: string;
  researchHeadline: string;
  marketHeadline: string;
  checklistLabels: {
    commercial: string;
    technical: string;
    legal: string;
  };
  valuationVariableFamilies: string[];
  researchDisciplineLabels: Record<ResearchDisciplineKey, string>;
  marketIndicators: string[];
  compCoverageLabels: string[];
  operatorFocusPoints: string[];
};

const universalDisciplineLabels: Record<ResearchDisciplineKey, string> = {
  location_parcel: 'Location / Parcel',
  zoning_permit_entitlement: 'Zoning / Permit / Entitlement',
  building_physical: 'Building / Physical',
  ownership_encumbrance_planning: 'Ownership / Encumbrance / Planning',
  lease_revenue: 'Lease / Revenue',
  tax_debt_structure: 'Tax / Debt / Structure',
  document_coverage: 'Document Coverage'
};

const playbooks: Record<AssetClass, AssetClassPlaybook> = {
  DATA_CENTER: {
    assetClass: AssetClass.DATA_CENTER,
    label: 'Data Center',
    shortLabel: 'DC',
    verticalDescription: 'Institutional underwriting for Korean hyperscale, colocation, and edge opportunities.',
    sizeLabel: 'Power Capacity',
    sizeUnitLabel: 'MW',
    intakeHeading: 'Power, permit, and lease certainty',
    reviewQueueDescription:
      'Review utility, permit, legal, and customer evidence before capacity, revenue, or readiness outputs rely on them.',
    researchHeadline: 'Power-backed infrastructure research',
    marketHeadline: 'Capacity pricing, vacancy, and build cost context',
    checklistLabels: {
      commercial: 'Revenue And Capacity',
      technical: 'Power, Permit, And Site',
      legal: 'Legal, Title, And Execution'
    },
    valuationVariableFamilies: [
      'power and utility assumptions',
      'colocation pricing and vacancy',
      'PUE and resilience',
      'permit timing and delivery risk',
      'lease ramp and contracted capacity'
    ],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['vacancy', 'colocation rate', 'cap rate', 'discount rate', 'debt cost', 'construction cost'],
    compCoverageLabels: ['transaction comps', 'rent comps', 'pipeline projects'],
    operatorFocusPoints: ['utility allocation', 'permit certainty', 'lease-up quality', 'replacement cost']
  },
  OFFICE: {
    assetClass: AssetClass.OFFICE,
    label: 'Office',
    shortLabel: 'Office',
    verticalDescription: 'Institutional underwriting for Korean CBD and decentralized office investments.',
    sizeLabel: 'Rentable Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Rent roll, occupancy, and rollover certainty',
    reviewQueueDescription:
      'Review legal, lease, and site evidence before office underwriting outputs and committee material rely on them.',
    researchHeadline: 'Office market and micro diligence',
    marketHeadline: 'Passing rent, market rent, vacancy, and cap-rate context',
    checklistLabels: {
      commercial: 'Leasing, Rollover, And Market',
      technical: 'Building, Site, And Entitlement',
      legal: 'Legal, Title, And Financing'
    },
    valuationVariableFamilies: [
      'passing rent vs market rent',
      'occupancy and stabilized occupancy',
      'WALE and rollover',
      'TI / LC reserves and downtime',
      'rent comp, cap-rate, and vacancy benchmarks'
    ],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['market rent', 'vacancy', 'cap rate', 'discount rate', 'rent growth', 'transaction volume'],
    compCoverageLabels: ['transaction comps', 'rent comps', 'submarket indicators'],
    operatorFocusPoints: ['rollover durability', 'market rent gap', 'TI / LC drag', 'leasing depth']
  },
  INDUSTRIAL: {
    assetClass: AssetClass.INDUSTRIAL,
    label: 'Industrial / Logistics',
    shortLabel: 'Industrial',
    verticalDescription: 'Institutional underwriting for Korean logistics, urban infill, and light-industrial assets.',
    sizeLabel: 'Rentable Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Fit, access, and tenant durability',
    reviewQueueDescription:
      'Review building fit, land access, legal, and lease evidence before industrial underwriting relies on them.',
    researchHeadline: 'Industrial fit and logistics research',
    marketHeadline: 'Logistics rent, vacancy, and access-driven market context',
    checklistLabels: {
      commercial: 'Tenant Durability And Market',
      technical: 'Physical Fit, Access, And Entitlement',
      legal: 'Legal, Land, And Financing'
    },
    valuationVariableFamilies: [
      'market rent and stabilized occupancy',
      'physical fit, clear height, loading, and yard depth',
      'tenant durability and downtime',
      'land access and permit readiness'
    ],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['market rent', 'vacancy', 'cap rate', 'discount rate', 'transaction volume'],
    compCoverageLabels: ['transaction comps', 'rent comps', 'pipeline projects'],
    operatorFocusPoints: ['access and yard fit', 'tenant covenant', 'land control', 'rent durability']
  },
  RETAIL: {
    assetClass: AssetClass.RETAIL,
    label: 'Retail',
    shortLabel: 'Retail',
    verticalDescription: 'Institutional underwriting for Korean retail and mixed merchandising assets.',
    sizeLabel: 'Rentable Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Occupancy, tenant mix, and site durability',
    reviewQueueDescription:
      'Review legal, lease, and site evidence before retail underwriting outputs rely on them.',
    researchHeadline: 'Retail market and asset research',
    marketHeadline: 'Occupancy, rent, and liquidity context',
    checklistLabels: {
      commercial: 'Tenant Mix And Revenue',
      technical: 'Site, Physical, And Entitlement',
      legal: 'Legal, Title, And Financing'
    },
    valuationVariableFamilies: ['market rent', 'occupancy', 'tenant durability', 'cap rate benchmarks'],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['market rent', 'vacancy', 'cap rate', 'consumer demand'],
    compCoverageLabels: ['transaction comps', 'rent comps'],
    operatorFocusPoints: ['tenant durability', 'footfall sensitivity', 'site access']
  },
  MULTIFAMILY: {
    assetClass: AssetClass.MULTIFAMILY,
    label: 'Multifamily',
    shortLabel: 'Multifamily',
    verticalDescription: 'Institutional underwriting for Korean residential rental assets.',
    sizeLabel: 'Rentable Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Occupancy, rent, and turnover certainty',
    reviewQueueDescription:
      'Review lease, legal, and document evidence before multifamily underwriting outputs rely on them.',
    researchHeadline: 'Rental market and asset research',
    marketHeadline: 'Occupancy, concessions, and exit context',
    checklistLabels: {
      commercial: 'Rent, Turnover, And Market',
      technical: 'Physical, Site, And Entitlement',
      legal: 'Legal, Title, And Financing'
    },
    valuationVariableFamilies: ['rent roll', 'occupancy', 'turnover', 'market rent', 'vacancy benchmarks'],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['market rent', 'vacancy', 'cap rate', 'household demand'],
    compCoverageLabels: ['transaction comps', 'rent comps'],
    operatorFocusPoints: ['occupancy durability', 'turnover drag', 'market rent gap']
  },
  HOTEL: {
    assetClass: AssetClass.HOTEL,
    label: 'Hotel',
    shortLabel: 'Hotel',
    verticalDescription: 'Institutional underwriting for Korean hospitality assets.',
    sizeLabel: 'Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Operations, legal, and site certainty',
    reviewQueueDescription:
      'Review site, legal, and operating evidence before hospitality underwriting outputs rely on them.',
    researchHeadline: 'Hospitality market research',
    marketHeadline: 'Demand, ADR, occupancy, and exit context',
    checklistLabels: {
      commercial: 'Revenue And Demand',
      technical: 'Property, Site, And Entitlement',
      legal: 'Legal, Title, And Financing'
    },
    valuationVariableFamilies: ['occupancy', 'ADR', 'NOI margin', 'cap rate'],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['occupancy', 'ADR', 'cap rate'],
    compCoverageLabels: ['transaction comps', 'operating comps'],
    operatorFocusPoints: ['operator quality', 'demand volatility', 'capex cycle']
  },
  LAND: {
    assetClass: AssetClass.LAND,
    label: 'Land',
    shortLabel: 'Land',
    verticalDescription: 'Institutional underwriting for Korean land and entitlement opportunities.',
    sizeLabel: 'Land Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Parcel, entitlement, and legal certainty',
    reviewQueueDescription:
      'Review parcel, planning, permit, and legal evidence before land underwriting outputs rely on them.',
    researchHeadline: 'Land and entitlement research',
    marketHeadline: 'Land pricing, planning, and transaction context',
    checklistLabels: {
      commercial: 'Land Pricing And Market',
      technical: 'Parcel, Zoning, And Permit',
      legal: 'Title, Encumbrance, And Structure'
    },
    valuationVariableFamilies: ['land value', 'planning constraints', 'permit path', 'exit pricing'],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['land price', 'transactions', 'official land value'],
    compCoverageLabels: ['transaction comps', 'parcel indicators'],
    operatorFocusPoints: ['parcel certainty', 'planning constraints', 'title clarity']
  },
  MIXED_USE: {
    assetClass: AssetClass.MIXED_USE,
    label: 'Mixed Use',
    shortLabel: 'Mixed Use',
    verticalDescription: 'Institutional underwriting for Korean mixed-use assets.',
    sizeLabel: 'Area',
    sizeUnitLabel: 'sqm',
    intakeHeading: 'Component-level revenue and legal certainty',
    reviewQueueDescription:
      'Review commercial, legal, and entitlement evidence before mixed-use underwriting outputs rely on them.',
    researchHeadline: 'Mixed-use market research',
    marketHeadline: 'Segment mix, rent, and cap-rate context',
    checklistLabels: {
      commercial: 'Segment Revenue And Market',
      technical: 'Property, Site, And Entitlement',
      legal: 'Legal, Title, And Financing'
    },
    valuationVariableFamilies: ['segment rents', 'occupancy mix', 'cap rate bands'],
    researchDisciplineLabels: universalDisciplineLabels,
    marketIndicators: ['rent', 'vacancy', 'cap rate'],
    compCoverageLabels: ['transaction comps', 'segment rent comps'],
    operatorFocusPoints: ['segment mix', 'legal structure', 'capex sequencing']
  }
};

export function getAssetClassPlaybook(assetClass: AssetClass | null | undefined) {
  if (!assetClass) return playbooks.DATA_CENTER;
  return playbooks[assetClass] ?? playbooks.DATA_CENTER;
}

export function listAssetClassPlaybooks() {
  return Object.values(playbooks);
}
