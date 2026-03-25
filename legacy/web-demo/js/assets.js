async function loadAssets() {
  const container = document.getElementById('asset-list');
  const response = await fetch('/api/assets');
  const data = await response.json();

  container.innerHTML = data.items
    .map(
      (asset) => `
      <article class="card asset-card">
        <p class="meta">${asset.assetType} · ${asset.country}/${asset.city} · ${asset.status}</p>
        <h3>${asset.name}</h3>
        <p>${asset.summary}</p>
        <p class="meta">${asset.powerCapacityMW}MW · GFA ${asset.grossFloorArea.toLocaleString()}㎡ · 예상 IRR ${asset.expectedIRR}</p>
        <a class="btn" href="asset-detail.html?id=${asset.id}">상세 보기</a>
      </article>
    `
    )
    .join('');
}

loadAssets();
