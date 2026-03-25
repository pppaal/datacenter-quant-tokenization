const params = new URLSearchParams(window.location.search);
const assetId = params.get('id');

async function loadDetail() {
  const section = document.getElementById('asset-section');

  if (!assetId) {
    section.innerHTML = '<h1>자산 ID가 없습니다.</h1>';
    return;
  }

  const assetRes = await fetch(`/api/assets/${assetId}`);
  if (!assetRes.ok) {
    section.innerHTML = '<h1>자산을 찾을 수 없습니다.</h1>';
    return;
  }

  const asset = await assetRes.json();
  section.innerHTML = `
    <h1>${asset.name}</h1>
    <p class="meta">${asset.assetType} · ${asset.country}/${asset.city} · ${asset.address}</p>
    <p>${asset.summary}</p>
    <div class="grid two">
      <div class="card"><strong>Power Capacity</strong><br/>${asset.powerCapacityMW}MW</div>
      <div class="card"><strong>Tenant Status</strong><br/>${asset.tenantStatus}</div>
      <div class="card"><strong>CAPEX / OPEX</strong><br/>${asset.capex.toLocaleString()} / ${asset.opex.toLocaleString()}</div>
      <div class="card"><strong>Expected IRR</strong><br/>${asset.expectedIRR}</div>
      <div class="card"><strong>Target Equity</strong><br/>${asset.targetEquity.toLocaleString()}</div>
      <div class="card"><strong>Debt Structure</strong><br/>${asset.debtStructure}</div>
    </div>
    <p class="meta">Risk Notes: ${asset.riskNotes}</p>
  `;

  document.querySelector('input[name="interest"]').value = asset.name;
  loadDataroom();
}

async function loadDataroom() {
  const role = document.getElementById('role-filter').value;
  const dataroomRes = await fetch(`/api/assets/${assetId}/dataroom?role=${encodeURIComponent(role)}`);
  const dataroom = await dataroomRes.json();
  document.getElementById('dataroom-list').innerHTML = dataroom.items
    .map((doc) => `<li>${doc.title} <span class="meta">(${doc.category} · ${doc.visibility.join(',')})</span></li>`)
    .join('') || '<li>표시할 문서가 없습니다.</li>';
}

async function generateMemo() {
  const output = document.getElementById('memo-output');
  const response = await fetch('/api/ai/investment-memo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId })
  });
  const memo = await response.json();
  output.textContent = JSON.stringify(memo, null, 2);
}

async function submitLead(event) {
  event.preventDefault();
  const form = event.target;
  const status = document.getElementById('lead-status');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.source = `asset-detail:${assetId}`;

  const response = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  status.textContent = response.ok
    ? '문의가 저장되었습니다. 담당자가 연락드립니다.'
    : '저장 실패: 필수 값을 확인하세요.';

  if (response.ok) form.reset();
}

async function uploadPdf(event) {
  event.preventDefault();
  const status = document.getElementById('upload-status');
  const form = event.target;
  const formData = new FormData(form);
  const visibility = formData.getAll('visibility');
  const text = formData.get('pdfText');

  const payload = {
    fileName: formData.get('fileName'),
    category: formData.get('category'),
    visibility,
    contentBase64: btoa(unescape(encodeURIComponent(`%PDF-1.1\n${text}\n%%EOF`)))
  };

  const response = await fetch(`/api/assets/${assetId}/dataroom/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  status.textContent = response.ok ? 'PDF 업로드 완료' : '업로드 실패';
  if (response.ok) {
    form.reset();
    loadDataroom();
  }
}

document.getElementById('generate-memo').addEventListener('click', generateMemo);
document.getElementById('lead-form').addEventListener('submit', submitLead);
document.getElementById('upload-form').addEventListener('submit', uploadPdf);
document.getElementById('role-filter').addEventListener('change', loadDataroom);
loadDetail();
