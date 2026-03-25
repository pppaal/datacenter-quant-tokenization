const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getAssets() {
  return readJson(ASSETS_FILE);
}

function getAssetById(assetId) {
  return getAssets().find((a) => a.id === assetId);
}

function saveAssets(assets) {
  writeJson(ASSETS_FILE, assets);
}

function getLeads() {
  return readJson(LEADS_FILE);
}

function saveLeads(leads) {
  writeJson(LEADS_FILE, leads);
}

function createInvestmentMemo(asset) {
  return {
    oneLineSummary: `${asset.name}는 ${asset.powerCapacityMW}MW 전력 용량과 ${asset.tenantStatus} 상태를 기반으로 중수익형 구조화가 가능한 데이터센터 딜입니다.`,
    topInvestmentPoints: (asset.thesis || []).slice(0, 3),
    keyRisks: (asset.risks || []).slice(0, 3),
    ddItemsToCheck: asset.ddChecklist || [],
    investorMemo: `${asset.city} 권역의 전력·입지 경쟁력은 유효하나, ${asset.riskNotes} 리스크를 DD에서 우선 검증해야 합니다.`
  };
}

function filterDataroomByRole(dataroom = [], role = 'public') {
  return dataroom.filter((doc) => doc.visibility?.includes(role) || doc.visibility?.includes('public'));
}

function uploadPdfForAsset({ assetId, fileName, contentBase64, category, visibility }) {
  const assets = getAssets();
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) {
    return { error: 'Asset not found', status: 404 };
  }

  if (!fileName || !contentBase64 || !String(fileName).toLowerCase().endsWith('.pdf')) {
    return { error: 'PDF fileName and contentBase64 are required', status: 400 };
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
  saveAssets(assets);

  return { item: doc, status: 201 };
}

module.exports = {
  getAssets,
  getAssetById,
  saveAssets,
  getLeads,
  saveLeads,
  createInvestmentMemo,
  filterDataroomByRole,
  uploadPdfForAsset,
  UPLOAD_DIR
};
