/* ═══════════ YANLIŞLAR ═══════════ */
function openWrongs(){ renderWrongs(); showScreen("wrongs"); }

function renderWrongs(){
  const list = $("wrongList");
  const wrongs = loadWrongs();
  $("wrongSub").textContent = wrongs.length > 0 ? `${wrongs.length} soru` : "Kayıt yok";
  const totalW = wrongs.reduce((s, w) => s + (w.yanlisSayisi || 1), 0);
  const mastered = wrongs.filter(w => (w.dogruSayisi || 0) >= 1).length;
  $("wrongStats").innerHTML = `
    <div style="background:var(--red-bg);border:1px solid var(--red-line);border-radius:12px;padding:12px 16px;flex:1;min-width:140px">
      <div style="font-size:22px;font-weight:800;color:var(--red)">${wrongs.length}</div>
      <div style="font-size:10px;font-weight:800;color:var(--muted);letter-spacing:1.3px;text-transform:uppercase">Bekleyen</div>
    </div>
    <div style="background:rgba(201,162,39,.1);border:1px solid rgba(201,162,39,.28);border-radius:12px;padding:12px 16px;flex:1;min-width:140px">
      <div style="font-size:22px;font-weight:800;color:var(--gold-2)">${totalW}</div>
      <div style="font-size:10px;font-weight:800;color:var(--muted);letter-spacing:1.3px;text-transform:uppercase">Toplam Yanlış</div>
    </div>
    <div style="background:var(--green-bg);border:1px solid var(--green-line);border-radius:12px;padding:12px 16px;flex:1;min-width:140px">
      <div style="font-size:22px;font-weight:800;color:var(--green)">${mastered}</div>
      <div style="font-size:10px;font-weight:800;color:var(--muted);letter-spacing:1.3px;text-transform:uppercase">Tekrar Doğru</div>
    </div>
  `;
  if(wrongs.length === 0){
    list.innerHTML = `<div class="empty-state"><div class="es-ico">🎉</div><h4>Hiç yanlışın yok!</h4></div>`;
    $("wrongStartBtn").disabled = true;
    return;
  }
  $("wrongStartBtn").disabled = false;
  list.innerHTML = "";
  wrongs.forEach((w, i) => {
    const div = document.createElement("div");
    div.className = "wrong-item";
    div.style.animationDelay = (i * 40) + "ms";
    const m = (w.dogruSayisi || 0) >= 1;
    div.innerHTML = `
      <button class="wi-remove" onclick="removeWrong('${w.id}')">✕</button>
      <div class="wi-cat">${escapeHtml(w.kategoriAd || "Genel")}</div>
      <div class="wi-q">${escapeHtml(w.soru)}</div>
      <div class="wi-meta">
        <span>Yanlış: <b>${w.yanlisSayisi || 1}×</b></span>
        ${m ? `<span style="color:var(--green);font-weight:700">Doğru: ${w.dogruSayisi}×</span>` : ""}
      </div>
    `;
    list.appendChild(div);
  });
}

function startWrongsQuiz(){
  resetQuizFlags();
  const wrongs = loadWrongs();
  if(wrongs.length === 0){
    kbConfirm("Yanlış kaydı yok.", {icon:"?", title:"Kayıt yok", okText:"Tamam", cancelText:"Kapat"});
    return;
  }
  S.isWrongMode = true;
  S.list = shuffle(wrongs.map(w => ({ ...w })));
  S.idx = 0; S.correct = 0; S.wrong = []; S.answered = false;
  S.subject = { key: "wrong" };
  S.cat = { ad: "Yanlışlarım" };
  $("qTotal").textContent = S.list.length;
  showScreen("quiz");
  startTimer();
  renderQuestion();
}
