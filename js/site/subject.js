/* ═══════════ SUBJECT ═══════════ */
let pendingSubj = null, pendingCatName = null, pendingPack = null, pendingPackQuestions = null, selectedCount = 10, selectedDiff = "";

function openSubject(subj){
  currentSubject = subj;
  $("subjTitle").textContent = subj.ikon + " " + subj.key;
  $("subjSub").textContent = subj.aciklama;
  if(!PACKS_LOADED){ loadPacksIndex().then(() => openSubject(subj)); return; }

  const packs = packsOfDers(subj.key);
  const grid = $("catGrid");
  grid.innerHTML = "";

  if(packs.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-ico">📭</div><h4>Bu derste içerik yok</h4>
      <p>Bu ders için henüz içerik bulunmuyor.</p>
    </div>`;
    showScreen("subjectScreen");
    return;
  }

  // Her konu tek bir karttır. Konu kartı; konu çalış, soru çöz ve
  // flash kart seçeneklerinin açıldığı çalışma merkezine gider.
  const lab = document.createElement("div");
  lab.className = "section-label grid-section-label";
  lab.textContent = "Konular";
  grid.appendChild(lab);

  packs.forEach((pack, i) => {
    const card = document.createElement("button");
    card.className = "cat-card pack-card-main";
    card.style.animationDelay = (i * 50) + "ms";
    card.type = "button";
    card.innerHTML = `
      <div class="cat-top">
        <div class="cat-icon">${escapeHtml(pack.ikon || '📖')}</div>
        <div class="cat-count">KONU</div>
      </div>
      <h3>${escapeHtml(pack.baslik)}</h3>
      <p>${escapeHtml(pack.ozet || 'Konu anlatımı, soru çözümü ve flash kartlarla çalış.')}</p>
      <div class="cat-cta">Çalışmaya başla <span>→</span></div>
    `;
    card.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      card.disabled = true;
      try{
        await openStudyCenterFromPack(pack);
      }catch(err){
        console.error("Konu çalışma merkezi açma hatası:", err);
      }finally{
        card.disabled = false;
      }
    };
    grid.appendChild(card);
  });

  showScreen("subjectScreen");
}

/* ─── DIRECT QUIZ START ─── */
function openCountModal(subj, catName){
  pendingSubj = subj;
  pendingCatName = catName;
  selectedCount = 10;
  selectedDiff = "";
  const title = $("countModalTitle");
  if(title) title.textContent = catName;
  document.querySelectorAll("#countOptions .count-opt").forEach(b => b.classList.toggle("active", parseInt(b.dataset.count,10) === selectedCount));
  document.querySelectorAll("#countDiffOptions .diff-btn").forEach(b => b.classList.toggle("active", b.dataset.diff === ""));
  updateCountSetupSummary();
  $("countModal").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeCountModal(){
  $("countModal").classList.remove("show");
  document.body.style.overflow = "";
}
if($("countModal")){
  $("countModal").addEventListener("click", e => {
    if(e.target === $("countModal")) closeCountModal();
  });
}
document.querySelectorAll("#countOptions .count-opt").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#countOptions .count-opt").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCount = parseInt(btn.dataset.count,10);
    updateCountSetupSummary();
  };
});
document.querySelectorAll("#countDiffOptions .diff-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#countDiffOptions .diff-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedDiff = btn.dataset.diff || "";
    updateCountSetupSummary();
  };
});
function updateCountSetupSummary(){
  const el = $("countSetupSummary");
  if(!el) return;
  const diff = selectedDiff || "Tüm seviyeler";
  el.textContent = selectedCount + " soru · " + diff;
}
function openPackCountModal(pack){
  pendingPack = pack;
  pendingSubj = { key: pack.ders || currentSubject?.key || "Tarih", ikon: pack.ikon || "", aciklama: pack.ozet || "" };
  pendingCatName = pack.baslik || "Konu";
  pendingPackQuestions = null;
  selectedCount = 10;
  selectedDiff = "";
  const title = $("countModalTitle");
  if(title) title.textContent = pendingCatName;
  document.querySelectorAll("#countOptions .count-opt").forEach(b => b.classList.toggle("active", parseInt(b.dataset.count,10) === selectedCount));
  document.querySelectorAll("#countDiffOptions .diff-btn").forEach(b => b.classList.toggle("active", b.dataset.diff === ""));
  updateCountSetupSummary();
  $("countModal").classList.add("show");
  document.body.style.overflow = "hidden";
}

function confirmStartQuiz(){
  if(pendingPack){
    let list = Array.isArray(pendingPackQuestions) ? pendingPackQuestions.slice() : [];
    if(selectedDiff) list = list.filter(q => q.zorluk === selectedDiff);
    list = shuffle(list).slice(0, selectedCount);
    if(!list.length){
      if(typeof toast === "function") toast("Bu konuda seçilen ölçütlere uygun soru bulunamadı.", true);
      return;
    }
    const subj = pendingSubj || currentSubject;
    const cat = pendingCatName || pendingPack.baslik || "Konu";
    closeCountModal();
    startQuiz(subj, cat, list);
    return;
  }

  if(!pendingSubj || !pendingCatName) return;
  let list = questionsByDers(pendingSubj.key).filter(q => (q.kategori || "Genel") === pendingCatName);
  if(selectedDiff) list = list.filter(q => q.zorluk === selectedDiff);
  list = shuffle(list).slice(0, selectedCount);
  closeCountModal();
  startQuiz(pendingSubj, pendingCatName, list);
}
