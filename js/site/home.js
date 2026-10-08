/* ═══════════ HOME ═══════════ */
async function initHome(){
  $("subjectGrid").innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">📥 Yükleniyor...</div>`;
  await Promise.all([loadAllQuestions(), loadPacksIndex()]);
  if(ALL_QUESTIONS.length === 0 && PACKS_INDEX.length === 0){
    $("heroBadge").textContent = "Henüz içerik yok";
    $("subjectGrid").innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-ico">📭</div><h4>Henüz içerik yok</h4>
      <p>Admin panelden soru veya ders paketi ekle.</p>
    </div>`;
    return;
  }
  const total = ALL_QUESTIONS.length;
  const packCount = PACKS_INDEX.length;
  $("heroBadge").textContent = `${total} soru • ${packCount} ders paketi hazır`;
  const grid = $("subjectGrid");
  grid.innerHTML = "";
  SUBJECTS.forEach((s, i) => {
    const qCount = questionsByDers(s.key).length;
    const pCount = packsOfDers(s.key).length;
    const card = document.createElement("button");
    card.className = `subj-card ${s.renk}`;
    card.style.animationDelay = (i * 60) + "ms";
    card.type = "button";
    card.innerHTML = `
      <div class="subj-top">
        <div class="subj-ico">${s.ikon}</div>
        <span class="subj-badge">${qCount} soru</span>
      </div>
      <h3>${escapeHtml(s.key)}</h3>
      <p>${escapeHtml(s.aciklama)}</p>
      <div class="subj-stats">
        <span>📚 <b>${pCount}</b> paket</span>
        <span>🎯 <b>${Object.keys(categoriesOfDers(s.key)).length}</b> konu</span>
      </div>
      <div class="subj-cta">Başla <span>→</span></div>
    `;
    card.onclick = () => openSubject(s);
    grid.appendChild(card);
  });
}

function goHome(){
  stopTimer();
  resetQuizFlags();
  showScreen("home");
  renderXP();
  renderWrongBadge();
  renderFavBadge();
  initHome();
}
