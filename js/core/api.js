/* ═══════════ GITHUB API — Sadece admin panelde kullanılır ═══════════ */

async function githubReadFile(filePath, token){
  const url = `https://api.github.com/repos/${GITHUB.user}/${GITHUB.repo}/contents/${filePath}?ref=${GITHUB.branch}`;
  const headers = { 'User-Agent': 'KPSS-Admin' };
  if(token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if(res.status === 404) return { notFound: true };
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const info = await res.json();
  const content = decodeURIComponent(escape(atob(info.content)));
  return { sha: info.sha, data: JSON.parse(content) };
}

async function githubWriteFile(filePath, contentObj, message, token){
  const url = `https://api.github.com/repos/${GITHUB.user}/${GITHUB.repo}/contents/${filePath}`;
  // SHA varsa al
  let sha = null;
  const getRes = await fetch(url + `?ref=${GITHUB.branch}`, {
    headers: { 'Authorization': `token ${token}`, 'User-Agent': 'KPSS-Admin' }
  });
  if(getRes.ok){ const info = await getRes.json(); sha = info.sha; }

  const content = JSON.stringify(contentObj, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const body = { message, content: encoded, branch: GITHUB.branch };
  if(sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'KPSS-Admin'
    },
    body: JSON.stringify(body)
  });
  if(!putRes.ok){
    const err = await putRes.text();
    throw new Error('HTTP ' + putRes.status + ': ' + err.substring(0, 120));
  }
  return putRes.json();
}

/* ─── SORULARI YÜKLE ─── */
async function loadAllQuestions(){
  try{
    const data = await fetchJSON(SORULAR_FILE);
    if(data && Array.isArray(data.sorular)){
      ALL_QUESTIONS = data.sorular.filter(q =>
        q && q.soru && Array.isArray(q.secenekler) &&
        typeof q.dogru === 'number' && q.secenekler.length >= 2
      );
    } else if(Array.isArray(data)){
      ALL_QUESTIONS = data.filter(q => q && q.soru && Array.isArray(q.secenekler));
    }
  }catch(e){
    console.warn("Sorular yüklenemedi:", e.message);
    ALL_QUESTIONS = [];
  }
  return ALL_QUESTIONS;
}

/* ─── PAKET İNDEKSİ YÜKLE ─── */
async function loadPacksIndex(){
  try{
    const data = await fetchJSON(PACKS_INDEX_FILE, PACKS_FOLDER);
    PACKS_INDEX = Array.isArray(data.paketler) ? data.paketler : [];
    PACKS_LOADED = true;
  }catch(e){
    console.warn("Paket indeksi yüklenemedi:", e.message);
    PACKS_INDEX = [];
    PACKS_LOADED = true;
  }
  return PACKS_INDEX;
}

/* ─── YARDIMCILAR ─── */
function questionsByDers(ders){
  return ALL_QUESTIONS.filter(q => (q.ders || "Genel") === ders);
}
function categoriesOfDers(ders){
  const cats = {};
  questionsByDers(ders).forEach(q => {
    const k = q.kategori || "Genel";
    cats[k] = (cats[k] || 0) + 1;
  });
  return cats;
}
function packsOfDers(ders){
  return PACKS_INDEX.filter(p => p.ders === ders);
}
