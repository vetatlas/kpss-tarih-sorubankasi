/* ═══════════ QUIZ ═══════════ */
const S = {
  list: [], idx: 0, correct: 0, wrong: [],
  answered: false, subject: null, cat: null, t0: 0, timerId: null,
  isFavMode: false, isWrongMode: false,
  isExamMode: false, examTimeLeft: 0, examStartTime: 0
};

function resetQuizFlags(){
  S.isFavMode = false;
  S.isWrongMode = false;
  S.isExamMode = false;
}
function stopTimer(){ if(S.timerId) clearInterval(S.timerId); S.timerId = null; }

function startQuiz(subj, catName, list){
  resetQuizFlags();
  if(!list || list.length === 0){
    kbConfirm("Bu kriterlerle soru bulunamadı.", {icon:"📭", title:"Soru Yok", okText:"Tamam", cancelText:"Kapat"});
    return;
  }
  S.list = list;
  S.idx = 0; S.correct = 0; S.wrong = []; S.answered = false;
  S.subject = subj;
  S.cat = { ad: catName, key: catName };
  $("qTotal").textContent = S.list.length;
  showScreen("quiz");
  startTimer();
  renderQuestion();
}

function startTimer(){
  stopTimer();
  S.t0 = Date.now();
  $("qTimer").textContent = "00:00";
  S.timerId = setInterval(() => {
    const sec = Math.floor((Date.now() - S.t0) / 1000);
    $("qTimer").textContent = String(Math.floor(sec / 60)).padStart(2, "0") + ":" +
      String(sec % 60).padStart(2, "0");
  }, 1000);
}

function renderQuestion(){
  const q = S.list[S.idx];
  S.answered = false;
  $("qCounter").textContent = S.idx + 1;
  $("qCat").textContent = S.cat.ad || "Soru";
  $("qText").textContent = q.soru;
  $("barFill").style.width = (S.idx / S.list.length * 100) + "%";
  const altB = $("qAltKonu");
  if(q.altKonu){ altB.textContent = "🏷 " + q.altKonu; altB.classList.remove("hidden"); }
  else altB.classList.add("hidden");
  const zB = $("qZorluk");
  if(q.zorluk){
    zB.textContent = q.zorluk;
    zB.className = "badge " + q.zorluk.toLowerCase();
    zB.classList.remove("hidden");
  } else zB.classList.add("hidden");
  const slot = $("qImageSlot");
  slot.innerHTML = "";
  if(q.gorsel){
    slot.innerHTML = `<div class="q-image-wrap"><img src="${q.gorsel}" alt="Soru görseli" onclick="this.parentNode.classList.toggle('zoomed')"></div>`;
  }
  const favBtn = $("favToggle");
  if(isFav(q)) favBtn.classList.add("fav-active");
  else favBtn.classList.remove("fav-active");
  const wrap = $("optionsList");
  wrap.innerHTML = "";
  const indexed = q.secenekler.map((text, i) => ({ text, isCorrect: i === q.dogru }));
  const mixed = q.gorsel ? indexed : shuffle(indexed);
  mixed.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "option";
    btn.dataset.correct = item.isCorrect ? "1" : "0";
    btn.style.animationDelay = (i * 70) + "ms";
    btn.innerHTML = `<span class="letter">${LETTERS[i]}</span><span class="opt-text">${escapeHtml(item.text)}</span><span class="mark"></span>`;
    btn.onclick = () => selectOption(btn, item.isCorrect, q);
    wrap.appendChild(btn);
  });
  const fb = $("feedback");
  fb.className = "feedback"; fb.innerHTML = "";
  $("nextBtn").classList.add("hidden");
  $("nextBtn").textContent = (S.idx === S.list.length - 1) ? "Sonuçlar →" : "Sonraki →";
}

function selectOption(btn, isCorrect, q){
  if(S.answered) return;
  S.answered = true;
  document.querySelectorAll("#optionsList .option").forEach(el => {
    el.classList.add("disabled");
    if(el.dataset.correct === "1"){
      el.classList.add("correct");
      el.querySelector(".mark").textContent = "✓";
    } else if(el !== btn){ el.classList.add("dim"); }
  });
  const fb = $("feedback");
  if(isCorrect){
    playCorrectSound();
    S.correct++;
    trackAnswer(S.subject?.key, true);
    addXP(2);
    if(S.isWrongMode) markWrongCorrect(q);
    fb.className = "feedback show correct";
    fb.innerHTML = `<div class="fb-title"><span class="ic">✓</span> Doğru!</div>${q.aciklama ? `<div class="fb-body">${escapeHtml(q.aciklama)}</div>` : ''}`;
  } else {
    playWrongSound();
    btn.classList.remove("dim");
    btn.classList.add("wrong");
    btn.querySelector(".mark").textContent = "✕";
    S.wrong.push({ soru: q.soru, verilen: btn.querySelector(".opt-text").textContent, dogru: q.secenekler[q.dogru] });
    trackAnswer(S.subject?.key, false);
    if(!S.isExamMode) addWrong(q, S.cat.ad, S.cat.key);
    fb.className = "feedback show wrong";
    fb.innerHTML = `<div class="fb-title"><span class="ic">✕</span> Yanlış</div><div class="fb-body">Doğru: <strong>${escapeHtml(q.secenekler[q.dogru])}</strong>${q.aciklama ? '<br>' + escapeHtml(q.aciklama) : ''}</div>`;
  }
  $("nextBtn").classList.remove("hidden");
}

