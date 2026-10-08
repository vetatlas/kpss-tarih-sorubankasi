/* ═══════════ FLASH KART YÖNETİMİ ═══════════ */
let FLASH_ADMIN_DATA = [];
let FLASH_IMPORT_TARGET = null;

async function loadFlashcardsAdmin(){
  const box = $('flashcardsAdminContainer');
  if(!box) return;
  box.innerHTML = '<div class="flash-admin-empty">Flash kartlar yükleniyor...</div>';
  try{
    const idx = await githubReadFile(GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + PACKS_INDEX_FILE);
    FLASH_ADMIN_DATA = [];
    const packs = Array.isArray(idx.data?.paketler) ? idx.data.paketler : [];
    for(const pack of packs){
      try{
        const r = await githubReadFile(GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + pack.dosya);
        const dersler = Array.isArray(r.data?.dersler) ? r.data.dersler : [];
        FLASH_ADMIN_DATA.push({...pack, dersler});
      }catch(e){
        FLASH_ADMIN_DATA.push({...pack, dersler:[], _error:e.message});
      }
    }
    renderFlashcardsAdmin();
  }catch(e){
    box.innerHTML = '<div class="flash-admin-empty">Flash kart kütüphanesi yüklenemedi.<br><small>'+esc(e.message)+'</small></div>';
  }
}

function renderFlashcardsAdmin(){
  const box = $('flashcardsAdminContainer');
  if(!box) return;

  const dersler = [...new Set(FLASH_ADMIN_DATA.map(p => p.ders || 'Diğer'))];
  let totalCards=0,totalSubtopics=0;
  FLASH_ADMIN_DATA.forEach(p => (p.dersler||[]).forEach(d => {
    totalCards += Array.isArray(d.kartlar) ? d.kartlar.length : 0;
    totalSubtopics++;
  }));

  $('flashStatsBar').innerHTML =
    '<div class="stat-chip"><span class="sc-num">'+dersler.length+'</span><span class="sc-lbl">Ders</span></div>'+
    '<div class="stat-chip"><span class="sc-num" style="color:var(--blue)">'+FLASH_ADMIN_DATA.length+'</span><span class="sc-lbl">Konu</span></div>'+
    '<div class="stat-chip"><span class="sc-num">'+totalSubtopics+'</span><span class="sc-lbl">Alt Başlık</span></div>'+
    '<div class="stat-chip"><span class="sc-num" style="color:var(--green)">'+totalCards+'</span><span class="sc-lbl">Flash Kart</span></div>';

  if(!FLASH_ADMIN_DATA.length){
    box.innerHTML='<div class="flash-admin-empty"><b style="color:#fff">Henüz konu paketi yok.</b><br>Ders ve konu paketleri oluşturulduğunda flash kartlar burada aynı yapı ile görünür.</div>';
    return;
  }

  box.innerHTML =
    '<div class="flash-json-help"><b>Yapı:</b> Ders → konu → alt başlık → flash kart. '+
    'Flash kart JSON'unu ilgili alt başlığa yükleyebilir, mevcut kartları görebilir ve JSON olarak dışarı aktarabilirsin.</div>'+
    dersler.map((ders,di) => {
      const packs = FLASH_ADMIN_DATA.map((p,pi)=>({p,pi})).filter(x => (x.p.ders||'Diğer')===ders);
      return '<div class="flash-admin-subject">'+
        '<div class="flash-admin-subject-head">'+
          '<span class="flash-admin-subject-kicker">DERS</span>'+
          '<strong>'+esc(ders)+'</strong>'+
          '<span>'+packs.length+' konu</span>'+
        '</div>'+
        packs.map(x=>renderFlashPack(x.p,x.pi)).join('')+
      '</div>';
    }).join('');
}

function renderFlashPack(pack,pi){
  const lessons = pack.dersler || [];
  const count = lessons.reduce((n,d)=>n+(Array.isArray(d.kartlar)?d.kartlar.length:0),0);
  return '<div class="flash-admin-pack">'+
    '<div class="flash-admin-pack-head" onclick="toggleFlashPack(this)">'+
      '<div class="flash-admin-pack-title">'+
        '<div class="flash-admin-pack-ico">'+esc(pack.ikon||'K')+'</div>'+
        '<div><span class="flash-admin-pack-kicker">KONU</span><strong>'+esc(pack.baslik||'Konu')+'</strong>'+
        '<small>'+lessons.length+' alt başlık · '+count+' flash kart</small></div>'+
      '</div><span class="flash-admin-chevron">⌄</span>'+
    '</div>'+
    '<div class="flash-admin-body">'+
      (lessons.length ? lessons.map((d,di)=>renderFlashLesson(pack,pi,d,di)).join('') :
        '<div class="flash-admin-empty">Bu konuda henüz alt başlık yok.</div>')+
    '</div>'+
  '</div>';
}

