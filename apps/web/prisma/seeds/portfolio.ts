import {
  CapitalCallStatus,
  CovenantStatus,
  DistributionStatus,
  InvestorReportReleaseStatus,
  InvestorReportType,
  PortfolioAssetStatus,
  TaskPriority,
  TaskStatus,
  VehicleType,
  type PrismaClient
} from '@prisma/client';

/**
 * Seeds the portfolio + capital-formation shell: monthly KPI history,
 * lease rollovers, covenant tests, capex projects, exit cases, and the
 * fund / vehicle / mandate / investor / commitment / capital-call /
 * distribution / investor-report / DDQ graph. Depends on assets being
 * seeded first.
 */
export async function seedPortfolioAndCapitalShell(prisma: PrismaClient): Promise<void> {
  const [officeAsset, dataCenterAsset] = await Promise.all([
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-YEOUIDO-01' },
      include: {
        debtFacilities: true,
        documents: {
          orderBy: {
            updatedAt: 'desc'
          },
          take: 1
        }
      }
    }),
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-GANGSEO-01' },
      include: {
        debtFacilities: true,
        documents: {
          orderBy: {
            updatedAt: 'desc'
          },
          take: 1
        }
      }
    })
  ]);

  if (!officeAsset || !dataCenterAsset) {
    throw new Error('Seed assets for portfolio shell are missing');
  }

  const portfolio = await prisma.portfolio.create({
    data: {
      code: 'KR-INCOME-I',
      name: 'Korea Income & Infrastructure Portfolio I',
      strategy: 'Core Plus',
      baseCurrency: 'KRW',
      market: 'KR',
      thesis:
        'Mixed office and digital infrastructure hold strategy focused on income durability, covenant discipline, and evidence-backed exit planning.',
      assets: {
        create: [
          {
            assetId: officeAsset.id,
            status: PortfolioAssetStatus.ACTIVE,
            acquisitionDate: new Date('2025-12-20T00:00:00.000Z'),
            acquisitionCostKrw: 312000000000,
            currentHoldValueKrw: 328000000000,
            ownershipPct: 100,
            holdPeriodYears: 5,
            assetManager: 'Seoul Asset Management Team',
            notes: 'Held office seed for portfolio OS.',
            businessPlans: {
              create: {
                title: 'Yeouido Leasing And Capex Plan',
                executiveSummary:
                  'Hold through rent reversion and selective lobby/cooling system capex, with an exit case tied to CBD cap-rate compression.',
                holdStrategy: 'Protect occupancy while capturing mark-to-market on mid-term rollover.',
                leasingPlan: 'Close current downtime, defend anchor occupancy, and improve passing-to-market spread.',
                capexPlan: 'Lobby refresh, HVAC optimization, and amenity package upgrades.',
                financingPlan: 'Maintain current senior term debt while preserving DSCR cushion.',
                dispositionPlan: 'Target domestic institutional office buyer universe within 24 months.'
              }
            },
            initiatives: {
              create: [
                {
                  title: 'Anchor tenant rollover capture',
                  category: 'leasing',
                  status: TaskStatus.IN_PROGRESS,
                  priority: TaskPriority.HIGH,
                  ownerName: 'Office Asset Management Lead',
                  targetDate: new Date('2026-05-31T00:00:00.000Z'),
                  summary: 'Negotiate anchor rollover package and defend occupancy before the next committee packet.',
                  nextStep: 'Issue final TI / LC proposal and confirm board timing.'
                },
                {
                  title: 'Amenity upgrade leasing package',
                  category: 'capex',
                  status: TaskStatus.OPEN,
                  priority: TaskPriority.MEDIUM,
                  ownerName: 'Capital Projects Team',
                  targetDate: new Date('2026-06-15T00:00:00.000Z'),
                  summary: 'Tie lobby and arrival refresh to leasing campaign before summer marketing.',
                  nextStep: 'Lock final contractor budget and tenant communications plan.'
                }
              ]
            },
            monthlyKpis: {
              create: [
                {
                  periodStart: new Date('2025-10-01T00:00:00.000Z'),
                  occupancyPct: 92,
                  leasedAreaSqm: 34100,
                  passingRentKrwPerSqmMonth: 39800,
                  marketRentKrwPerSqmMonth: 42300,
                  effectiveRentKrwPerSqmMonth: 38900,
                  noiKrw: 1760000000,
                  opexKrw: 410000000,
                  capexKrw: 120000000,
                  debtOutstandingKrw: 158000000000,
                  debtServiceCoverage: 1.42,
                  ltvPct: 48.4,
                  navKrw: 324000000000,
                  cashBalanceKrw: 6200000000
                },
                {
                  periodStart: new Date('2025-11-01T00:00:00.000Z'),
                  occupancyPct: 92.5,
                  leasedAreaSqm: 34300,
                  passingRentKrwPerSqmMonth: 40100,
                  marketRentKrwPerSqmMonth: 42500,
                  effectiveRentKrwPerSqmMonth: 39200,
                  noiKrw: 1790000000,
                  opexKrw: 408000000,
                  capexKrw: 98000000,
                  debtOutstandingKrw: 157200000000,
                  debtServiceCoverage: 1.44,
                  ltvPct: 48.1,
                  navKrw: 325500000000,
                  cashBalanceKrw: 6400000000
                },
                {
                  periodStart: new Date('2025-12-01T00:00:00.000Z'),
                  occupancyPct: 93,
                  leasedAreaSqm: 34500,
                  passingRentKrwPerSqmMonth: 40400,
                  marketRentKrwPerSqmMonth: 42800,
                  effectiveRentKrwPerSqmMonth: 39500,
                  noiKrw: 1820000000,
                  opexKrw: 405000000,
                  capexKrw: 86000000,
                  debtOutstandingKrw: 156400000000,
                  debtServiceCoverage: 1.46,
                  ltvPct: 47.8,
                  navKrw: 327000000000,
                  cashBalanceKrw: 6700000000
                },
                {
                  periodStart: new Date('2026-01-01T00:00:00.000Z'),
                  occupancyPct: 93.2,
                  leasedAreaSqm: 34600,
                  passingRentKrwPerSqmMonth: 40600,
                  marketRentKrwPerSqmMonth: 43000,
                  effectiveRentKrwPerSqmMonth: 39700,
                  noiKrw: 1840000000,
                  opexKrw: 402000000,
                  capexKrw: 72000000,
                  debtOutstandingKrw: 155600000000,
                  debtServiceCoverage: 1.48,
                  ltvPct: 47.4,
                  navKrw: 328000000000,
                  cashBalanceKrw: 7000000000
                }
              ]
            },
            leaseRollSnapshots: {
              create: {
                asOfDate: new Date('2026-01-01T00:00:00.000Z'),
                next12MonthsExpiringPct: 14,
                next24MonthsExpiringPct: 29,
                weightedAverageLeaseTermYears: 4.8,
                passingRentKrwPerSqmMonth: 40600,
                marketRentKrwPerSqmMonth: 43000,
                occupancyPct: 93.2,
                watchlistSummary: 'Two mid-size tenants roll in the next 24 months; leasing spread remains positive.'
              }
            },
            budgets: {
              create: {
                fiscalYear: 2026,
                label: 'FY2026 Operating Budget',
                approvedAt: new Date('2025-12-15T00:00:00.000Z'),
                notes: 'Approved business-plan budget for hold year 1.',
                lineItems: {
                  create: [
                    {
                      category: 'NOI',
                      label: 'Net operating income',
                      annualBudgetKrw: 22100000000,
                      ytdActualKrw: 1840000000,
                      varianceKrw: -120000000
                    },
                    {
                      category: 'LEASING',
                      label: 'TI / LC reserve',
                      annualBudgetKrw: 2600000000,
                      ytdActualKrw: 72000000,
                      varianceKrw: 11000000
                    },
                    {
                      category: 'OPEX',
                      label: 'Operating expenses',
                      annualBudgetKrw: 4900000000,
                      ytdActualKrw: 402000000,
                      varianceKrw: -8000000
                    }
                  ]
                }
              }
            },
            capexProjects: {
              create: [
                {
                  name: 'Lobby And Arrival Refresh',
                  category: 'amenity',
                  statusLabel: 'IN_PROGRESS',
                  budgetKrw: 1800000000,
                  approvedBudgetKrw: 1900000000,
                  spentToDateKrw: 620000000,
                  targetCompletionDate: new Date('2026-06-30T00:00:00.000Z'),
                  summary: 'Entry experience refresh to support rent reversion.'
                }
              ]
            },
            covenantTests: {
              create: officeAsset.debtFacilities[0]
                ? [
                    {
                      debtFacilityId: officeAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'DSCR',
                      thresholdValue: 1.25,
                      actualValue: 1.48,
                      unit: 'x',
                      status: CovenantStatus.PASS
                    },
                    {
                      debtFacilityId: officeAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'LTV',
                      thresholdValue: 55,
                      actualValue: 47.4,
                      unit: '%',
                      status: CovenantStatus.PASS
                    }
                  ]
                : []
            },
            exitCases: {
              create: {
                caseLabel: '2027 Institutional Office Exit',
                statusLabel: 'ACTIVE',
                underwritingValueKrw: 342000000000,
                targetExitDate: new Date('2027-09-30T00:00:00.000Z'),
                targetCapRatePct: 4.9,
                targetIrrPct: 13.2,
                probabilityPct: 58,
                buyerUniverse: 'Domestic pension / insurance office buyers',
                notes: 'Exit case tied to stabilized occupancy and rent reversion.'
              }
            }
          },
          {
            assetId: dataCenterAsset.id,
            status: PortfolioAssetStatus.WATCHLIST,
            acquisitionDate: new Date('2025-08-01T00:00:00.000Z'),
            acquisitionCostKrw: 286000000000,
            currentHoldValueKrw: 301000000000,
            ownershipPct: 100,
            holdPeriodYears: 6,
            assetManager: 'Digital Infrastructure Team',
            notes: 'Held infrastructure seed for portfolio OS.',
            businessPlans: {
              create: {
                title: 'Seoul Campus Stabilization Plan',
                executiveSummary:
                  'Stabilize the first cloud anchor, clear remaining power allocation, and prepare a refinance once contracted revenue is fully visible.',
                holdStrategy: 'Increase contracted MW and preserve refinancing optionality.',
                leasingPlan: 'Convert AI pod pipeline and push staged ramp toward full utilization.',
                capexPlan: 'Electrical redundancy and white-space fit-out finishing package.',
                financingPlan: 'Bridge from construction debt into term debt once DSCR and anchor contracts season.',
                dispositionPlan: 'Maintain optionality for infra buyers or hold within core-plus vehicle.'
              }
            },
            initiatives: {
              create: [
                {
                  title: 'AI pod conversion and term sheet close',
                  category: 'leasing',
                  status: TaskStatus.BLOCKED,
                  priority: TaskPriority.URGENT,
                  ownerName: 'Digital Infra Leasing Lead',
                  targetDate: new Date('2026-04-30T00:00:00.000Z'),
                  summary: 'Close the AI training pod to clear the covenant watch and support refinance timing.',
                  blockerSummary: 'Tenant board approval and utility redundancy sign-off are both outstanding.',
                  nextStep: 'Run sponsor / tenant utility workshop and collect revised board pack.'
                },
                {
                  title: 'Refinance lender pack readiness',
                  category: 'refinance',
                  status: TaskStatus.IN_PROGRESS,
                  priority: TaskPriority.HIGH,
                  ownerName: 'Portfolio Finance Team',
                  targetDate: new Date('2026-06-10T00:00:00.000Z'),
                  summary: 'Prepare updated lender pack once fit-out and lease evidence are fully approved.',
                  nextStep: 'Roll approved evidence and Q2 KPI trend into the refinance materials.'
                }
              ]
            },
            monthlyKpis: {
              create: [
                {
                  periodStart: new Date('2025-10-01T00:00:00.000Z'),
                  occupancyPct: 68,
                  leasedAreaSqm: 51000,
                  passingRentKrwPerSqmMonth: 221000,
                  marketRentKrwPerSqmMonth: 225000,
                  effectiveRentKrwPerSqmMonth: 214000,
                  noiKrw: 2480000000,
                  opexKrw: 690000000,
                  capexKrw: 410000000,
                  debtOutstandingKrw: 97800000000,
                  debtServiceCoverage: 1.19,
                  ltvPct: 61.5,
                  navKrw: 294000000000,
                  cashBalanceKrw: 7100000000
                },
                {
                  periodStart: new Date('2025-11-01T00:00:00.000Z'),
                  occupancyPct: 69,
                  leasedAreaSqm: 51600,
                  passingRentKrwPerSqmMonth: 223000,
                  marketRentKrwPerSqmMonth: 226000,
                  effectiveRentKrwPerSqmMonth: 216000,
                  noiKrw: 2520000000,
                  opexKrw: 684000000,
                  capexKrw: 380000000,
                  debtOutstandingKrw: 97200000000,
                  debtServiceCoverage: 1.2,
                  ltvPct: 61.1,
                  navKrw: 296000000000,
                  cashBalanceKrw: 7400000000
                },
                {
                  periodStart: new Date('2025-12-01T00:00:00.000Z'),
                  occupancyPct: 70.5,
                  leasedAreaSqm: 52300,
                  passingRentKrwPerSqmMonth: 224000,
                  marketRentKrwPerSqmMonth: 227000,
                  effectiveRentKrwPerSqmMonth: 217000,
                  noiKrw: 2570000000,
                  opexKrw: 679000000,
                  capexKrw: 330000000,
                  debtOutstandingKrw: 96800000000,
                  debtServiceCoverage: 1.22,
                  ltvPct: 60.7,
                  navKrw: 298000000000,
                  cashBalanceKrw: 7700000000
                },
                {
                  periodStart: new Date('2026-01-01T00:00:00.000Z'),
                  occupancyPct: 71.2,
                  leasedAreaSqm: 52800,
                  passingRentKrwPerSqmMonth: 225000,
                  marketRentKrwPerSqmMonth: 228000,
                  effectiveRentKrwPerSqmMonth: 218000,
                  noiKrw: 2610000000,
                  opexKrw: 675000000,
                  capexKrw: 290000000,
                  debtOutstandingKrw: 96400000000,
                  debtServiceCoverage: 1.23,
                  ltvPct: 60.4,
                  navKrw: 301000000000,
                  cashBalanceKrw: 7900000000
                }
              ]
            },
            leaseRollSnapshots: {
              create: {
                asOfDate: new Date('2026-01-01T00:00:00.000Z'),
                next12MonthsExpiringPct: 22,
                next24MonthsExpiringPct: 39,
                weightedAverageLeaseTermYears: 3.6,
                passingRentKrwPerSqmMonth: 225000,
                marketRentKrwPerSqmMonth: 228000,
                occupancyPct: 71.2,
                watchlistSummary: 'AI training pod remains unsigned and drives the next 24-month rollover concentration.'
              }
            },
            budgets: {
              create: {
                fiscalYear: 2026,
                label: 'FY2026 Asset Management Budget',
                approvedAt: new Date('2025-12-20T00:00:00.000Z'),
                notes: 'Budget focused on leasing and fit-out completion.',
                lineItems: {
                  create: [
                    {
                      category: 'NOI',
                      label: 'Net operating income',
                      annualBudgetKrw: 31500000000,
                      ytdActualKrw: 2610000000,
                      varianceKrw: -140000000
                    },
                    {
                      category: 'CAPEX',
                      label: 'Residual fit-out and electrical works',
                      annualBudgetKrw: 4200000000,
                      ytdActualKrw: 290000000,
                      varianceKrw: 40000000
                    },
                    {
                      category: 'OPEX',
                      label: 'Operating expenses',
                      annualBudgetKrw: 8100000000,
                      ytdActualKrw: 675000000,
                      varianceKrw: -12000000
                    }
                  ]
                }
              }
            },
            capexProjects: {
              create: [
                {
                  name: 'Electrical Redundancy Completion',
                  category: 'electrical',
                  statusLabel: 'IN_PROGRESS',
                  budgetKrw: 2600000000,
                  approvedBudgetKrw: 2600000000,
                  spentToDateKrw: 1440000000,
                  targetCompletionDate: new Date('2026-05-31T00:00:00.000Z'),
                  summary: 'Final redundancy package before term refinancing.'
                }
              ]
            },
            covenantTests: {
              create: dataCenterAsset.debtFacilities[0]
                ? [
                    {
                      debtFacilityId: dataCenterAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'DSCR',
                      thresholdValue: 1.25,
                      actualValue: 1.23,
                      unit: 'x',
                      status: CovenantStatus.WATCH,
                      cureNotes: 'Close AI pod lease and complete fit-out before refinance.'
                    },
                    {
                      debtFacilityId: dataCenterAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'LTV',
                      thresholdValue: 62,
                      actualValue: 60.4,
                      unit: '%',
                      status: CovenantStatus.PASS
                    }
                  ]
                : []
            },
            exitCases: {
              create: {
                caseLabel: '2028 Infrastructure Exit',
                statusLabel: 'ACTIVE',
                underwritingValueKrw: 336000000000,
                targetExitDate: new Date('2028-06-30T00:00:00.000Z'),
                targetCapRatePct: 5.9,
                targetIrrPct: 14.1,
                probabilityPct: 46,
                buyerUniverse: 'Infra funds / digital infrastructure strategics',
                notes: 'Exit case depends on full anchor lease visibility and refinance cleanup.'
              }
            }
          }
        ]
      }
    }
  });

  const fund = await prisma.fund.create({
    data: {
      code: 'HIRF-I',
      name: 'Han River Real Estate Fund I',
      strategy: 'Core Plus / Value Add',
      baseCurrency: 'KRW',
      targetSizeKrw: 850000000000,
      committedCapitalKrw: 530000000000,
      investedCapitalKrw: 342000000000,
      dryPowderKrw: 188000000000,
      vintageYear: 2025,
      thesis: 'Korean office and digital infrastructure strategy with review-gated research and disciplined capital formation.',
      portfolioId: portfolio.id,
      vehicles: {
        create: [
          {
            name: 'HIRF-I Main Vehicle',
            vehicleType: VehicleType.FUND,
            jurisdiction: 'KR',
            assetClassFocus: 'OFFICE / DATA_CENTER'
          },
          {
            name: 'Yeouido Holdco SPV',
            vehicleType: VehicleType.SPV,
            jurisdiction: 'KR',
            assetClassFocus: 'OFFICE'
          }
        ]
      },
      mandates: {
        create: [
          {
            title: 'Domestic Pension Income Sleeve',
            investorName: 'Han River Pension',
            strategy: 'Income-first Korean real estate',
            targetAumKrw: 220000000000,
            statusLabel: 'ACTIVE'
          }
        ]
      }
    },
    include: {
      vehicles: true
    }
  });

  const investors = await prisma.$transaction([
    prisma.investor.create({
      data: {
        code: 'INV-HRP-01',
        name: 'Han River Pension',
        investorType: 'Pension',
        domicile: 'KR',
        contactName: 'Institutional Coverage',
        contactEmail: 'pension@example.com'
      }
    }),
    prisma.investor.create({
      data: {
        code: 'INV-SEM-02',
        name: 'Seoul Endowment Management',
        investorType: 'Endowment',
        domicile: 'KR',
        contactName: 'Alternatives Team',
        contactEmail: 'endowment@example.com'
      }
    })
  ]);

  const mainVehicle = fund.vehicles[0]!;

  await prisma.commitment.createMany({
    data: [
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        investorId: investors[0].id,
        commitmentKrw: 320000000000,
        calledKrw: 208000000000,
        distributedKrw: 22000000000,
        signedAt: new Date('2025-07-01T00:00:00.000Z'),
        statusLabel: 'ACTIVE'
      },
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        investorId: investors[1].id,
        commitmentKrw: 210000000000,
        calledKrw: 134000000000,
        distributedKrw: 8000000000,
        signedAt: new Date('2025-07-15T00:00:00.000Z'),
        statusLabel: 'ACTIVE'
      }
    ]
  });

  await prisma.capitalCall.createMany({
    data: [
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        callDate: new Date('2025-09-15T00:00:00.000Z'),
        dueDate: new Date('2025-09-30T00:00:00.000Z'),
        amountKrw: 120000000000,
        purpose: 'Initial acquisitions',
        status: CapitalCallStatus.FUNDED
      },
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        callDate: new Date('2026-02-10T00:00:00.000Z'),
        dueDate: new Date('2026-02-25T00:00:00.000Z'),
        amountKrw: 42000000000,
        purpose: 'Capex and leasing reserves',
        status: CapitalCallStatus.ISSUED
      }
    ]
  });

  await prisma.distribution.create({
    data: {
      fundId: fund.id,
      vehicleId: mainVehicle.id,
      distributionDate: new Date('2026-03-20T00:00:00.000Z'),
      amountKrw: 30000000000,
      purpose: 'Income distribution',
      status: DistributionStatus.PAID
    }
  });

  await prisma.investorReport.createMany({
    data: [
      {
        fundId: fund.id,
        reportType: InvestorReportType.QUARTERLY_UPDATE,
        releaseStatus: InvestorReportReleaseStatus.RELEASED,
        title: 'Q1 2026 Investor Update',
        periodEnd: new Date('2026-03-31T00:00:00.000Z'),
        draftSummary: 'Released quarterly investor letter covering occupancy, refinancing posture, and committee-approved business-plan actions.',
        reviewNotes: 'Released after capital activity reconciliation and operator sign-off.',
        publishedAt: new Date('2026-04-01T00:00:00.000Z'),
        storagePath: 'seed/funds/hirf-i/q1-2026-investor-update.pdf',
        notes: 'Released investor package anchored to portfolio KPI set.'
      },
      {
        fundId: fund.id,
        investorId: investors[0].id,
        reportType: InvestorReportType.QUARTERLY_UPDATE,
        releaseStatus: InvestorReportReleaseStatus.READY,
        title: 'Q2 2026 Pension Sleeve Draft',
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        draftSummary: 'Draft LP update focused on leasing pipeline, covenant watch items, and staged refinance readiness.',
        reviewNotes: 'Awaiting final IC follow-up on the Seoul campus stabilization package before release.',
        notes: 'Held in ready state for controlled release after IC follow-up closes.'
      }
    ]
  });

  await prisma.ddqResponse.create({
    data: {
      fundId: fund.id,
      investorId: investors[0].id,
      title: 'Operations And Evidence Governance',
      question: 'How are underwriting evidence and hold KPIs governed across the platform?',
      answer:
        'All normalized underwriting evidence remains review-gated before promotion, and portfolio KPI / covenant summaries remain offchain within the same operating system.',
      statusLabel: 'COMPLETE'
    }
  });
}
