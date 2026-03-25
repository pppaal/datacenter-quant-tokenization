import { uploadPdfForAsset } from '../../../../lib/storage';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const result = uploadPdfForAsset({
    assetId: req.query.id,
    fileName: req.body.fileName,
    contentBase64: req.body.contentBase64,
    category: req.body.category,
    visibility: req.body.visibility
  });

  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.status(201).json({ success: true, item: result.item });
}
