async function openStudyCenterFromPack(pack){
  try{
    LP.pack = pack || null;
    LP.subj = { key: (pack && pack.ders) || (currentSubject && currentSubject.key) || "Tarih", ikon: (pack && pack.ikon) || "" };
    LP.catName = (pack && pack.baslik) || "Konu";
    let data;
    try{ data = await fetchJSON(pack.dosya, PACKS_FOLDER); }
    catch(e){ data = await fetchJSON(pack.dosya); }
    if(!data || !Array.isArray(data.dersler) || !data.dersler.length) throw new Error("Bu konuda henüz içerik bulunmuyor.");
    LP.lessons = data.dersler;
    LP.cards = LP.lessons.flatMap(d => Array.isArray(d.kartlar) ? d.kartlar : []);
    LP.questions = LP.lessons.flatMap(d => Array.isArray(d.sorular) ? d.sorular.map(q => JSON.parse(JSON.stringify(q))) : []);
    $("studyTopicTitle").textContent = LP.catName;
    $("studyTopicSub").textContent = pack.ozet || "Bu konuyu nasıl çalışmak istiyorsun?";
    showScreen("studyCenter");
  }catch(err){
    console.error("Çalışma merkezi yükleme hatası:", err);
    if(typeof toast === "function") toast("Konu içeriği yüklenemedi.", true);
  }
}

/* ═══════════ KONU ÇALIŞMA MERKEZİ + FLASH KARTLAR ═══════════ */
let FLASH_STUDY = { idx:0, flipped:false };

function openStudyCenter(idx){
  if(!LP.lessons || !LP.lessons[idx]) return;
  LP.lessonIdx = idx;
  const ders = LP.lessons[idx];
  LP.cards = Array.isArray(ders.kartlar) ? ders.kartlar : [];
  LP.questions = Array.isArray(ders.sorular) ? ders.sorular : [];
  $('studyTopicTitle').textContent = ders.baslik || 'Konu';
  $('studyTopicSub').textContent = ders.ozet || 'Bu konuyu nasıl çalışmak istiyorsun?';
  showScreen('studyCenter');
}

function backFromStudyCenter(){
  if(typeof backFromPath === 'function') backFromPath();
  else showScreen('lessonPath');
}

function startTopicStudy(){
  if(!LP.cards.length){
    if(typeof toast==='function') toast('Bu konuda henüz konu anlatımı kartı bulunmuyor.');
    return;
  }
  if(LP.pack && typeof openLessonPathFromPack === "function") openLessonPathFromPack(LP.pack);
  else startLesson(LP.lessonIdx);
}

function startTopicQuestions(){
  if(!LP.questions.length){
    if(typeof toast==='function') toast('Bu konuda henüz soru bulunmuyor.',true);
    return;
  }
  pendingPackQuestions = LP.questions.slice();
  openPackCountModal(LP.pack);
}

function startTopicFlashcards(){
  const cards=Array.isArray(LP.cards)?LP.cards:[];
  if(!cards.length){
    if(typeof toast==='function') toast('Bu konuda henüz flash kart bulunmuyor.',true);
    return;
  }
  FLASH_STUDY.idx=0;
  FLASH_STUDY.flipped=false;
  $('flashTopicTitle').textContent=LP.catName||'Flash Kartlar';
  showScreen('flashcardView');
  renderFlashcard();
}

function renderFlashcard(){
  const card=LP.cards[FLASH_STUDY.idx];
  if(!card) return;
  FLASH_STUDY.flipped=false;
  $('flashStage').classList.remove('flipped');
  $('flashFront').textContent=card.baslik||'Bilgi';
  $('flashBack').innerHTML=card.icerik||'';
  $('flashCount').textContent=(FLASH_STUDY.idx+1)+'/'+LP.cards.length;
  $('flashProgressFill').style.width=((FLASH_STUDY.idx+1)/LP.cards.length*100)+'%';
}

function flipFlashcard(){
  FLASH_STUDY.flipped=!FLASH_STUDY.flipped;
  $('flashStage').classList.toggle('flipped',FLASH_STUDY.flipped);
}

function nextFlashcard(){
  if(FLASH_STUDY.idx>=LP.cards.length-1){
    backFromStudyCenter();
    return;
  }
  FLASH_STUDY.idx++;
  renderFlashcard();
}

function prevFlashcard(){
  if(FLASH_STUDY.idx<=0) return;
  FLASH_STUDY.idx--;
  renderFlashcard();
}

function exitFlashcards(){
  backFromStudyCenter();
}