function renderFlashLesson(pack,pi,d,di){
  const cards=Array.isArray(d.kartlar)?d.kartlar:[];
  return '<div class="flash-admin-lesson">'+
    '<div class="flash-admin-lesson-head" onclick="toggleFlashLesson(this)">'+
      '<div class="flash-admin-lesson-info"><span class="flash-admin-sub-kicker">ALT BAŞLIK</span><strong>'+esc(d.baslik||'(başlıksız)')+'</strong>'+
      '<small>'+cards.length+' flash kart</small></div>'+
      '<div class="flash-admin-actions">'+
        '<button class="btn btn-sm btn-blue" onclick="event.stopPropagation();exportFlashLessonJSON('+pi+','+di+')">JSON İndir</button>'+
        '<button class="btn btn-sm" onclick="event.stopPropagation();setFlashImportTarget('+pi+','+di+')">JSON Yükle</button>'+
        '<span>⌄</span>'+
      '</div>'+
    '</div>'+
    '<div class="flash-admin-cards">'+
      (cards.length ? cards.map((c,ci)=>'<div class="flash-admin-card">'+
        '<div class="flash-admin-card-num">'+(ci+1)+'</div>'+
        '<div><strong>'+esc(c.baslik||'Kart')+' <span class="tag lesson">'+esc(c.tip||'kavram')+'</span></strong>'+
        '<p>'+esc(stripHtml(c.icerik||''))+'</p></div>'+
      '</div>').join('') :
      '<div class="flash-admin-empty">Bu alt başlıkta henüz flash kart yok.</div>')+
    '</div>'+
  '</div>';
}

function stripHtml(s){
  const d=document.createElement('div'); d.innerHTML=s; return d.textContent||d.innerText||'';
}
function toggleFlashPack(el){ el.parentElement.classList.toggle('open'); }
function toggleFlashLesson(el){ el.parentElement.classList.toggle('open'); }

function setFlashImportTarget(pi,di){
  FLASH_IMPORT_TARGET={pi,di};
  const input=$('flashImportFile');
  if(input){ input.value=''; input.click(); }
}

function exportFlashLessonJSON(pi,di){
  const pack=FLASH_ADMIN_DATA[pi], lesson=pack?.dersler?.[di];
  if(!pack || !lesson) return;
  const data={
    ders:pack.ders||'',
    konu:lesson.baslik||'',
    konuId:lesson.id||'',
    kartlar:Array.isArray(lesson.kartlar)?lesson.kartlar:[]
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url;
  a.download=(slugify(lesson.baslik||'flash-kartlar'))+'.json';
  a.click(); URL.revokeObjectURL(url);
  toast('⬇️ Flash kart JSON indirildi');
}

async function importFlashcardsJSON(e){
  const f=e.target.files?.[0];
  if(!f) return;
  try{
    const raw=JSON.parse(await f.text());
    let cards=Array.isArray(raw)?raw:(raw.kartlar||[]);
    if(!Array.isArray(cards)) throw new Error('kartlar alanı dizi olmalı');
    cards=cards.map(c=>({
      tip:c.tip||'kavram',
      ikon:c.ikon||'📘',
      baslik:String(c.baslik||c.front||'').trim(),
      icerik:String(c.icerik||c.back||'').trim()
    })).filter(c=>c.baslik && c.icerik);
    if(!cards.length) throw new Error('Geçerli flash kart bulunamadı');

    let target=FLASH_IMPORT_TARGET;
    if(!target){
      const ders=raw.ders||raw.dersAdi||'';
      const konu=raw.konu||raw.baslik||'';
      let matches=[];
      FLASH_ADMIN_DATA.forEach((p,pi)=>(p.dersler||[]).forEach((d,di)=>{
        if((!ders || p.ders===ders) && (!konu || d.baslik===konu || d.id===konu)) matches.push({pi,di});
      }));
      if(matches.length===1) target=matches[0];
      else throw new Error('Hedef konu belirlenemedi. JSON içinde "ders" ve "konu" alanlarını kullan veya konu satırındaki JSON Yükle butonunu kullan.');
    }

    const pack=FLASH_ADMIN_DATA[target.pi], lesson=pack?.dersler?.[target.di];
    if(!pack || !lesson) throw new Error('Hedef konu bulunamadı');
    if(!confirm('"'+lesson.baslik+'" konusundaki mevcut '+((lesson.kartlar||[]).length)+' kartın yerine '+cards.length+' kart yüklenecek. Devam?')) return;

    lesson.kartlar=cards;
    await githubWriteFile(
      GITHUB.dataFolder+'/'+PACKS_FOLDER+'/'+pack.dosya,
      {kategori:pack.baslik,ders:pack.ders,dersler:pack.dersler},
      'Admin: flash kartlar güncellendi — '+lesson.baslik
    );
    FLASH_IMPORT_TARGET=null;
    renderFlashcardsAdmin();
    toast('✓ '+cards.length+' flash kart GitHub\'a kaydedildi');
  }catch(err){
    toast('❌ '+err.message,true);
  }finally{
    e.target.value='';
  }
}

