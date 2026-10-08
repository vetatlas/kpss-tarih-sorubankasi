/* ═══════════ ÖĞREN MODU — DERS PAKETİ TABANLI ═══════════ */
const LP = {
  pack: null, subj: null, catName: null,
  lessons: [], lessonIdx: 0,
  cards: [], cardIdx: 0,
  questions: [], qIdx: 0,
  correct: 0, wrong: 0, startTime: 0, qAnswered: false
};

async function openLessonPathFromPack(pack){
  // Paket kartına basıldığında ekranın kesin olarak açılması ve
  // hem data/dersler/ hem de data/ kökündeki eski paket dosyalarının
  // desteklenmesi için güvenli yükleyici.
  try{
    LP.pack = pack || null;
    LP.subj = { key: (pack && pack.ders) || "Tarih" };
    LP.catName = (pack && pack.baslik) || "Konu anlatımı";

    $("pathTitle").textContent = ((pack && pack.ikon) || "🎓") + " " + LP.catName;
    $("pathSub").textContent = (pack && pack.ozet) || "Alt başlıkları sırayla çalış, ardından konuyu pekiştir.";

    const list = $("lessonList");
    if(!list) throw new Error("lessonList alanı bulunamadı.");

    list.innerHTML = `<div class="empty-state"><div class="es-ico">📥</div><h4>Dersler yükleniyor...</h4><p>İçerik hazırlanıyor.</p></div>`;
    showScreen("lessonPath");

    let data = null;
    let lastError = null;

    // Önce standart paket klasörü.
    try{
      data = await fetchJSON(pack.dosya, PACKS_FOLDER);
    }catch(e){
      lastError = e;
      console.warn("Paket klasöründen yüklenemedi:", e.message);

      // Eski/veri uyumluluğu: dosya data/ altında tutuluyorsa onu da dene.
      try{
        data = await fetchJSON(pack.dosya);
      }catch(e2){
        lastError = e2;
        console.warn("Ana data klasöründen de yüklenemedi:", e2.message);
      }
    }

    if(!data || !Array.isArray(data.dersler) || data.dersler.length === 0){
      const detail = lastError ? `<small style="display:block;margin-top:10px;opacity:.7">Teknik bilgi: ${escapeHtml(lastError.message)}</small>` : "";
      list.innerHTML = `<div class="empty-state">
        <div class="es-ico">📭</div>
        <h4>Bu konuda içerik bulunamadı</h4>
        <p>"${escapeHtml(LP.catName)}" açıldı fakat içerik görüntülenemedi.</p>
        ${detail}
        <button class="btn btn-ghost" style="margin-top:14px" onclick="backFromPath()">← Geri</button>
      </div>`;
      return;
    }

    LP.lessons = data.dersler;
    renderLessonPath();
  }catch(err){
    console.error("openLessonPathFromPack hata:", err);
    const list = $("lessonList");
    if(list){
      list.innerHTML = `<div class="empty-state">
        <div class="es-ico">⚠️</div>
        <h4>Konu açılamadı</h4>
        <p>İçerik şu anda görüntülenemiyor. Lütfen tekrar deneyin.</p>
        <small style="display:block;margin-top:10px;opacity:.7">${escapeHtml(err.message || err)}</small>
        <button class="btn btn-ghost" style="margin-top:14px" onclick="backFromPath()">← Geri</button>
      </div>`;
    }
  }
}

