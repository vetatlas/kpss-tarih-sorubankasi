/* ═══════════ GÜVENLİ ADMIN API ═══════════ */
async function adminRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if(method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json';
  const res = await fetch(ADMIN_API_BASE + path, {
    credentials: 'include',
    ...options,
    method,
    headers
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

async function adminLogin(password) {
  return adminRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

async function adminLogout() {
  try { await adminRequest('/api/logout', { method: 'POST' }); } catch {}
}

async function githubReadFile(filePath){
  return adminRequest('/api/data?path=' + encodeURIComponent(filePath));
}

async function githubWriteFile(filePath, contentObj, message){
  return adminRequest('/api/data?path=' + encodeURIComponent(filePath), {
    method: 'PUT',
    body: JSON.stringify({ path: filePath, content: contentObj, message })
  });
}

async function adminHealth(){
  return adminRequest('/api/health');
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
    console.log(`✅ ${ALL_QUESTIONS.length} soru yüklendi`);
  }catch(e){
    console.error("❌ Sorular yüklenemedi:", e.message);
    ALL_QUESTIONS = [];
    throw e;
  }
  return ALL_QUESTIONS;
}

async function loadPacksIndex(){
  try{
    const data = await fetchJSON(PACKS_INDEX_FILE, PACKS_FOLDER);
    PACKS_INDEX = Array.isArray(data.paketler) ? data.paketler : [];
    PACKS_LOADED = true;
    console.log(`✅ ${PACKS_INDEX.length} paket yüklendi`);
  }catch(e){
    console.warn("⚠️ Paket indeksi yüklenemedi:", e.message);
    PACKS_INDEX = [];
    PACKS_LOADED = true;
  }
  return PACKS_INDEX;
}

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
