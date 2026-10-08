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
let FLASH_STUDY = { idx:0, flipped:false, cards:[], allCards:[], sourceCount:0, group:'all' };

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

function flashText(value){
  const box=document.createElement('div');
  box.innerHTML=String(value||'');
  return (box.textContent||box.innerText||'').replace(/\s+/g,' ').trim();
}

/* Kısa, ezberlenebilir flash kartlar üretir.
   Soru bankasındaki soruları kullanmaz; yalnızca konu anlatımındaki
   kartların bilgi parçalarını atomik tekrar kartlarına dönüştürür. */
function flashGroup(card){
  const text=(flashText(card?.baslik||'')+' '+flashText(card?.icerik||'')).toLocaleLowerCase('tr-TR');
  const tip=String(card?.tip||'').toLocaleLowerCase('tr-TR');
  if(/\b(ilk|ilk kez|ilk defa|ilk türk|ilk Türk)\b/i.test(text)) return 'ilkler';
  if(tip==='tarih' || /\b(\d{3,4}|yıl|savaşı|antlaşması|antlaşma|kuruluş|yıkılış)\b/i.test(text)) return 'tarihler';
  if(tip==='eslestirme' || /\b(kim|hangi eser|eseri|kurucusu|hükümdarı|merkezi|ait)\b/i.test(text)) return 'karistirilanlar';
  return 'cekirdek';
}

function flashGroupLabel(key){
  return ({
    all:'Tümü',
    cekirdek:'Çekirdek bilgiler',
    tarihler:'Kritik tarihler',
    karistirilanlar:'Karıştırılanlar',
    ilkler:'İlkler'
  })[key]||'Tümü';
}

function renderFlashGroups(){
  const bar=$('flashGroupBar');
  if(!bar) return;
  const cards=FLASH_STUDY.allCards||[];
  const keys=['all','cekirdek','tarihler','karistirilanlar','ilkler'];
  bar.innerHTML=keys.map(key=>{
    const count=key==='all'?cards.length:cards.filter(c=>c.group===key).length;
    if(key!=='all' && !count) return '';
    return '<button type="button" class="flash-group-chip '+(FLASH_STUDY.group===key?'active':'')+'" onclick="selectFlashGroup(\''+key+'\')">'+flashGroupLabel(key)+' <span>'+count+'</span></button>';
  }).join('');
}

function selectFlashGroup(group){
  FLASH_STUDY.group=group;
  const all=FLASH_STUDY.allCards||[];
  FLASH_STUDY.cards=group==='all'?all:all.filter(c=>c.group===group);
  FLASH_STUDY.idx=0;
  FLASH_STUDY.flipped=false;
  renderFlashGroups();
  renderFlashcard();
}

function buildMicroFlashcards(source){
  const result=[];
  (Array.isArray(source)?source:[]).forEach(card=>{
    const title=flashText(card.baslik||'').trim();
    const raw=String(card.icerik||'');
    const holder=document.createElement('div');
    holder.innerHTML=raw;

    let lines=[];
    const brLines=raw.split(/<br\s*\/?>/i).map(x=>x.trim()).filter(Boolean);
    if(brLines.length>1) lines=brLines;
    else lines=[raw];

    lines.forEach(lineHtml=>{
      const node=document.createElement('div');
      node.innerHTML=lineHtml;
      const strong=node.querySelector('strong,b');
      const plain=(node.textContent||'').replace(/\s+/g,' ').trim();
      if(!plain) return;

      let front='', back='';
      if(strong){
        front=(strong.textContent||'').replace(/\s+/g,' ').trim();
        const clone=node.cloneNode(true);
        clone.querySelectorAll('strong,b').forEach(el=>el.remove());
        back=(clone.textContent||'').replace(/^[\s—:–-]+|[\s—:–-]+$/g,'').replace(/\s+/g,' ').trim();
      }else{
        const match=plain.match(/^(.{2,70}?)\s*[—–:]\s*(.+)$/);
        if(match){
          front=match[1].trim();
          back=match[2].trim();
        }else{
          front=title || 'Bilgi';
          back=plain;
        }
      }

      if(!front || !back) return;
      if(front.length>90) front=front.slice(0,87)+'…';
      if(back.length>180) back=back.slice(0,177)+'…';
      result.push({baslik:front,icerik:back});
    });
  });
  return result;
}

function startTopicFlashcards(){
  const source=Array.isArray(LP.cards)?LP.cards:[];
  const cards=source
    .filter(c=>c && flashText(c.baslik||'') && flashText(c.icerik||''))
    .map(c=>({
      baslik:flashText(c.baslik||''),
      icerik:flashText(c.icerik||''),
      tip:c.tip||'kavram',
      ikon:c.ikon||'📘'
    }));
  if(!cards.length){
    if(typeof toast==='function') toast('Bu konuda henüz flash kart bulunmuyor.',true);
    return;
  }
  FLASH_STUDY.allCards=cards.map(c=>({...c,group:flashGroup(c)}));
  FLASH_STUDY.cards=FLASH_STUDY.allCards;
  FLASH_STUDY.sourceCount=source.length;
  FLASH_STUDY.idx=0;
  FLASH_STUDY.group='all';
  FLASH_STUDY.flipped=false;
  $('flashTopicTitle').textContent=LP.catName||'Flash Kartlar';
  showScreen('flashcardView');
  renderFlashGroups();
  renderFlashcard();
}

function renderFlashcard(){
  const cards=FLASH_STUDY.cards||[];
  const card=cards[FLASH_STUDY.idx];
  if(!card) return;
  FLASH_STUDY.flipped=false;
  $('flashStage').classList.remove('flipped');
  $('flashFront').textContent=card.baslik||'Bilgi';
  $('flashBack').textContent=flashText(card.icerik||'');
  $('flashCount').textContent=(FLASH_STUDY.idx+1)+'/'+cards.length;
  $('flashProgressFill').style.width=((FLASH_STUDY.idx+1)/cards.length*100)+'%';
}

function flipFlashcard(){
  FLASH_STUDY.flipped=!FLASH_STUDY.flipped;
  $('flashStage').classList.toggle('flipped',FLASH_STUDY.flipped);
}

function finishFlashcards(){
  const total=(FLASH_STUDY.cards||[]).length;
  $('flashCompleteCount').textContent=total;
  $('flashCompleteTopic').textContent=LP.catName||'Konu';
  showScreen('flashComplete');
}

function nextFlashcard(){
  if(FLASH_STUDY.idx>=FLASH_STUDY.cards.length-1){
    finishFlashcards();
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

function returnToStudyCenterAfterFlash(){
  showScreen('studyCenter');
}

function exitFlashcards(){
  kbConfirm('Bu flash kart oturumundan çıkmak istediğine emin misin? Bu oturumun sonucu kaydedilmeyecek.',{
    icon:'×',title:'Flash kartlardan çık?',okText:'Evet, çık',cancelText:'Devam et',danger:true
  }).then(yes=>{
    if(yes) showScreen('studyCenter');
  });
}