function renderLessonPath(){
  const list = $("lessonList");
  let firstUndoneIdx = LP.lessons.findIndex(l => !isLessonDone(l.id));
  if(firstUndoneIdx === -1) firstUndoneIdx = LP.lessons.length;
  let html = `<div class="dp-line"></div>`;
  LP.lessons.forEach((ders, i) => {
    const done = isLessonDone(ders.id);
    const isActive = i === firstUndoneIdx;
    const isLocked = !done && i > firstUndoneIdx;
    const offCls = "dp-offset-" + (i % 5);
    const circleCls = "dp-circle" + (done ? " done" : "") + (isActive ? " active" : "") + (isLocked ? " locked" : "");
      const title = ders.baslik || "(başlıksız)";
    const shortTitle = title.length > 32 ? title.substring(0, 32) + "…" : title;
    html += `
      <div class="dp-node-wrap ${offCls}" style="animation-delay:${i * 80}ms">
        <div class="dp-node" onclick="handleNodeClick(${i}, ${isLocked})">
          ${isActive ? `<div class="dp-bubble">BAŞLA</div>` : ""}
          <div class="${circleCls}">
            ${isLocked ? "🔒" : (ders.ikon || "📖")}
            <div class="dp-check">✓</div>
            <div class="dp-num">${i + 1}</div>
          </div>
          <div class="dp-title">${escapeHtml(shortTitle)}</div>
          <div class="dp-meta">Konu anlatımı ve sorular</div>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;
}

function handleNodeClick(idx, isLocked){
  if(isLocked){
    const el = document.querySelectorAll(".dp-node")[idx];
    if(el){
      const origTransform = el.style.transform;
      el.style.transition = "transform .08s";
      el.style.transform = "translateX(-6px)";
      setTimeout(() => el.style.transform = "translateX(6px)", 80);
      setTimeout(() => el.style.transform = "translateX(-4px)", 160);
      setTimeout(() => el.style.transform = origTransform, 240);
    }
    return;
  }
  // Harita içindeki alt başlıklar doğrudan derse açılır.
  // Üçlü seçim ekranı yalnızca ana konu kartında gösterilir.
  startLesson(idx);
}

function backFromPath(){
  if(currentSubject) openSubject(currentSubject);
  else goHome();
}
function backFromComplete(){
  if(LP.pack) openLessonPathFromPack(LP.pack);
  else showScreen("lessonPath");
}

function startLesson(idx){
  LP.lessonIdx = idx;
  const ders = LP.lessons[idx];
  LP.cards = Array.isArray(ders.kartlar) ? ders.kartlar : [];
  LP.questions = Array.isArray(ders.sorular)
    ? ders.sorular.map(q => JSON.parse(JSON.stringify(q)))
    : [];

  LP.cardIdx = 0;
  LP.qIdx = 0;
  LP.correct = 0;
  LP.wrong = 0;
  LP.startTime = Date.now();
  LP.qAnswered = false;
  LP.phase = "learn";
  LP.activeQuestion = null;
  LP.usedRecallQuestions = new Set();
  LP.recallQueue = [];

  if(!LP.cards.length){
    startLessonQuestions();
    return;
  }

  showScreen("lessonCardView");
  renderLessonCard();
}

function normalizeStudyText(value){
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”"'’‘.,:;!?()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function getLessonQuestionForCard(cardIndex){
  const card = LP.cards[cardIndex];
  if(!card || !LP.questions.length) return null;

  const answer = normalizeStudyText(card.icerik);
  const title = normalizeStudyText(card.baslik);
  const candidates = LP.questions.filter(q => !LP.usedRecallQuestions.has(q));

  // Önce cevabı doğrudan kart bilgisini karşılayan soruyu bul.
  let exact = candidates.find(q => {
    const correctText = normalizeStudyText(q.secenekler?.[q.dogru]);
    return answer && correctText && (
      correctText === answer ||
      correctText.includes(answer) ||
      answer.includes(correctText)
    );
  });

  // Aynı bilgi birden fazla yerde geçiyorsa başlıkla ikinci bir eşleşme yap.
  if(!exact && title){
    const titleParts = title.split(/\s+/).filter(x => x.length >= 4);
    exact = candidates.find(q => {
      const questionText = normalizeStudyText(q.soru);
      return titleParts.filter(part => questionText.includes(part)).length >= Math.min(2, titleParts.length);
    });
  }

  // Eski veri setlerinde kartIndex güvenilir bir eşleştirme değilse
  // kullanılmamış ilk soruyu güvenli geri dönüş olarak kullan.
  if(!exact){
    exact = candidates.find(q => Number.isInteger(q.kartIndex) && q.kartIndex === cardIndex);
  }
  if(!exact) exact = candidates[0] || null;

  if(exact) LP.usedRecallQuestions.add(exact);
  return exact;
}
function renderLessonCard(){
  const card = LP.cards[LP.cardIdx];
  if(!card){
    startLessonQuestions();
    return;
  }

  const total = LP.cards.length;
  const pct = Math.round((LP.cardIdx / total) * 100);
  $("lcProgress").style.width = pct + "%";
  $("lcCount").textContent = `${LP.cardIdx + 1}/${total}`;

  const tip = card.tip || "kavram";
  const tipLabels = {
    kavram: "KAVRAM",
    onemli: "ÖNEMLİ",
    ornek: "ÖRNEK",
    uyari: "UYARI",
    tarih: "KRİTİK BİLGİ",
    "neden-sonuc": "NEDEN / SONUÇ",
    eslestirme: "EŞLEŞTİRME"
  };
  const tipIcons = {
    kavram: "K",
    onemli: "!",
    ornek: "Ö",
    uyari: "U",
    tarih: "T",
    "neden-sonuc": "→",
    eslestirme: "↔"
  };

  $("lcCardWrap").innerHTML = `
    <div class="lc-card active-learning-card ${tip}">
      <div class="al-card-meta">
        <span class="lc-tag">${tipLabels[tip] || "BİLGİ"}</span>
        <span class="al-phase">ÖNCE ÖĞREN</span>
      </div>
      <div class="lc-icon">${escapeHtml(tipIcons[tip] || "K")}</div>
      <div class="lc-title">${escapeHtml(card.baslik || "")}</div>
      <div class="lc-body">${card.icerik || ""}</div>
      <div class="al-prompt">Bu bilgiyi aklında tut. Bir sonraki adımda hatırlamanı isteyeceğiz.</div>
    </div>
  `;

  const btn = $("lcNextBtn");
  btn.style.display = "inline-flex";
  btn.textContent = "Hatırlamayı dene →";
  if(!card._xpGiven){
    card._xpGiven = true;
    addXP(1);
  }
}

function nextLessonCard(){
  const question = getLessonQuestionForCard(LP.cardIdx);

  if(question){
    LP.activeQuestion = question;
    LP.phase = "recall";
    showScreen("lessonQuiz");
    renderLessonQuestion();
    return;
  }

  LP.cardIdx++;
  if(LP.cardIdx >= LP.cards.length){
    finishLesson();
  }else{
    LP.phase = "learn";
    renderLessonCard();
  }
}

function advanceActiveLearning(){
  LP.cardIdx++;
  LP.activeQuestion = null;

  if(LP.cardIdx >= LP.cards.length){
    finishLesson();
  }else{
    LP.phase = "learn";
    renderLessonCard();
    showScreen("lessonCardView");
  }
}

function exitLesson(){
  kbConfirm("Dersten çıkmak istediğine emin misin? İlerleme kaydedilmez.", {
    icon: "🚪", title: "Dersten Çık?", okText: "Evet, Çık", cancelText: "Devam Et", danger: true
  }).then(yes => {
    if(yes){
      if(LP.pack) openLessonPathFromPack(LP.pack);
      else goHome();
    }
  });
}

function startLessonQuestions(){
  // Yalnızca kartına bağlı olmayan sorular kaldıysa final pekiştirme olarak kullan.
  const remaining = LP.questions.filter(q => !Number.isInteger(q.kartIndex));
  LP.questions = shuffle(remaining);
  LP.qIdx = 0;
  LP.phase = "final";
  LP.activeQuestion = null;

  if(!LP.questions.length){
    finishLesson();
    return;
  }

  showScreen("lessonQuiz");
  renderLessonQuestion();
}

function renderLessonQuestion(){
  const q = LP.activeQuestion || LP.questions[LP.qIdx];
  if(!q){
    if(LP.phase === "recall") advanceActiveLearning();
    else finishLesson();
    return;
  }

  const isRecall = LP.phase === "recall";
  const total = isRecall ? LP.cards.length : LP.questions.length;
  const current = isRecall ? LP.cardIdx : LP.qIdx;
  const pct = Math.round((current / Math.max(total,1)) * 100);

  $("lqProgress").style.width = pct + "%";
  $("lqCount").textContent = `${current + 1}/${total}`;
  $("lqBadge").textContent = isRecall ? "Aktif Hatırlama" : "Pekiştirme Sorusu";
  $("lqText").textContent = q.soru;

  const slot = $("lqImageSlot");
  slot.innerHTML = "";
  if(q.gorsel){
    slot.innerHTML = `<div class="q-image-wrap"><img src="${q.gorsel}" alt="Soru görseli" onclick="this.parentNode.classList.toggle('zoomed')"></div>`;
  }

  const favBtn = $("lqFav");
  if(isFav(q)) favBtn.classList.add("fav-active");
  else favBtn.classList.remove("fav-active");

  const wrap = $("lqOptions");
  wrap.innerHTML = "";
  const indexed = q.secenekler.map((text, i) => ({ text, isCorrect: i === q.dogru }));
  const mixed = q.gorsel ? indexed : shuffle(indexed);

  mixed.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.dataset.correct = item.isCorrect ? "1" : "0";
    btn.style.animationDelay = (i * 55) + "ms";
    btn.innerHTML = `<span class="letter">${LETTERS[i]}</span><span class="opt-text">${escapeHtml(item.text)}</span><span class="mark"></span>`;
    btn.onclick = () => selectLessonOption(btn, item.isCorrect, q);
    wrap.appendChild(btn);
  });

  const fb = $("lqFeedback");
  fb.className = "feedback";
  fb.innerHTML = "";
  $("lqNextBtn").classList.add("hidden");
  $("lqNextBtn").textContent = isRecall ? "Devam →" : "Sonraki →";
  LP.qAnswered = false;
}


function selectLessonOption(btn, isCorrect, q){
  if(LP.qAnswered) return;
  LP.qAnswered = true;

  const all = document.querySelectorAll("#lqOptions .option");
  const fb = $("lqFeedback");

  all.forEach(el => {
    el.classList.add("disabled");
    if(el.dataset.correct === "1"){
      el.classList.add("correct");
      el.querySelector(".mark").textContent = "✓";
    }else if(el !== btn){
      el.classList.add("dim");
    }
  });

  if(isCorrect){
    playCorrectSound();
    LP.correct++;
    trackAnswer(LP.subj?.key, true);
    addXP(2);
    fb.className = "feedback show correct";
    fb.innerHTML = `<div class="fb-title"><span class="ic">✓</span> Doğru hatırladın.</div>
      <div class="fb-body">${q.aciklama ? escapeHtml(q.aciklama) : "Bilgi doğru şekilde geri çağrıldı."}</div>`;
  }else{
    playWrongSound();
    LP.wrong++;
    // Aktif öğrenmede yanlış cevaplanan bilgi kısa süre sonra yeniden sorulur.
    if(LP.phase === "recall" && q){
      if(!Array.isArray(LP.recallQueue)) LP.recallQueue = [];
      LP.recallQueue.push({ q, cardIndex: LP.cardIdx });
    }
    btn.classList.remove("dim");
    btn.classList.add("wrong");
    btn.querySelector(".mark").textContent = "✕";
    trackAnswer(LP.subj?.key, false);
    addWrong(q, LP.catName, LP.catName);

    fb.className = "feedback show wrong";
    fb.innerHTML = `<div class="fb-title"><span class="ic">✕</span> Tekrar et.</div>
      <div class="fb-body">Doğru cevap: <strong>${escapeHtml(q.secenekler[q.dogru])}</strong>
      ${q.aciklama ? "<br>" + escapeHtml(q.aciklama) : ""}</div>`;

    const kartIdx = q.kartIndex;
    if(kartIdx !== undefined && LP.cards[kartIdx]){
      const k = LP.cards[kartIdx];
      const recall = document.createElement("div");
      recall.className = "recall-card";
      recall.innerHTML = `
        <div class="rc-h">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 3 3 9 9 9"/></svg>
          Az önce öğrendiğin bilgi
        </div>
        <div class="rc-title">${escapeHtml(k.baslik || "")}</div>
        <div class="rc-body">${k.icerik || ""}</div>
      `;
      fb.appendChild(recall);
    }
  }

  $("lqNextBtn").classList.remove("hidden");
}


function nextLessonQuestion(){
  if(LP.phase === "recall"){
    // Yanlış yapılan kartı yeni bilgiye geçmeden önce kısa bir tekrar döngüsüne al.
    const retry = Array.isArray(LP.recallQueue) && LP.recallQueue.shift();
    if(retry){
      LP.activeQuestion = retry.q;
      LP.phase = "recallRetry";
      LP.qAnswered = false;
      showScreen("lessonQuiz");
      renderLessonQuestion();
      return;
    }

    advanceActiveLearning();
    return;
  }

  if(LP.phase === "recallRetry"){
    // Tekrar sorusunda yine yanlış yapıldıysa kartı oturum sonuna bırak.
    if(LP.recallQueue?.length){
      const retry = LP.recallQueue.shift();
      LP.activeQuestion = retry.q;
      LP.phase = "recallRetry";
      LP.qAnswered = false;
      renderLessonQuestion();
      return;
    }
    advanceActiveLearning();
    return;
  }

  LP.qIdx++;
  renderLessonQuestion();
}


function toggleLessonFav(){
  const q = LP.questions[LP.qIdx];
  if(!q) return;
  const added = toggleFav(q, LP.catName);
  const btn = $("lqFav");
  if(added) btn.classList.add("fav-active");
  else btn.classList.remove("fav-active");
}

function finishLesson(){
  try{
    const ders = LP.lessons[LP.lessonIdx];
    const totalQ = LP.correct + LP.wrong;
    const pct = totalQ ? Math.round(LP.correct / totalQ * 100) : 0;
    let xp = LP.correct * 3;
    let bonus = 0;
    if(pct >= 60){ bonus = 20; markLessonDone(ders.id); }
    const totalXp = xp + bonus;
    const xpData = addXP(totalXp);
    $("completeXP").textContent = "+" + totalXp;
    $("completeCorrect").textContent = LP.correct;
    $("completeStreak").textContent = xpData.streak;
    $("completeTitle").textContent = pct >= 80 ? "Çok iyi performans" : pct >= 60 ? "Konu tamamlandı" : "Tekrar önerilir";
    $("completeSub").textContent = pct >= 80 ? "Bu konuda iyi bir sonuç aldın." : pct >= 60 ? "Bu konuyu tamamladın. Sonraki konuya geçebilirsin." : "Bu konuyu tekrar çalışman faydalı olabilir.";
    if(pct >= 60){ launchConfetti(); playCompleteSound(); }
    showScreen("lessonComplete");
  }catch(err){
    console.error("finishLesson hata:", err);
    if(LP.pack) openLessonPathFromPack(LP.pack); else goHome();
  }
}
