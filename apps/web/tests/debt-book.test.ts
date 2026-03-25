import assert from 'node:assert/strict';
import test from 'node:test';
import { AmortizationProfile, DebtFacilityType } from '@prisma/client';
import { createDebtFacility, deleteDebtFacility, updateDebtFacility } from '@/lib/services/debt-book';

test('debt book create normalizes currency and creates a facility with draws', async () => {
  let capturedCreate: any;

  const result = await createDebtFacility(
    'asset_debt_1',
    {
      inputCurrency: 'USD',
      facilityType: DebtFacilityType.CONSTRUCTION,
      lenderName: 'Global Bank',
      commitmentKrw: 15000000,
      drawnAmountKrw: 5000000,
      interestRatePct: 6.3,
      gracePeriodMonths: 18,
      amortizationTermMonths: 84,
      amortizationProfile: AmortizationProfile.SCULPTED,
      sculptedTargetDscr: 1.3,
      reserveMonths: 9,
      draws: [
        {
          drawYear: 1,
          drawMonth: 3,
          amountKrw: 3000000
        },
        {
          drawYear: 2,
          drawMonth: 6,
          amountKrw: 2000000
        }
      ]
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_debt_1',
              market: 'US',
              address: { country: 'US' }
            };
          }
        },
        debtFacility: {
          async create(args: any) {
            capturedCreate = args;
            return { id: 'debt_1', ...args.data, draws: [] };
          }
        }
      } as any
    }
  );

  assert.equal(capturedCreate.data.assetId, 'asset_debt_1');
  assert.equal(capturedCreate.data.commitmentKrw, 20250000000);
  assert.equal(capturedCreate.data.drawnAmountKrw, 6750000000);
  assert.equal(capturedCreate.data.draws.create[0].amountKrw, 4050000000);
  assert.equal(capturedCreate.data.draws.create[1].amountKrw, 2700000000);
  assert.equal(result.id, 'debt_1');
});

test('debt book update and delete enforce asset ownership', async () => {
  let capturedUpdate: any;
  let capturedDelete: any;

  const db = {
    asset: {
      async findUnique() {
        return {
          id: 'asset_debt_2',
          market: 'KR',
          address: { country: 'KR' }
        };
      }
    },
    debtFacility: {
      async findUnique(args: any) {
        if (args.where.id === 'debt_2') {
          return {
            id: 'debt_2',
            assetId: 'asset_debt_2',
            facilityType: DebtFacilityType.TERM,
            lenderName: 'Legacy Lender',
            commitmentKrw: 10000000000,
            drawnAmountKrw: 8000000000,
            interestRatePct: 5.9,
            upfrontFeePct: 1.1,
            commitmentFeePct: 0.25,
            gracePeriodMonths: 12,
            amortizationTermMonths: 72,
            amortizationProfile: AmortizationProfile.INTEREST_ONLY,
            sculptedTargetDscr: null,
            balloonPct: 15,
            reserveMonths: 6,
            notes: 'Existing'
          };
        }

        return null;
      },
      async update(args: any) {
        capturedUpdate = args;
        return { id: 'debt_2', ...args.data, draws: [] };
      },
      async delete(args: any) {
        capturedDelete = args;
        return { id: 'debt_2' };
      }
    }
  } as any;

  await updateDebtFacility(
    'asset_debt_2',
    'debt_2',
    {
      facilityType: DebtFacilityType.REVOLVER,
      lenderName: 'Updated Lender',
      commitmentKrw: 12000000000,
      interestRatePct: 6.5,
      amortizationProfile: AmortizationProfile.BULLET,
      balloonPct: 25,
      draws: [
        {
          drawYear: 1,
          drawMonth: 2,
          amountKrw: 4000000000
        }
      ]
    },
    { db }
  );

  await deleteDebtFacility('asset_debt_2', 'debt_2', { db });

  assert.equal(capturedUpdate.where.id, 'debt_2');
  assert.equal(capturedUpdate.data.facilityType, DebtFacilityType.REVOLVER);
  assert.equal(capturedUpdate.data.lenderName, 'Updated Lender');
  assert.equal(capturedUpdate.data.balloonPct, 25);
  assert.equal(capturedUpdate.data.draws.create[0].drawMonth, 2);
  assert.equal(capturedDelete.where.id, 'debt_2');
});
