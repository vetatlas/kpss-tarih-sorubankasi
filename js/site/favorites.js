/* FAVORİLER */
function openFavorites(){ renderFavorites(); showScreen("favorites"); }
function renderFavorites(){
  const list=$("favList"), favs=loadFavs();
  $("favSub").textContent=favs.length ? favs.length+" soru" : "Kayıt yok";
  $("favStartBtn").disabled=!favs.length;
  if(!favs.length){ list.innerHTML='<div class="empty-state"><div class="es-ico">☆</div><h4>Henüz favorin yok</h4><p>Soru çözerken kaydetme simgesini kullanabilirsin.</p></div>'; return; }
  list.innerHTML="";
  favs.forEach((q,i)=>{
    const div=document.createElement("div"); div.className="fav-item"; div.style.animationDelay=(i*40)+"ms";
    div.innerHTML='<button class="wi-remove" title="Favoriden çıkar">✕</button><div class="wi-cat">'+escapeHtml(q.kategoriAd||"Genel")+'</div><div class="wi-q">'+escapeHtml(q.soru)+'</div><div class="wi-meta"><span>'+q.secenekler.length+' seçenek</span></div>';
    div.querySelector(".wi-remove").onclick=()=>{removeFav(q.id);}; list.appendChild(div);
  });
}
function startFavoritesQuiz(){
  const favs=loadFavs();
  if(!favs.length){kbConfirm("Favori soru bulunamadı.",{icon:"?",title:"Favori yok",okText:"Tamam",cancelText:"Kapat"});return;}
  resetQuizFlags(); S.isFavMode=true; S.list=shuffle(favs.map(q=>({...q}))); S.idx=0; S.correct=0; S.wrong=[]; S.answered=false;
  S.subject={key:"favorites"}; S.cat={ad:"Favorilerim",key:"favorites"}; $("qTotal").textContent=S.list.length; showScreen("quiz"); startTimer(); renderQuestion();
}
