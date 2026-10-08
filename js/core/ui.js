/* ═══════════ UI — Ekran, Chip, Modal, Animasyon ═══════════ */

/* ─── EKRAN GEÇİŞİ ─── */
function showScreen(id){
  document.querySelectorAll(".screen").forEach(el => {
    if(el.id === id){
      el.classList.remove("hidden");
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    } else el.classList.add("hidden");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ─── HEADER CHIP'LERİ ─── */
function renderXP(){
  const d = loadXP();
  if($("xpTotal")) $("xpTotal").textContent = d.total;
  if($("streakCount")) $("streakCount").textContent = d.streak;
}

function renderFavBadge(){
  const n = loadFavs().length;
  const b = $("favBadge");
  if(!b) return;
  if(n > 0){
    b.classList.remove("hidden");
    b.textContent = n > 99 ? "99+" : n;
    $("favBtn").classList.add("active");
  } else {
    b.classList.add("hidden");
    $("favBtn").classList.remove("active");
  }
}

function renderWrongBadge(){
  const n = loadWrongs().length;
  const b = $("wrongBadge");
  if(!b) return;
  if(n > 0){ b.classList.remove("hidden"); b.textContent = n > 99 ? "99+" : n; }
  else b.classList.add("hidden");
}

/* ─── XP POPUP ─── */
function showXpPopup(n){
  const p = document.createElement("div");
  p.className = "xp-popup";
  p.innerHTML = `<span>⭐</span> +${n} XP`;
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1700);
}

/* ─── SAYI ANİMASYONU ─── */
function animateNumber(el, from, to, dur){
  const t0 = performance.now();
  function tick(t){
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if(p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ─── KONFETİ ─── */
function launchConfetti(){
  const wrap = $("confetti");
  if(!wrap) return;
  wrap.innerHTML = "";
  const colors = ["#c9a227","#e6c455","#f7e9b8","#34d399","#f87171","#fff"];
  for(let i = 0; i < 80; i++){
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (2.5 + Math.random() * 2) + "s";
    p.style.animationDelay = (Math.random() * 0.5) + "s";
    if(Math.random() > 0.5) p.style.borderRadius = "50%";
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

/* ─── BÜYÜK BAŞARI EFEKTİ ─── */
function showBigSuccess(text){
  const el = document.createElement("div");
  el.className = "big-success";
  el.innerHTML = `<div class="bs-text">${text}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

/* ─── ÖZEL CONFIRM MODAL ─── */
function kbConfirm(msg, opts){
  opts = opts || {};
  return new Promise(resolve => {
    const backdrop = $("kbConfirm");
    const icon = $("kbConfirmIcon");
    const title = $("kbConfirmTitle");
    const msgEl = $("kbConfirmMsg");
    const okBtn = $("kbConfirmOk");
    const cancelBtn = $("kbConfirmCancel");
    icon.textContent = opts.icon || "🤔";
    title.textContent = opts.title || "Emin misin?";
    msgEl.textContent = msg || "Bu işlem geri alınamaz.";
    okBtn.textContent = opts.okText || "Tamam";
    cancelBtn.textContent = opts.cancelText || "İptal";
    okBtn.className = "kb-confirm-ok" + (opts.danger ? " danger" : "");
    backdrop.classList.add("show");

    function cleanup(val){
      backdrop.classList.remove("show");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      backdrop.removeEventListener("click", onBg);
      document.removeEventListener("keydown", onKey);
      resolve(val);
    }
    function onOk(){ cleanup(true); }
    function onCancel(){ cleanup(false); }
    function onBg(e){ if(e.target === backdrop) cleanup(false); }
    function onKey(e){
      if(e.key === "Enter"){ e.preventDefault(); cleanup(true); }
      else if(e.key === "Escape"){ e.preventDefault(); cleanup(false); }
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    backdrop.addEventListener("click", onBg);
    document.addEventListener("keydown", onKey);
  });
}
