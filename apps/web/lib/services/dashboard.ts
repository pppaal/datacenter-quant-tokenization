// Dashboard service entrypoint. The data fetchers and pure builders live in
// sibling ./dashboard/* modules; re-exported here so the public service
// entrypoint (and its tests) keep importing from one place.
export { getDashboardSummary, getLandingData, getSampleReport } from './dashboard/core';
export { getAdminData } from './dashboard/admin-data';
export {
  buildCounterpartyRiskSummary,
  buildDealCloseProbabilitySummary,
  buildDealPipelineSummary,
  buildDealReminderSummary,
  buildPortfolioRiskSummary
} from './dashboard/summaries';
