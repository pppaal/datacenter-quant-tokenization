import { getLeads, saveLeads } from '../../lib/storage';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, interest, message, source } = req.body;
  if (!name || !email || !interest) {
    return res.status(400).json({ error: 'name/email/interest are required' });
  }

  const leads = getLeads();
  const lead = {
    id: `lead-${Date.now()}`,
    name,
    email,
    interest,
    message: message || '',
    source: source || 'web',
    status: '신규',
    createdAt: new Date().toISOString()
  };

  leads.unshift(lead);
  saveLeads(leads);
  return res.status(201).json({ success: true, item: lead });
}
