import { getAssets, getLeads } from '../../../lib/storage';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const leads = getLeads();
  const assets = getAssets();
  const today = new Date().toISOString().slice(0, 10);
  const todayLeads = leads.filter((l) => l.createdAt.slice(0, 10) === today).length;

  const byInterest = leads.reduce((acc, lead) => {
    acc[lead.interest] = (acc[lead.interest] || 0) + 1;
    return acc;
  }, {});

  return res.status(200).json({
    kpi: { totalLeads: leads.length, todayLeads, assetsCount: assets.length },
    byInterest,
    recentLeads: leads.slice(0, 20)
  });
}
