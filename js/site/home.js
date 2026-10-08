/* ═══════════ HOME ═══════════ */
async function initHome(){
  const grid = $("subjectGrid");
  if(grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">📥 Yükleniyor...</div>`;
  if($("heroBadge")) $("heroBadge").textContent = "Yükleniyor...";

  // Her ikisini paralel yükle — biri patlarsa diğeri devam eder
  // Veri yükleme sonsuza kadar beklemesin.
  // Ağ/CDN cevap vermese bile kullanıcıya mutlaka sonuç göster.
  const timeout = new Promise(resolve => setTimeout(() => resolve("timeout"), 10000));
  const loading = Promise.allSettled([
    loadAllQuestions(),
    loadPacksIndex()
  ]);
  const results = await Promise.race([loading, timeout]);

  if(results === "timeout"){
    console.warn("Ana sayfa veri yükleme zaman aşımına uğradı.");
    if($("heroBadge")) $("heroBadge").textContent = "Yükleme zaman aşımı";
    if(grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-ico">⏱️</div>
      <h4>İçerik yükleniyor</h4>
      <p>İçerik şu anda görüntülenemiyor. Lütfen tekrar deneyin.</p>
      <button class="btn btn-primary" style="margin-top:14px" onclick="location.reload()">🔄 Yenile</button>
    </div>`;
    return;
  }

  // Hata var mı kontrol et
  const qErr = results[0].status === "rejected" ? results[0].reason : null;
  const pErr = results[1].status === "rejected" ? results[1].reason : null;
  if(qErr) console.warn("Sorular yüklenemedi:", qErr);
  if(pErr) console.warn("Ders içerikleri yüklenemedi:", pErr);

  // Hiç içerik yoksa hata ekranı
  if(ALL_QUESTIONS.length === 0 && PACKS_INDEX.length === 0){
    if($("heroBadge")) $("heroBadge").textContent = "İçerik görüntülenemedi";
    if(grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-ico">⚠️</div>
      <h4>İçerik yüklenemedi</h4>
      <p>Lütfen bağlantını kontrol edip tekrar dene.</p>
      <button class="btn btn-primary" style="margin-top:14px" onclick="initHome()">🔄 Tekrar Dene</button>
    </div>`;
    return;
  }

  // Başarılı yükleme
  const packCount = PACKS_INDEX.length;
  if($("heroBadge")) $("heroBadge").textContent = `${packCount} konu hazır`;

  if(!grid) return;
  grid.innerHTML = "";
  SUBJECTS.forEach((s, i) => {
    const pCount = packsOfDers(s.key).length;
    const card = document.createElement("button");
    card.className = `subj-card ${s.renk}`;
    card.style.animationDelay = (i * 60) + "ms";
    card.type = "button";
    card.innerHTML = `
      <div class="subj-top">
        <div class="subj-ico">${s.ikon}</div>

      </div>
      <h3>${escapeHtml(s.key)}</h3>
      <p>${escapeHtml(s.aciklama)}</p>
      <div class="subj-stats">
        <span><b>${pCount}</b> konu</span>
        <span><b>${Object.keys(categoriesOfDers(s.key)).length}</b> başlık</span>
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
