const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.pdf') return 'application/pdf';
  return 'text/plain; charset=utf-8';
}

function serveStatic(reqPath, res) {
  const relativePath = reqPath === '/' ? '/index.html' : reqPath;
  const safePath = path.normalize(relativePath).replace(/^\/+/, '');
  const filePath = path.join(WEB_DIR, safePath);

  if (!filePath.startsWith(WEB_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, { error: 'Not found' });

  res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function buildInvestmentMemo(asset) {
  return {
    oneLineSummary: `${asset.name}는 ${asset.powerCapacityMW}MW 전력 용량과 ${asset.tenantStatus} 상태를 기반으로 중수익형 구조화가 가능한 데이터센터 딜입니다.`,
    topInvestmentPoints: asset.thesis.slice(0, 3),
    keyRisks: asset.risks.slice(0, 3),
    ddItemsToCheck: asset.ddChecklist,
    investorMemo: `${asset.city} 권역의 전력·입지 경쟁력은 유효하나, ${asset.riskNotes} 리스크를 DD에서 우선 검증해야 합니다.`
  };
}

function filterByRole(docs, role) {
  return docs.filter((doc) => doc.visibility.includes(role) || doc.visibility.includes('public'));
}

function findAsset(assets, assetId) {
  return assets.find((item) => item.id === assetId);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const reqPath = parsed.pathname;

  try {
    if (req.method === 'GET' && reqPath === '/api/assets') {
      return sendJson(res, 200, { items: readJson(ASSETS_FILE) });
    }

    if (req.method === 'GET' && reqPath.startsWith('/api/assets/')) {
      const segments = reqPath.split('/');
      const assetId = segments[3];
      const assets = readJson(ASSETS_FILE);
      const asset = findAsset(assets, assetId);
      if (!asset) return sendJson(res, 404, { error: 'Asset not found' });

      if (segments[4] === 'dataroom') {
        const role = parsed.searchParams.get('role') || 'public';
        return sendJson(res, 200, { items: filterByRole(asset.dataroom || [], role), role });
      }

      return sendJson(res, 200, asset);
    }

    if (req.method === 'POST' && reqPath.startsWith('/api/assets/') && reqPath.endsWith('/dataroom/upload')) {
      const assetId = reqPath.split('/')[3];
      const body = await parseBody(req);
      const assets = readJson(ASSETS_FILE);
      const asset = findAsset(assets, assetId);
      if (!asset) return sendJson(res, 404, { error: 'Asset not found' });

      const { fileName, contentBase64, category, visibility } = body;
      if (!fileName || !contentBase64 || !String(fileName).toLowerCase().endsWith('.pdf')) {
        return sendJson(res, 400, { error: 'PDF fileName and contentBase64 are required' });
      }

      const docId = `doc-${Date.now()}`;
      const storedName = `${assetId}-${docId}.pdf`;
      const storedPath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(storedPath, Buffer.from(contentBase64, 'base64'));

      const doc = {
        id: docId,
        title: fileName,
        category: category || 'Etc',
        visibility: Array.isArray(visibility) && visibility.length ? visibility : ['admin'],
        uploadedAt: new Date().toISOString(),
        filePath: `data/uploads/${storedName}`
      };

      asset.dataroom = asset.dataroom || [];
      asset.dataroom.unshift(doc);
      writeJson(ASSETS_FILE, assets);
      return sendJson(res, 201, { success: true, item: doc });
    }

    if (req.method === 'POST' && reqPath === '/api/ai/investment-memo') {
      const body = await parseBody(req);
      const assets = readJson(ASSETS_FILE);
      const asset = findAsset(assets, body.assetId);
      if (!asset) return sendJson(res, 404, { error: 'Asset not found' });
      return sendJson(res, 200, buildInvestmentMemo(asset));
    }

    if (req.method === 'POST' && reqPath === '/api/leads') {
      const body = await parseBody(req);
      if (!body.name || !body.email || !body.interest) {
        return sendJson(res, 400, { error: 'name/email/interest are required' });
      }

      const leads = readJson(LEADS_FILE);
      const lead = {
        id: `lead-${Date.now()}`,
        name: body.name,
        email: body.email,
        interest: body.interest,
        message: body.message || '',
        source: body.source || 'web',
        status: '신규',
        createdAt: new Date().toISOString()
      };
      leads.unshift(lead);
      writeJson(LEADS_FILE, leads);
      return sendJson(res, 201, { success: true, item: lead });
    }

    if (req.method === 'GET' && reqPath === '/api/admin/summary') {
      const leads = readJson(LEADS_FILE);
      const assets = readJson(ASSETS_FILE);
      const today = new Date().toISOString().slice(0, 10);
      const todayLeads = leads.filter((l) => l.createdAt.slice(0, 10) === today).length;
      const byInterest = leads.reduce((acc, lead) => {
        acc[lead.interest] = (acc[lead.interest] || 0) + 1;
        return acc;
      }, {});

      return sendJson(res, 200, {
        kpi: { totalLeads: leads.length, todayLeads, assetsCount: assets.length },
        byInterest,
        recentLeads: leads.slice(0, 20)
      });
    }

    if (reqPath.startsWith('/data/uploads/')) {
      const filePath = path.join(ROOT, reqPath);
      if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
      return fs.createReadStream(filePath).pipe(res);
    }

    return serveStatic(reqPath, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

const PORT = process.env.PORT || 4173;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
