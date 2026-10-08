/* ═══════════ SUBJECT ═══════════ */
let pendingSubj = null, pendingCatName = null, selectedCount = 10, selectedDiff = "";

function openSubject(subj){
  currentSubject = subj;
  $("subjTitle").textContent = subj.ikon + " " + subj.key;
  $("subjSub").textContent = subj.aciklama;
  if(!PACKS_LOADED){ loadPacksIndex().then(() => openSubject(subj)); return; }

  const packs = packsOfDers(subj.key);
  const cats = categoriesOfDers(subj.key);
  const grid = $("catGrid");
  grid.innerHTML = "";
  const catKeys = Object.keys(cats);

  if(packs.length === 0 && catKeys.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-ico">📭</div><h4>Bu derste içerik yok</h4>
      <p>Bu ders için henüz içerik bulunmuyor.</p>
    </div>`;
    showScreen("subjectScreen");
    return;
  }

  // Bölüm 1: Ders Paketleri
  if(packs.length > 0){
    const lab = document.createElement("div");
    lab.className = "section-label grid-section-label";
    lab.textContent = "Konu anlatımı";
    grid.appendChild(lab);

    packs.forEach((pack, i) => {
      const card = document.createElement("button");
      card.className = "cat-card pack-card-main";
      card.style.animationDelay = (i * 50) + "ms";
      card.type = "button";
      card.innerHTML = `
        <div class="cat-top">
          <div class="cat-icon">${escapeHtml(pack.ikon || '📖')}</div>
          <div class="cat-count">🎓 Öğren</div>
        </div>
        <h3>${escapeHtml(pack.baslik)}</h3>
        <p>${escapeHtml(pack.ozet || 'Kart + sorularla öğren')}</p>
        <div class="cat-cta">Derse Başla <span>→</span></div>
      `;
      card.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        card.disabled = true;
        try{
          await openLessonPathFromPack(pack);
        }catch(err){
          console.error("Ders paketi tıklama hatası:", err);
        }finally{
          card.disabled = false;
        }
      };
      grid.appendChild(card);
    });
  }

  // Bölüm 2: Konular (Test)
  if(catKeys.length > 0){
    const lab = document.createElement("div");
    lab.className = "section-label grid-section-label";
    lab.textContent = "Soru çöz";
    grid.appendChild(lab);

    catKeys.forEach((catName, i) => {
      const card = document.createElement("button");
      card.className = "cat-card";
      card.style.animationDelay = (i * 50) + "ms";
      card.type = "button";
      card.innerHTML = `
        <div class="cat-top">
          <div class="cat-icon">📂</div>
          <div class="cat-count">Soru çöz</div>
        </div>
        <h3>${escapeHtml(catName)}</h3>
        <div class="cat-cta">Test Çöz <span>→</span></div>
      `;
      card.onclick = () => openCountModal(subj, catName);
      grid.appendChild(card);
    });
  }

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
function confirmStartQuiz(){
  if(!pendingSubj || !pendingCatName) return;
  let list = questionsByDers(pendingSubj.key).filter(q => (q.kategori || "Genel") === pendingCatName);
  if(selectedDiff) list = list.filter(q => q.zorluk === selectedDiff);
  list = shuffle(list).slice(0, selectedCount);
  closeCountModal();
  startQuiz(pendingSubj, pendingCatName, list);
}
