/* ═══════════ STORAGE — XP, FAV, WRONG, DETAIL, LESSONS ═══════════ */

/* ─── XP / STREAK ─── */
const LS_XP = "kpssbm_xp_v1";

function loadXP(){
  try{
    const d = JSON.parse(localStorage.getItem(LS_XP)) || { total:0, streak:0, lastDate:null };
    const today = new Date().toDateString();
    if(d.lastDate !== today){
      const yest = new Date(Date.now() - 86400000).toDateString();
      if(d.lastDate !== yest) d.streak = 0;
    }
    return d;
  }catch(e){ return { total:0, streak:0, lastDate:null }; }
}
function saveXP(d){
  try{ localStorage.setItem(LS_XP, JSON.stringify(d)); }catch(e){}
  if(typeof renderXP === "function") renderXP();
}
function addXP(n){
  const d = loadXP();
  d.total += n;
  const today = new Date().toDateString();
  if(d.lastDate !== today){ d.streak += 1; d.lastDate = today; }
  saveXP(d);
  if(typeof showXpPopup === "function") showXpPopup(n);
  return d;
}

/* ─── FAVORİLER ─── */
const LS_FAV = "kpssbm_favs_v1";
function loadFavs(){ try{ return JSON.parse(localStorage.getItem(LS_FAV)) || []; }catch(e){ return []; } }
function saveFavs(l){
  try{ localStorage.setItem(LS_FAV, JSON.stringify(l)); }catch(e){}
  if(typeof renderFavBadge === "function") renderFavBadge();
}
function isFav(q){ return loadFavs().some(f => f.id === qId(q)); }
function toggleFav(q, catAd){
  const id = qId(q);
  const list = loadFavs();
  const idx = list.findIndex(f => f.id === id);
  if(idx >= 0){ list.splice(idx, 1); saveFavs(list); return false; }
  list.unshift({ id, soru: q.soru, secenekler: q.secenekler, dogru: q.dogru,
    aciklama: q.aciklama, gorsel: q.gorsel, kategoriAd: catAd || "", eklenme: Date.now() });
  saveFavs(list);
  return true;
}
function removeFav(id){
  saveFavs(loadFavs().filter(f => f.id !== id));
  if(typeof renderFavorites === "function") renderFavorites();
}

/* ─── YANLIŞLAR ─── */
const LS_WRONG = "kpssbm_wrong_v1";
function loadWrongs(){ try{ return JSON.parse(localStorage.getItem(LS_WRONG)) || []; }catch(e){ return []; } }
function saveWrongs(l){
  try{ localStorage.setItem(LS_WRONG, JSON.stringify(l)); }catch(e){}
  if(typeof renderWrongBadge === "function") renderWrongBadge();
}
function addWrong(q, catAd, catKey){
  const id = qId(q);
  const list = loadWrongs();
  const ex = list.find(w => w.id === id);
  if(ex){ ex.yanlisSayisi = (ex.yanlisSayisi || 1) + 1; ex.sonDeneme = Date.now(); }
  else {
    list.push({ id, soru: q.soru, secenekler: q.secenekler, dogru: q.dogru,
      aciklama: q.aciklama || "", gorsel: q.gorsel || null,
      kategoriAd: catAd || "", kategoriKey: catKey || "",
      eklenme: Date.now(), sonDeneme: Date.now(), yanlisSayisi: 1, dogruSayisi: 0 });
  }
  saveWrongs(list);
}
function markWrongCorrect(q){
  const id = qId(q);
  const list = loadWrongs();
  const item = list.find(w => w.id === id);
  if(item){
    item.dogruSayisi = (item.dogruSayisi || 0) + 1;
    if(item.dogruSayisi >= 2){
      const idx = list.findIndex(w => w.id === id);
      list.splice(idx, 1);
    }
  }
  saveWrongs(list);
}
function removeWrong(id){
  saveWrongs(loadWrongs().filter(w => w.id !== id));
  if(typeof renderWrongs === "function") renderWrongs();
}
function clearAllWrongs(){
  kbConfirm("Tüm yanlış kayıtların silinecek. Bu işlem geri alınamaz.", {
    icon: "🗑", title: "Yanlışları Temizle?", okText: "Sil", cancelText: "İptal", danger: true
  }).then(yes => {
    if(yes){ saveWrongs([]); if(typeof renderWrongs === "function") renderWrongs(); }
  });
}

/* ─── DETAY İSTATİSTİK ─── */
const LS_DETAIL = "kpssbm_detail_v1";
function loadDetail(){
  try{ return JSON.parse(localStorage.getItem(LS_DETAIL)) || { toplam:{ans:0,cor:0}, kat:{} }; }
  catch(e){ return { toplam:{ans:0,cor:0}, kat:{} }; }
}
function saveDetail(d){ try{ localStorage.setItem(LS_DETAIL, JSON.stringify(d)); }catch(e){} }
function trackAnswer(subjectKey, isCorrect){
  const d = loadDetail();
  d.toplam.ans++;
  if(isCorrect) d.toplam.cor++;
  const k = subjectKey || "unknown";
  if(!d.kat[k]) d.kat[k] = { ans:0, cor:0 };
  d.kat[k].ans++;
  if(isCorrect) d.kat[k].cor++;
  saveDetail(d);
}

/* ─── DERS TAMAMLAMA ─── */
const LS_LESSONS_DONE = "kpssbm_lessons_done_v1";
function loadLessonsDone(){
  try{ return JSON.parse(localStorage.getItem(LS_LESSONS_DONE)) || []; }catch(e){ return []; }
}
function markLessonDone(id){
  const l = loadLessonsDone();
  if(!l.includes(id)){
    l.push(id);
    try{ localStorage.setItem(LS_LESSONS_DONE, JSON.stringify(l)); }catch(e){}
  }
}
function isLessonDone(id){ return loadLessonsDone().includes(id); }
