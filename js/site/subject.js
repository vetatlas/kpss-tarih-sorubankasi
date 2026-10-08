/* ═══════════ SUBJECT ═══════════ */
let pendingSubj = null, pendingCatName = null;
let selectedCount = 20, selectedDiff = "";

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
      <p>Admin panelden "${subj.key}" dersine paket veya soru ekle.</p>
    </div>`;
    showScreen("subjectScreen");
    return;
  }

  // Bölüm 1: Ders Paketleri
  if(packs.length > 0){
    const lab = document.createElement("div");
    lab.className = "section-label grid-section-label";
    lab.textContent = "📚 Ders Paketleri — Öğren";
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
      card.onclick = () => openLessonPathFromPack(pack);
      grid.appendChild(card);
    });
  }

  // Bölüm 2: Konular (Test)
  if(catKeys.length > 0){
    const lab = document.createElement("div");
    lab.className = "section-label grid-section-label";
    lab.textContent = "🎯 Konular — Test Çöz";
    grid.appendChild(lab);

    catKeys.forEach((catName, i) => {
      const card = document.createElement("button");
      card.className = "cat-card";
      card.style.animationDelay = (i * 50) + "ms";
      card.type = "button";
      card.innerHTML = `
        <div class="cat-top">
          <div class="cat-icon">📂</div>
          <div class="cat-count">${cats[catName]} soru</div>
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

/* ─── COUNT MODAL ─── */
function openCountModal(subj, catName){
  pendingSubj = subj;
  pendingCatName = catName;
  selectedCount = 20;
  selectedDiff = "";
  const total = questionsByDers(subj.key).filter(q => (q.kategori || "Genel") === catName).length;
  $("countSub").innerHTML = `Konu: <b>${escapeHtml(catName)}</b> (${total} soru)`;
  document.querySelectorAll("#countOptions .count-opt").forEach(b => {
    b.classList.toggle("active", b.dataset.count === "20");
  });
  document.querySelectorAll("#countModal .diff-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.diff === "");
  });
  $("countModal").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeCountModal(){
  $("countModal").classList.remove("show");
  document.body.style.overflow = "";
}
function confirmStartQuiz(){
  if(!pendingSubj || !pendingCatName) return;
  let list = questionsByDers(pendingSubj.key).filter(q =>
    (q.kategori || "Genel") === pendingCatName);
  if(selectedDiff) list = list.filter(q => q.zorluk === selectedDiff);
  list = shuffle(list);
  if(selectedCount > 0 && list.length > selectedCount) list = list.slice(0, selectedCount);
  const subj = pendingSubj;
  const cat = pendingCatName;
  closeCountModal();
  startQuiz(subj, cat, list);
}

/* Event listeners */
$("countModal").addEventListener("click", e => {
  if(e.target === $("countModal")) closeCountModal();
});
document.querySelectorAll("#countOptions .count-opt").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#countOptions .count-opt").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCount = parseInt(btn.dataset.count, 10);
  });
});
document.querySelectorAll("#countModal .diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#countModal .diff-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedDiff = btn.dataset.diff;
  });
});
