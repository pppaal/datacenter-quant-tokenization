async function loadAdmin() {
  const response = await fetch('/api/admin/summary');
  const data = await response.json();

  const kpiGrid = document.getElementById('kpi-grid');
  kpiGrid.innerHTML = `
    <article class="card"><div class="meta">총 리드</div><div class="kpi">${data.kpi.totalLeads}</div></article>
    <article class="card"><div class="meta">오늘 리드</div><div class="kpi">${data.kpi.todayLeads}</div></article>
    <article class="card"><div class="meta">등록 자산</div><div class="kpi">${data.kpi.assetsCount}</div></article>
  `;

  document.getElementById('interest-map').textContent = JSON.stringify(data.byInterest, null, 2);

  const leadTable = document.getElementById('lead-table');
  leadTable.innerHTML = data.recentLeads.length
    ? data.recentLeads
        .map(
          (lead) => `<div class="card"><strong>${lead.name}</strong> (${lead.email})<br/><span class="meta">${lead.interest} · ${lead.status} · ${lead.createdAt}</span><br/>${lead.message || '-'}</div>`
        )
        .join('')
    : '<p class="meta">아직 문의가 없습니다.</p>';
}

loadAdmin();