function nextQuestion(){
  if(S.idx < S.list.length - 1){ S.idx++; renderQuestion(); }
  else finishQuiz();
}

function quitQuiz(){
  if(S.idx === 0 && !S.answered){ doQuit(); return; }
  kbConfirm("Testten çıkmak istediğine emin misin? İlerleme kaydedilmez.", {
    icon: "?", title: "Testten çık?", okText: "Evet, Çık", cancelText: "Devam Et", danger: true
  }).then(yes => { if(yes) doQuit(); });
}

function doQuit(){
  stopTimer();
  const wasFav = S.isFavMode, wasWrong = S.isWrongMode;
  resetQuizFlags();
  if(wasFav) showScreen("favorites");
  else if(wasWrong) showScreen("wrongs");
  else if(currentSubject) openSubject(currentSubject);
  else goHome();
}

function toggleFavorite(){
  if(!S.list.length) return;
  const q = S.list[S.idx];
  toggleFav(q, S.cat.ad);
  const btn = $("favToggle");
  if(isFav(q)) btn.classList.add("fav-active");
  else btn.classList.remove("fav-active");
}

function finishQuiz(){
  const examMode = S.isExamMode;
  if(examMode) stopTimer();
  else stopTimer();
  const total = S.list.length;
  const pct = total ? Math.round(S.correct / total * 100) : 0;
  const elapsed = examMode ? Math.floor((Date.now() - S.examStartTime) / 1000) : Math.floor((Date.now() - S.t0) / 1000);
  animateNumber($("rPct"), 0, pct, 900);
  animateNumber($("rCorrect"), 0, S.correct, 700);
  animateNumber($("rWrong"), 0, S.wrong.length, 700);
  $("rTime").textContent = fmtTime(elapsed);
  const ring = $("scoreRing");
  let cur = 0;
  const anim = setInterval(() => {
    cur += Math.max(1, Math.ceil(pct / 40));
    if(cur >= pct){ cur = pct; clearInterval(anim); }
    ring.style.background = `conic-gradient(var(--gold) ${cur}%, rgba(255,255,255,.06) ${cur}%)`;
  }, 22);
  let title, msg;
  if(examMode){
    title = "Deneme Tamamlandı";
    msg = pct >= 75 ? "İyi bir performans. Sonuçlarını inceleyebilirsin." : "Sonuçlarını incele, eksiklerini belirle ve tekrar et.";
  } else if(pct >= 90){ title = "Çok iyi performans"; msg = "Bu konuda çok iyi bir sonuç aldın."; }
  else if(pct >= 75){ title = "Çok iyi! 👏"; msg = "Güçlü performans."; }
  else if(pct >= 50){ title = "İyi gidiyorsun 💪"; msg = "Tekrar ile yükselirsin."; }
  else { title = "Tekrar gerekiyor 📚"; msg = "Yanlışlarını incele."; }
  $("rTitle").textContent = title;
  $("rMsg").textContent = msg;
  const box = $("reviewBox"), list = $("reviewList");
  list.innerHTML = "";
  if(S.wrong.length === 0) box.classList.add("hidden");
  else {
    box.classList.remove("hidden");
    S.wrong.forEach((w, i) => {
      const div = document.createElement("div");
      div.className = "review-item";
      div.style.animationDelay = (i * 60) + "ms";
      div.innerHTML = `<div class="rq">${i + 1}. ${escapeHtml(w.soru)}</div><div class="ra"><span>Senin: <i>${escapeHtml(w.verilen)}</i></span><span>Doğru: <b>${escapeHtml(w.dogru)}</b></span></div>`;
      list.appendChild(div);
    });
  }
  if(pct >= 75){ launchConfetti(); playCompleteSound(); }
  S.isExamMode = false;
  showScreen("result");
}

function retry(){
  if(S.isFavMode) startFavoritesQuiz();
  else if(S.isWrongMode) startWrongsQuiz();
  else if(S.subject && S.cat) {
    let list = questionsByDers(S.subject.key).filter(q => (q.kategori || "Genel") === S.cat.ad);
    list = shuffle(list);
    if(S.list.length < list.length) list = list.slice(0, S.list.length);
    startQuiz(S.subject, S.cat.ad, list);
  } else goHome();
}
