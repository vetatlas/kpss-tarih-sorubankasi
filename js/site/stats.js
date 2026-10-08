/* ═══════════ İSTATİSTİK ═══════════ */
function openStats(){ renderStats(); showScreen("stats"); }

function renderStats(){
  const d = loadDetail();
  const pct = d.toplam.ans ? Math.round(d.toplam.cor / d.toplam.ans * 100) : 0;
  $("statsTiles").innerHTML = `
    <div class="stat-tile c-blue"><div class="st-ico">□</div><div class="st-num">${d.toplam.ans}</div><div class="st-lbl">Toplam</div></div>
    <div class="stat-tile c-green"><div class="st-ico">✓</div><div class="st-num">${d.toplam.cor}</div><div class="st-lbl">Doğru</div></div>
    <div class="stat-tile c-red"><div class="st-ico">✕</div><div class="st-num">${d.toplam.ans - d.toplam.cor}</div><div class="st-lbl">Yanlış</div></div>
    <div class="stat-tile c-gold"><div class="st-ico">%</div><div class="st-num">%${pct}</div><div class="st-lbl">Başarı</div></div>
  `;
  const cb = $("catBars");
  cb.innerHTML = "";
  const keys = Object.keys(d.kat);
  if(keys.length === 0){
    cb.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">Henüz veri yok</div>`;
  } else {
    keys.forEach(k => {
      const kd = d.kat[k];
      if(kd.ans === 0) return;
      const p = Math.round(kd.cor / kd.ans * 100);
      const row = document.createElement("div");
      row.className = "cat-bar-row";
      row.innerHTML = `
        <div class="cb-name">${escapeHtml(k)}</div>
        <div class="cb-track"><div class="cb-fill" style="width:${p}%"></div></div>
        <div class="cb-count">${kd.cor}/${kd.ans}</div>
        <div class="cb-pct">%${p}</div>
      `;
      cb.appendChild(row);
    });
  }
}
