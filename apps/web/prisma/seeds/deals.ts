import {
  ActivityType,
  AssetClass,
  DealBidStatus,
  DealLenderQuoteStatus,
  DealNegotiationEventType,
  DealOriginationSource,
  DealStage,
  RelationshipCoverageStatus,
  RiskSeverity,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';

/**
 * Seeds the deal-execution pipeline (one anchor data-center deal with
 * counterparties, document requests, bid revisions, lender quotes,
 * negotiation events, tasks, and risk flags). Depends on assets being
 * seeded first; resolves the asset by `assetCode`.
 */
export async function seedDealExecution(prisma: PrismaClient): Promise<void> {
  const [officeAsset, dataCenterAsset] = await Promise.all([
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-YEOUIDO-01' },
      include: {
        documents: {
          orderBy: { createdAt: 'asc' },
          take: 2
        }
      }
    }),
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-GANGSEO-01' },
      include: {
        documents: {
          orderBy: { createdAt: 'asc' },
          take: 2
        }
      }
    })
  ]);

  if (officeAsset) {
    await prisma.deal.create({
      data: {
        dealCode: 'DEAL-2026-0001',
        slug: 'deal-2026-0001-yeouido-office-recap',
        title: 'Yeouido Core Office Tower Recapitalization',
        stage: DealStage.IC,
        market: 'KR',
        city: 'Seoul',
        country: 'KR',
        assetClass: AssetClass.OFFICE,
        strategy: 'Core-plus recapitalization',
        headline:
          'Direct owner recap with lender engagement already in motion and a live exclusivity window.',
        nextAction: 'Lock the final IC packet and clear lender comments on refinance covenants.',
        nextActionAt: new Date('2026-04-10T00:00:00.000Z'),
        targetCloseDate: new Date('2026-05-30T00:00:00.000Z'),
        sellerGuidanceKrw: 318000000000,
        bidGuidanceKrw: 312000000000,
        purchasePriceKrw: 312000000000,
        originationSource: DealOriginationSource.DIRECT_OWNER,
        originSummary:
          'Owner-led recapitalization brought directly through an existing sponsor relationship.',
        statusLabel: 'ACTIVE',
        dealLead: 'analyst@nexusseoul.local',
        assetId: officeAsset.id,
        counterparties: {
          create: [
            {
              name: 'Han River Office Holdings',
              role: 'OWNER',
              company: 'Han River Office Holdings',
              email: 'owner@example.com',
              coverageOwner: 'lead underwriter',
              coverageStatus: RelationshipCoverageStatus.PRIMARY,
              lastContactAt: new Date('2026-04-06T00:00:00.000Z'),
              notes: 'Direct owner relationship; sponsor expects fast committee feedback.'
            },
            {
              name: 'Korean Institutional Bank',
              role: 'LENDER',
              company: 'Korean Institutional Bank',
              email: 'refi@example.com',
              coverageOwner: 'capital markets',
              coverageStatus: RelationshipCoverageStatus.PRIMARY,
              lastContactAt: new Date('2026-04-05T00:00:00.000Z'),
              notes: 'Refinancing bank is in diligence and covenant negotiation.'
            },
            {
              name: 'Seoul Office Advisor',
              role: 'ADVISOR',
              company: 'Seoul Office Advisor',
              coverageOwner: 'deal lead',
              coverageStatus: RelationshipCoverageStatus.BACKUP,
              lastContactAt: new Date('2026-04-02T00:00:00.000Z'),
              notes: 'Supports process management and lender workstream.'
            }
          ]
        },
        tasks: {
          create: [
            {
              title: 'Finalize IC packet release memo',
              description: 'Close remaining comments before the April IC agenda is locked.',
              status: TaskStatus.IN_PROGRESS,
              priority: TaskPriority.HIGH,
              ownerLabel: 'lead underwriter',
              dueDate: new Date('2026-04-10T00:00:00.000Z')
            },
            {
              title: 'Refinancing covenant markup',
              description: 'Resolve covenant headroom comments with lead lender.',
              status: TaskStatus.OPEN,
              priority: TaskPriority.HIGH,
              ownerLabel: 'capital markets',
              dueDate: new Date('2026-04-12T00:00:00.000Z')
            }
          ]
        },
        documentRequests: {
          create: [
            {
              title: 'Updated rent roll tie-out',
              category: 'Leasing',
              status: 'RECEIVED',
              priority: TaskPriority.HIGH,
              requestedAt: new Date('2026-04-01T00:00:00.000Z'),
              receivedAt: new Date('2026-04-03T00:00:00.000Z'),
              documentId: officeAsset.documents[0]?.id ?? null
            }
          ]
        },
        diligenceWorkstreams: {
          create: [
            {
              workstreamType: 'LEGAL',
              status: 'SIGNED_OFF',
              ownerLabel: 'internal legal',
              advisorName: 'Kim & Partners',
              reportTitle: 'SPA and title package',
              requestedAt: new Date('2026-03-28T00:00:00.000Z'),
              dueDate: new Date('2026-04-11T00:00:00.000Z'),
              signedOffAt: new Date('2026-04-09T00:00:00.000Z'),
              signedOffByLabel: 'general counsel',
              summary: 'Title, encumbrance, and SPA comments are substantially cleared.',
              notes: 'Final sign-off depends on covenant reserve wording.',
              deliverables: officeAsset.documents[1]
                ? {
                    create: [
                      {
                        documentId: officeAsset.documents[1].id,
                        note: 'Linked legal diligence support for title and SPA package.'
                      }
                    ]
                  }
                : undefined
            },
            {
              workstreamType: 'COMMERCIAL',
              status: 'SIGNED_OFF',
              ownerLabel: 'asset management',
              advisorName: 'Leasing strategy team',
              reportTitle: 'Rent roll and rollover memo',
              requestedAt: new Date('2026-03-24T00:00:00.000Z'),
              dueDate: new Date('2026-04-04T00:00:00.000Z'),
              signedOffAt: new Date('2026-04-04T00:00:00.000Z'),
              signedOffByLabel: 'head of acquisitions',
              summary: 'Lease rollover, tenant credit, and market rent assumptions are cleared.',
              deliverables: officeAsset.documents[0]
                ? {
                    create: [
                      {
                        documentId: officeAsset.documents[0].id,
                        note: 'Rent roll and tenant support linked to the commercial lane.'
                      }
                    ]
                  }
                : undefined
            },
            {
              workstreamType: 'TECHNICAL',
              status: 'IN_PROGRESS',
              ownerLabel: 'technical dd lead',
              advisorName: 'Seoul Building Engineers',
              reportTitle: 'MEP and facade review',
              requestedAt: new Date('2026-03-29T00:00:00.000Z'),
              dueDate: new Date('2026-04-14T00:00:00.000Z'),
              summary: 'Mechanical reserve sizing and facade repairs are still being finalized.'
            }
          ]
        },
        bidRevisions: {
          create: [
            {
              label: 'IC-ready recap bid',
              status: DealBidStatus.ACCEPTED,
              bidPriceKrw: 312000000000,
              depositKrw: 10000000000,
              exclusivityDays: 21,
              diligenceDays: 30,
              closeTimelineDays: 45,
              submittedAt: new Date('2026-04-04T00:00:00.000Z'),
              notes: 'Commercial paper agreed subject to committee release.'
            }
          ]
        },
        lenderQuotes: {
          create: [
            {
              facilityLabel: 'Senior refinance facility',
              status: DealLenderQuoteStatus.TERM_SHEET,
              amountKrw: 164000000000,
              ltvPct: 52,
              allInRatePct: 4.9,
              quotedAt: new Date('2026-04-05T00:00:00.000Z'),
              notes: 'Term sheet is live and tied to committee approval.'
            }
          ]
        },
        negotiationEvents: {
          create: [
            {
              eventType: DealNegotiationEventType.EXCLUSIVITY_GRANTED,
              title: 'Owner granted live exclusivity',
              effectiveAt: new Date('2026-04-04T00:00:00.000Z'),
              expiresAt: new Date('2026-04-25T00:00:00.000Z'),
              summary:
                'Direct owner gave exclusivity while final packet and lender comments are cleared.'
            }
          ]
        },
        riskFlags: {
          create: [
            {
              title: 'Refinance covenant headroom',
              detail:
                'Final DSCR headroom and capex reserve sizing still need lender confirmation.',
              severity: RiskSeverity.MEDIUM,
              statusLabel: 'OPEN'
            }
          ]
        },
        activityLogs: {
          create: [
            {
              activityType: ActivityType.NOTE,
              title: 'Owner process note',
              body: 'Owner wants certainty around committee timing before circulating final SPA mark-up.',
              createdByLabel: 'lead underwriter'
            }
          ]
        }
      }
    });
  }

  if (dataCenterAsset) {
    await prisma.deal.create({
      data: {
        dealCode: 'DEAL-2026-0002',
        slug: 'deal-2026-0002-seoul-campus-ai-pod',
        title: 'Seoul Hyperscale Campus I AI Pod Expansion',
        stage: DealStage.DD,
        market: 'KR',
        city: 'Seoul',
        country: 'KR',
        assetClass: AssetClass.DATA_CENTER,
        strategy: 'Digital infrastructure expansion',
        headline:
          'Lender-channel process with active diligence but weaker process protection than the office recap.',
        nextAction: 'Rebuild exclusivity coverage and clear remaining power queue diligence.',
        nextActionAt: new Date('2026-04-11T00:00:00.000Z'),
        targetCloseDate: new Date('2026-06-20T00:00:00.000Z'),
        sellerGuidanceKrw: 268000000000,
        bidGuidanceKrw: 254000000000,
        purchasePriceKrw: 254000000000,
        originationSource: DealOriginationSource.LENDER_CHANNEL,
        originSummary:
          'Process was surfaced through a refinancing lender seeking recapitalization certainty.',
        statusLabel: 'ACTIVE',
        dealLead: 'analyst@nexusseoul.local',
        assetId: dataCenterAsset.id,
        counterparties: {
          create: [
            {
              name: 'Refinancing Coverage Bank',
              role: 'LENDER',
              company: 'Refinancing Coverage Bank',
              coverageOwner: 'capital markets',
              coverageStatus: RelationshipCoverageStatus.PRIMARY,
              lastContactAt: new Date('2026-04-01T00:00:00.000Z'),
              notes: 'Primary lender channel originated the recapitalization path.'
            },
            {
              name: 'Seller Advisor',
              role: 'BROKER',
              company: 'Digital Infra Advisor',
              coverageOwner: 'deal team',
              coverageStatus: RelationshipCoverageStatus.BACKUP,
              lastContactAt: new Date('2026-03-20T00:00:00.000Z'),
              notes: 'Brokered process is active, but no fresh exclusivity is in force.'
            }
          ]
        },
        tasks: {
          create: [
            {
              title: 'Power queue diligence refresh',
              description:
                'Update utility queue memo and operator commentary before the next DD call.',
              status: TaskStatus.BLOCKED,
              priority: TaskPriority.URGENT,
              ownerLabel: 'infrastructure underwriting',
              dueDate: new Date('2026-04-09T00:00:00.000Z')
            },
            {
              title: 'Rebuild exclusivity path',
              description:
                'Secure a fresh exclusivity window before final diligence spend accelerates.',
              status: TaskStatus.OPEN,
              priority: TaskPriority.HIGH,
              ownerLabel: 'deal lead',
              dueDate: new Date('2026-04-15T00:00:00.000Z')
            }
          ]
        },
        documentRequests: {
          create: [
            {
              title: 'Utility queue confirmation',
              category: 'Power',
              status: 'REQUESTED',
              priority: TaskPriority.URGENT,
              requestedAt: new Date('2026-04-02T00:00:00.000Z'),
              dueDate: new Date('2026-04-09T00:00:00.000Z'),
              documentId: null
            }
          ]
        },
        diligenceWorkstreams: {
          create: [
            {
              workstreamType: 'LEGAL',
              status: 'IN_PROGRESS',
              ownerLabel: 'deal counsel',
              advisorName: 'Infra Counsel Korea',
              reportTitle: 'Land, title, and process documents',
              requestedAt: new Date('2026-04-01T00:00:00.000Z'),
              dueDate: new Date('2026-04-16T00:00:00.000Z'),
              summary: 'Land control and process paper are open while exclusivity is rebuilt.',
              deliverables: dataCenterAsset.documents[0]
                ? {
                    create: [
                      {
                        documentId: dataCenterAsset.documents[0].id,
                        note: 'Land and process documents linked for legal DD.'
                      }
                    ]
                  }
                : undefined
            },
            {
              workstreamType: 'TECHNICAL',
              status: 'BLOCKED',
              ownerLabel: 'infrastructure underwriting',
              advisorName: 'Grid & Cooling Advisory',
              reportTitle: 'Utility queue and cooling resilience memo',
              requestedAt: new Date('2026-04-01T00:00:00.000Z'),
              dueDate: new Date('2026-04-10T00:00:00.000Z'),
              blockerSummary: 'Fresh utility queue confirmation has not been received.',
              summary: 'Power queue diligence remains the main blocker to process certainty.'
            },
            {
              workstreamType: 'ENVIRONMENTAL',
              status: 'READY_FOR_SIGNOFF',
              ownerLabel: 'site diligence lead',
              advisorName: 'Korea Environmental Review',
              reportTitle: 'Storm-surge and groundwater memo',
              requestedAt: new Date('2026-03-30T00:00:00.000Z'),
              dueDate: new Date('2026-04-09T00:00:00.000Z'),
              summary: 'Environmental diligence is materially complete pending formal sign-off.',
              deliverables: dataCenterAsset.documents[1]
                ? {
                    create: [
                      {
                        documentId: dataCenterAsset.documents[1].id,
                        note: 'Environmental and resilience diligence support linked to the lane.'
                      }
                    ]
                  }
                : undefined
            }
          ]
        },
        bidRevisions: {
          create: [
            {
              label: 'Seller feedback bid',
              status: DealBidStatus.COUNTERED,
              bidPriceKrw: 254000000000,
              submittedAt: new Date('2026-04-01T00:00:00.000Z'),
              notes: 'Seller countered price and process protection terms.'
            }
          ]
        },
        lenderQuotes: {
          create: [
            {
              facilityLabel: 'Expansion recap bridge',
              status: DealLenderQuoteStatus.INDICATED,
              amountKrw: 138000000000,
              ltvPct: 54,
              quotedAt: new Date('2026-04-01T00:00:00.000Z'),
              notes: 'Indicative bridge quote pending power diligence.'
            }
          ]
        },
        negotiationEvents: {
          create: [
            {
              eventType: DealNegotiationEventType.SELLER_COUNTER,
              title: 'Seller countered price and timing',
              effectiveAt: new Date('2026-04-03T00:00:00.000Z'),
              summary: 'Seller asked for tighter timing without extending exclusivity.'
            }
          ]
        },
        riskFlags: {
          create: [
            {
              title: 'No live exclusivity',
              detail:
                'Process remains exposed to competitive drift while power diligence stays open.',
              severity: RiskSeverity.HIGH,
              statusLabel: 'OPEN'
            }
          ]
        },
        activityLogs: {
          create: [
            {
              activityType: ActivityType.NOTE,
              title: 'Broker process note',
              body: 'Seller is sensitive to time and may reopen the process if power diligence drags.',
              createdByLabel: 'deal lead'
            }
          ]
        }
      }
    });
  }
}
