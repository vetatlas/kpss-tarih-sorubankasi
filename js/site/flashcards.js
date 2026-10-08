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
    toast && toast('Bu konuda henüz konu anlatımı kartı bulunmuyor.');
    return;
  }
  startLesson(LP.lessonIdx);
}

function startTopicQuestions(){
  const ders=LP.lessons[LP.lessonIdx];
  const questions=(ders?.sorular||[]).map(q=>JSON.parse(JSON.stringify(q)));
  if(!questions.length){
    if(typeof toast==='function') toast('Bu konuda henüz soru bulunmuyor.',true);
    return;
  }
  LP.cards=Array.isArray(ders.kartlar)?ders.kartlar:[];
  LP.questions=shuffle(questions);
  LP.qIdx=0; LP.correct=0; LP.wrong=0; LP.startTime=Date.now(); LP.qAnswered=false;
  showScreen('lessonQuiz');
  renderLessonQuestion();
}

function startTopicFlashcards(){
  const ders=LP.lessons[LP.lessonIdx];
  const cards=Array.isArray(ders?.kartlar)?ders.kartlar:[];
  if(!cards.length){
    if(typeof toast==='function') toast('Bu konuda henüz flash kart bulunmuyor.',true);
    return;
  }
  LP.cards=cards;
  FLASH_STUDY.idx=0;
  FLASH_STUDY.flipped=false;
  $('flashTopicTitle').textContent=ders.baslik||'Flash Kartlar';
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
