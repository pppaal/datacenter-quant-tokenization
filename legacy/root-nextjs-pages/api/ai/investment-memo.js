import { getAssetById, createInvestmentMemo } from '../../../lib/storage';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { assetId } = req.body;
  const asset = getAssetById(assetId);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  return res.status(200).json(createInvestmentMemo(asset));
}
