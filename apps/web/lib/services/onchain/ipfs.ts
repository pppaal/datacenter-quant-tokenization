/**
 * Pluggable IPFS pinning.
 *
 * Supported providers (picked via IPFS_PROVIDER env var):
 *   - `pinata`  — requires PINATA_JWT
 *   - `w3s`     — web3.storage v1 API, requires W3S_TOKEN
 *   - `none` (default) — skip pinning, return null CID. Callers should tolerate
 *     a null CID and still compute and anchor the content hash; the metadataRef
 *     just falls back to a non-IPFS URL in that case.
 */
export type IpfsUploadResult = { cid: string; url: string } | null;

export async function pinCanonicalJson(
  fileName: string,
  canonicalJson: string
): Promise<IpfsUploadResult> {
  const provider = (process.env.IPFS_PROVIDER ?? 'none').trim().toLowerCase();
  if (provider === 'none' || provider === '') return null;

  if (provider === 'pinata') return pinToPinata(fileName, canonicalJson);
  if (provider === 'w3s') return pinToWeb3Storage(fileName, canonicalJson);
  throw new Error(`Unsupported IPFS_PROVIDER "${provider}". Expected "pinata", "w3s", or "none".`);
}

async function pinToPinata(fileName: string, body: string): Promise<IpfsUploadResult> {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) throw new Error('PINATA_JWT is required when IPFS_PROVIDER=pinata');

  const form = new FormData();
  form.append('file', new Blob([body], { type: 'application/json' }), fileName);
  form.append(
    'pinataMetadata',
    JSON.stringify({ name: fileName, keyvalues: { source: 'dcqt-valuation' } })
  );

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form
  });
  if (!res.ok) {
    throw new Error(`Pinata pinning failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { IpfsHash?: string };
  if (!json.IpfsHash) throw new Error('Pinata response missing IpfsHash');
  return { cid: json.IpfsHash, url: `ipfs://${json.IpfsHash}` };
}

async function pinToWeb3Storage(fileName: string, body: string): Promise<IpfsUploadResult> {
  const token = process.env.W3S_TOKEN?.trim();
  if (!token) throw new Error('W3S_TOKEN is required when IPFS_PROVIDER=w3s');

  const res = await fetch('https://api.web3.storage/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-NAME': fileName,
      'Content-Type': 'application/json'
    },
    body
  });
  if (!res.ok) {
    throw new Error(`web3.storage upload failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { cid?: string };
  if (!json.cid) throw new Error('web3.storage response missing cid');
  return { cid: json.cid, url: `ipfs://${json.cid}` };
}
