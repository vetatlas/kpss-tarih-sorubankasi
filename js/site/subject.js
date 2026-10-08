/* ═══════════ SUBJECT ═══════════ */
let pendingSubj = null, pendingCatName = null;

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
  let list = questionsByDers(subj.key).filter(q => (q.kategori || "Genel") === catName);
  list = shuffle(list);
  /* Öğrenciye soru havuzunun büyüklüğü gösterilmez. Sistem uygun bir çalışma seti seçer. */
  const studySetSize = 20;
  if(list.length > studySetSize) list = list.slice(0, studySetSize);
  startQuiz(subj, catName, list);
}
function closeCountModal(){}
function confirmStartQuiz(){ openCountModal(pendingSubj, pendingCatName); }
