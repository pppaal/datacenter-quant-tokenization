import { getAssetById } from '../../../../lib/storage';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const asset = getAssetById(req.query.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  return res.status(200).json(asset);
}
