/* ═════════════════════════════════════════════════════
   ADMIN PANELİ — Tüm Mantık
   ═════════════════════════════════════════════════════ */

const LS_PASS = 'kpss_admin_pass_v1';
const LS_SESSION = 'kpss_admin_session_v1';

let QUESTIONS = [];
let SELECTED = new Set();
let EDIT_INDEX = -1;
let BULK_ZORLUK = '';

let PACKS_INDEX = [];
let CURRENT_PACK = null;
let CURRENT_PACK_DATA = null;
let LESSON_EDIT_IDX = -1;
let LFORM = null;

/* ─── HELPERS ─── */
function esc(s){ return escapeHtml(s); }
function toast(msg, isErr){
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' error' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.className = 'toast', 3000);
}
function hash(s){
  let h = 0;
  for(let i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
  return String(h);
}
function uid(prefix){ return (prefix || 'x_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function slugify(str){
  const map = {'ç':'c','ğ':'g','ı':'i','İ':'i','ö':'o','ş':'s','ü':'u','Ç':'c','Ğ':'g','Ö':'o','Ş':'s','Ü':'u'};
  return String(str).toLowerCase()
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, c => map[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'paket';
}
function setStatus(text, cls){
  const el = $('statusBadge');
  el.textContent = text;
  el.style.color = cls === 'ok' ? 'var(--green)' : cls === 'err' ? 'var(--red)' : cls === 'warn' ? 'var(--yellow)' : 'var(--muted)';
}
function closeModal(id){ $(id).classList.remove('show'); }

/* ═══════════ LOGIN — Render backend ═══════════ */
async function initLogin(){
  $('loginSub').textContent = 'Devam etmek için yönetici şifresini gir';
  $('loginHint').innerHTML = '🔒 Şifre tarayıcıda saklanmaz; Render sunucusunda doğrulanır.';
  $('loginPass').addEventListener('keydown', e => { if(e.key === 'Enter') handleLogin(); });
  try{
    const h = await adminHealth();
    if(!h.adminConfigured) $('loginHint').innerHTML = '⚠️ Render üzerinde ADMIN_PASSWORD tanımlı değil.';
  }catch(e){
    $('loginHint').innerHTML = '❌ Yönetim sunucusuna bağlanılamadı.';
  }
}
async function handleLogin(){
  const pass = $('loginPass').value;
  if(pass.length < 4){ toast('En az 4 karakter olmalı', true); return; }
  try{
    await adminLogin(pass);
    $('loginPass').value = '';
    startApp();
  }catch(e){
    toast('❌ ' + e.message, true);
    $('loginPass').value = '';
  }
}
async function logout(){
  await adminLogout();
  location.reload();
}
function startApp(){
  $('loginWrap').style.display = 'none';
  $('app').classList.add('show');
  loadQuestions();
}
function changePassword(){
  toast('🔐 Şifre Render Environment Variables içinden değiştirilir.', false);
}
function saveToken(){
  toast('🔐 GitHub Token artık tarayıcıda tutulmuyor.', false);
}
/* ═══════════ SORULAR — Yükle / Kaydet ═══════════ */
async function loadQuestions(){
  setStatus('🔄 Yükleniyor...', '');
    try{
    const r = await githubReadFile(GITHUB.dataFolder + '/sorular.json');
    if(r.notFound) throw new Error('sorular.json bulunamadı');
    QUESTIONS = (r.data.sorular || []).filter(q => q && q.soru);
    QUESTIONS.forEach((q, i) => q._idx = i);
    renderTable();
    renderStats();
    setStatus(`✅ ${QUESTIONS.length} soru yüklendi`, 'ok');
  }catch(e){
    console.error(e);
    const backup = localStorage.getItem('kpss_admin_backup');
    if(backup){
      QUESTIONS = JSON.parse(backup);
      renderTable(); renderStats();
      setStatus('⚠️ Yedekten yüklendi', 'warn');
    } else {
      setStatus('❌ Yüklenemedi: ' + e.message, 'err');
    }
  }
}
function reloadFromGithub(){
  if(confirm('Kaydedilmemiş değişiklikler kaybolur. Devam?')) loadQuestions();
}
async function saveToGithub(){
      if(!confirm(`${QUESTIONS.length} soru GitHub'a kaydedilecek. Devam?`)) return;
  $('saveBtn').disabled = true;
  setStatus('💾 Kaydediliyor...', '');
  try{
    const cleanList = QUESTIONS.map(q => { const c = {...q}; delete c._idx; return c; });
    await githubWriteFile(GITHUB.dataFolder + '/sorular.json', { sorular: cleanList }, `Admin: ${QUESTIONS.length} soru güncellendi`);
    localStorage.setItem('kpss_admin_backup', JSON.stringify(QUESTIONS));
    setStatus(`✅ ${new Date().toLocaleTimeString('tr-TR')} kaydedildi`, 'ok');
    toast(`✅ ${QUESTIONS.length} soru GitHub'a kaydedildi!`);
  }catch(e){
    console.error(e);
    setStatus('❌ ' + e.message, 'err');
    toast('Hata: ' + e.message, true);
  }finally{ $('saveBtn').disabled = false; }
}

/* ═══════════ TABS ═══════════ */
function switchTab(t){
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
  document.querySelectorAll('.tab-content').forEach(x => x.classList.toggle('active', x.dataset.tabContent === t));
  if(t === 'stats') renderStats();
  if(t === 'add') renderAddForm();
  if(t === 'lessons') { backToPackList(); loadPacksFromGithub(); }
}

/* ═══════════ SORULAR — Tablo ═══════════ */
function getFiltered(){
  const fD = $('fDers').value, fK = $('fKategori').value, fZ = $('fZorluk').value;
  const fA = $('fAltKonu').value.toLowerCase().trim();
  const fS = $('fSearch').value.toLowerCase().trim();
  return QUESTIONS.filter(q => {
    if(fD && q.ders !== fD) return false;
    if(fK && q.kategori !== fK) return false;
    if(fZ === '__none'){ if(q.zorluk) return false; }
    else if(fZ && q.zorluk !== fZ) return false;
    if(fA && !(q.altKonu || '').toLowerCase().includes(fA)) return false;
    if(fS && !(q.soru || '').toLowerCase().includes(fS)) return false;
    return true;
  });
}
function applyFilters(){ renderTable(); updateKategoriFilter(); }
function updateKategoriFilter(){
  const fD = $('fDers').value;
  const cats = new Set();
  QUESTIONS.forEach(q => { if(!fD || q.ders === fD) cats.add(q.kategori || 'Genel'); });
  const sel = $('fKategori');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Tümü</option>' + [...cats].sort().map(c => `<option${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
function renderTable(){
  const tbody = $('qTableBody');
  const list = getFiltered();
  if(list.length === 0){
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="ico">📭</div>Sonuç yok</div></td></tr>`;
  } else {
    tbody.innerHTML = list.map(q => {
      const idx = q._idx, z = q.zorluk || '';
      const zCls = z === 'Kolay' ? 'kolay' : z === 'Orta' ? 'orta' : z === 'Zor' ? 'zor' : 'none';
      const zTxt = z || 'Etiketsiz';
      const img = q.gorsel ? `<img src="${esc(q.gorsel)}" alt="">` : '';
      const sel = SELECTED.has(idx) ? 'checked' : '';
      const rowSel = SELECTED.has(idx) ? 'selected' : '';
      return `<tr class="${rowSel}" data-idx="${idx}">
        <td class="center"><input type="checkbox" class="row-check" ${sel} onclick="toggleSelect(${idx}, this)"></td>
        <td class="center" style="color:var(--muted);font-family:'JetBrains Mono',monospace">${idx + 1}</td>
        <td><div class="q-text">${img}${esc(q.soru)}</div></td>
        <td><span class="tag ders">${esc(q.ders || '-')}</span></td>
        <td style="font-size:11.5px;color:var(--text-2)">${esc(q.kategori || '-')}</td>
        <td><span class="tag ${zCls}">${zTxt}</span></td>
        <td>${q.altKonu ? `<span class="tag altkonu">${esc(q.altKonu)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td><div class="row-actions">
          <button class="row-btn" onclick="openEdit(${idx})" title="Düzenle">✏️</button>
          <button class="row-btn danger" onclick="deleteOne(${idx})" title="Sil">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
  }
  updateBulkInfo(); updateStatsBar();
}
function updateStatsBar(){
  const total = QUESTIONS.length;
  const kolay = QUESTIONS.filter(q => q.zorluk === 'Kolay').length;
  const orta = QUESTIONS.filter(q => q.zorluk === 'Orta').length;
  const zor = QUESTIONS.filter(q => q.zorluk === 'Zor').length;
  const none = total - kolay - orta - zor;
  $('statsBar').innerHTML = `
    <div class="stat-chip"><span class="sc-num">${total}</span><span class="sc-lbl">Toplam</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--green)">${kolay}</span><span class="sc-lbl">Kolay</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--yellow)">${orta}</span><span class="sc-lbl">Orta</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--red)">${zor}</span><span class="sc-lbl">Zor</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--muted)">${none}</span><span class="sc-lbl">Etiketsiz</span></div>
  `;
}
function toggleSelect(idx, cb){
  if(cb.checked) SELECTED.add(idx); else SELECTED.delete(idx);
  cb.closest('tr').classList.toggle('selected', cb.checked);
  updateBulkInfo();
}
function toggleAll(cb){
  getFiltered().forEach(q => { if(cb.checked) SELECTED.add(q._idx); else SELECTED.delete(q._idx); });
  renderTable();
}
function updateBulkInfo(){
  const el = $('bulkInfo'), n = SELECTED.size;
  if(n > 0){ el.textContent = `${n} seçili`; el.classList.add('show'); }
  else el.classList.remove('show');
  $('bulkDeleteBtn').disabled = n === 0;
  $('bulkTagBtn').disabled = n === 0;
}

/* ═══════════ SORULAR — CRUD ═══════════ */
function openEdit(idx){
  EDIT_INDEX = idx;
  const q = QUESTIONS[idx];
  $('editTitle').textContent = `✏️ Soru #${idx + 1} Düzenle`;
  $('editFormBody').innerHTML = renderQForm(q, 'edit');
  closeModal('bulkTagModal');
  setTimeout(() => {
    document.querySelectorAll('#editFormBody .correct-btn').forEach((b, i) => {
      if(i === q.dogru) b.classList.add('active');
      b.onclick = () => {
        document.querySelectorAll('#editFormBody .correct-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
  }, 10);
  $('editModal').classList.add('show');
}
function renderQForm(q, prefix){
  q = q || {};
  const letters = ['A','B','C','D','E'];
  return `
    <div class="form-row">
      <div class="form-group"><label>Ders</label>
        <select id="${prefix}Ders">
          ${['Tarih','Coğrafya','Vatandaşlık','Türkçe','Matematik','Güncel'].map(d =>
            `<option${d === q.ders ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Kategori</label>
        <input id="${prefix}Kategori" value="${esc(q.kategori || 'İslamiyet Öncesi')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Seviye</label>
        <select id="${prefix}Seviye">
          ${['Ortaöğretim','Önlisans','Lisans'].map(s =>
            `<option${s === q.seviye ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Alt Konu</label>
        <input id="${prefix}AltKonu" value="${esc(q.altKonu || '')}" placeholder="Örn: Orhun">
      </div>
    </div>
    <div class="form-group"><label>Soru Metni</label>
      <textarea id="${prefix}Soru">${esc(q.soru || '')}</textarea>
    </div>
    <div class="form-group"><label>Seçenekler (doğru cevabı işaretle)</label>
      ${letters.map((L, i) => `
        <div class="opts-row">
          <span class="letter">${L}</span>
          <input type="text" id="${prefix}Opt${i}" value="${esc((q.secenekler || [])[i] || '')}">
          <button class="correct-btn${i === q.dogru ? ' active' : ''}" data-i="${i}" type="button"></button>
        </div>`).join('')}
    </div>
    <div class="form-group"><label>Açıklama (opsiyonel)</label>
      <textarea id="${prefix}Aciklama">${esc(q.aciklama || '')}</textarea>
    </div>
    <div class="form-group"><label>Görsel URL (opsiyonel)</label>
      <input id="${prefix}Gorsel" value="${esc(q.gorsel || '')}" placeholder="https://...">
    </div>
    <div class="form-group"><label>Zorluk</label>
      <div class="zorluk-btns" id="${prefix}ZorlukBtns">
        <button class="zorluk-btn kolay${q.zorluk === 'Kolay' ? ' active' : ''}" data-v="Kolay" onclick="setFormZorluk(this)">Kolay</button>
        <button class="zorluk-btn orta${q.zorluk === 'Orta' ? ' active' : ''}" data-v="Orta" onclick="setFormZorluk(this)">Orta</button>
        <button class="zorluk-btn zor${q.zorluk === 'Zor' ? ' active' : ''}" data-v="Zor" onclick="setFormZorluk(this)">Zor</button>
        <button class="zorluk-btn${!q.zorluk ? ' active' : ''}" data-v="" onclick="setFormZorluk(this)">Yok</button>
      </div>
    </div>
  `;
}
function setFormZorluk(btn){
  btn.parentElement.querySelectorAll('.zorluk-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function collectForm(prefix){
  const q = {
    ders: $(prefix + 'Ders').value,
    kategori: $(prefix + 'Kategori').value.trim() || 'Genel',
    seviye: $(prefix + 'Seviye').value,
    altKonu: $(prefix + 'AltKonu').value.trim(),
    soru: $(prefix + 'Soru').value.trim(),
    secenekler: [0,1,2,3,4].map(i => $(prefix + 'Opt' + i).value.trim()),
    aciklama: $(prefix + 'Aciklama').value.trim(),
    gorsel: $(prefix + 'Gorsel').value.trim() || null,
    zorluk: (document.querySelector(`#${prefix}ZorlukBtns .zorluk-btn.active`) || {}).dataset?.v || ''
  };
  let correct = 0;
  const scope = prefix === 'edit' ? 'editFormBody' : 'addForm';
  document.querySelectorAll(`#${scope} .correct-btn`).forEach((b, i) => { if(b.classList.contains('active')) correct = i; });
  q.dogru = correct;
  return q;
}
function saveEdit(){
  const q = collectForm('edit');
  if(!q.soru){ toast('Soru metni boş', true); return; }
  if(q.secenekler.some(s => !s)){ toast('Tüm seçenekler dolu olmalı', true); return; }
  q._idx = EDIT_INDEX;
  q.id = QUESTIONS[EDIT_INDEX].id || ('admin_' + Date.now());
  QUESTIONS[EDIT_INDEX] = q;
  closeModal('editModal');
  renderTable();
  toast('✅ Düzenlendi (kaydetmek için 💾 GitHub\'a Kaydet)');
}
function deleteOne(idx){
  if(!confirm(`Soru #${idx + 1} silinsin mi?`)) return;
  QUESTIONS.splice(idx, 1);
  QUESTIONS.forEach((q, i) => q._idx = i);
  SELECTED.clear();
  renderTable(); renderStats();
  toast('🗑 Silindi (kaydetmek için 💾)');
}
function bulkDelete(){
  if(SELECTED.size === 0) return;
  if(!confirm(`${SELECTED.size} soru silinsin mi?`)) return;
  const n = SELECTED.size;
  QUESTIONS = QUESTIONS.filter(q => !SELECTED.has(q._idx));
  QUESTIONS.forEach((q, i) => q._idx = i);
  SELECTED.clear();
  renderTable(); renderStats();
  toast(`🗑 ${n} soru silindi`);
}
function openBulkTag(){
  if(SELECTED.size === 0) return;
  BULK_ZORLUK = '';
  document.querySelectorAll('#bulkZorlukBtns .zorluk-btn').forEach(b => b.classList.remove('active'));
  $('bulkAltKonu').value = '';
  $('bulkTagInfo').textContent = `${SELECTED.size} soruya etiket atanacak`;
  $('bulkTagModal').classList.add('show');
}
function setBulkZorluk(v){
  BULK_ZORLUK = v;
  document.querySelectorAll('#bulkZorlukBtns .zorluk-btn').forEach(b => b.classList.remove('active'));
  const btn = [...document.querySelectorAll('#bulkZorlukBtns .zorluk-btn')].find(b => {
    const t = b.textContent.toLowerCase();
    return (v === 'Kolay' && t === 'kolay') || (v === 'Orta' && t === 'orta') ||
           (v === 'Zor' && t === 'zor') || (v === '' && t === 'temizle');
  });
  if(btn) btn.classList.add('active');
}
function applyBulkTag(){
  const altKonu = $('bulkAltKonu').value.trim();
  let n = 0;
  QUESTIONS.forEach(q => {
    if(SELECTED.has(q._idx)){
      if(BULK_ZORLUK !== undefined) q.zorluk = BULK_ZORLUK;
      if(altKonu) q.altKonu = altKonu;
      n++;
    }
  });
  closeModal('bulkTagModal');
  renderTable(); renderStats();
  toast(`🏷 ${n} soru etiketlendi`);
}
function renderAddForm(){
  $('addForm').innerHTML = renderQForm({}, 'add');
  setTimeout(() => {
    document.querySelectorAll('#addForm .correct-btn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#addForm .correct-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    const btns = document.querySelectorAll('#addForm .correct-btn');
    if(btns[1]) btns[1].classList.add('active');
  }, 10);
}
function resetAddForm(){ renderAddForm(); }
function addNewQuestion(){
  const q = collectForm('add');
  if(!q.soru){ toast('Soru metni boş', true); return; }
  if(q.secenekler.some(s => !s)){ toast('Tüm seçenekler dolu olmalı', true); return; }
  q.id = 'admin_' + Date.now();
  q.eklenme = Date.now();
  q.kaynak = 'admin-panel';
  QUESTIONS.unshift(q);
  QUESTIONS.forEach((qq, i) => qq._idx = i);
  renderAddForm();
  renderTable();
  toast('✅ Soru eklendi (kaydetmek için 💾)');
  switchTab('list');
}

/* ═══════════ İSTATİSTİK ═══════════ */
function renderStats(){
  const total = QUESTIONS.length;
  const imgs = QUESTIONS.filter(q => q.gorsel).length;
  const withTag = QUESTIONS.filter(q => q.zorluk).length;
  $('statsGrid').innerHTML = `
    <div class="stat-card"><div class="sc-title">Toplam Soru</div><div class="sc-value">${total}</div></div>
    <div class="stat-card"><div class="sc-title">Görselli</div><div class="sc-value" style="color:var(--blue)">${imgs}</div></div>
    <div class="stat-card"><div class="sc-title">Etiketli</div><div class="sc-value" style="color:var(--green)">${withTag}</div></div>
    <div class="stat-card"><div class="sc-title">Etiketsiz</div><div class="sc-value" style="color:var(--muted)">${total - withTag}</div></div>
  `;
  const z = { Kolay: 0, Orta: 0, Zor: 0, Etiketsiz: 0 };
  QUESTIONS.forEach(q => { z[q.zorluk || 'Etiketsiz']++; });
  $('zorlukChart').innerHTML = Object.entries(z).map(([k, v]) => {
    const p = total ? Math.round(v / total * 100) : 0;
    return `<div class="bar-row"><div class="bl">${k}</div><div class="bt"><div class="bf" style="width:${p}%"></div></div><div class="bv">${v}</div></div>`;
  }).join('');
  const ak = {};
  QUESTIONS.forEach(q => { const k = q.altKonu || 'Etiketsiz'; ak[k] = (ak[k] || 0) + 1; });
  const akArr = Object.entries(ak).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const maxAK = Math.max(...akArr.map(x => x[1]), 1);
  $('altKonuChart').innerHTML = akArr.map(([k, v]) =>
    `<div class="bar-row"><div class="bl">${esc(k)}</div><div class="bt"><div class="bf" style="width:${Math.round(v/maxAK*100)}%"></div></div><div class="bv">${v}</div></div>`
  ).join('');
  const dk = {};
  QUESTIONS.forEach(q => { dk[q.ders || 'Diğer'] = (dk[q.ders || 'Diğer'] || 0) + 1; });
  const dkArr = Object.entries(dk).sort((a, b) => b[1] - a[1]);
  const maxDK = Math.max(...dkArr.map(x => x[1]), 1);
  $('dersChart').innerHTML = dkArr.map(([k, v]) =>
    `<div class="bar-row"><div class="bl">${esc(k)}</div><div class="bt"><div class="bf" style="width:${Math.round(v/maxDK*100)}%"></div></div><div class="bv">${v}</div></div>`
  ).join('');
}

/* ═══════════ IMPORT / EXPORT (SORULAR) ═══════════ */
function exportJSON(){
  const clean = QUESTIONS.map(q => { const c = {...q}; delete c._idx; return c; });
  const blob = new Blob([JSON.stringify({ sorular: clean }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sorular-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('⬇️ JSON indirildi');
}
function importJSON(e){
  const f = e.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try{
      const data = JSON.parse(ev.target.result);
      const list = Array.isArray(data) ? data : (data.sorular || []);
      if(!Array.isArray(list)) throw new Error('Geçersiz format');
      if(!confirm(`${list.length} soru mevcut soruların üzerine yazılacak. Devam?`)) return;
      QUESTIONS = list.map((q, i) => ({ ...q, _idx: i }));
      SELECTED.clear();
      renderTable(); renderStats();
      toast(`✅ ${list.length} soru yüklendi`);
    }catch(err){ toast('❌ ' + err.message, true); }
  };
  r.readAsText(f);
  e.target.value = '';
}

/* ═══════════ DERS PAKETLERİ ═══════════ */
async function loadPacksFromGithub(){
  setStatus('🔄 Ders paketleri yükleniyor...', '');
    try{
    const r = await githubReadFile(GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + PACKS_INDEX_FILE);
    if(r.notFound){
      PACKS_INDEX = [];
      localStorage.setItem('kpss_admin_packs_index_backup', JSON.stringify(PACKS_INDEX));
      renderPackList();
      setStatus('ℹ️ Dizin bulunamadı', 'warn');
      return;
    }
    PACKS_INDEX = Array.isArray(r.data.paketler) ? r.data.paketler : [];
    localStorage.setItem('kpss_admin_packs_index_backup', JSON.stringify(PACKS_INDEX));
    renderPackList();
    setStatus(`✅ ${PACKS_INDEX.length} paket yüklendi`, 'ok');
  }catch(e){
    console.error(e);
    const backup = localStorage.getItem('kpss_admin_packs_index_backup');
    if(backup){
      PACKS_INDEX = JSON.parse(backup);
      renderPackList();
      setStatus('⚠️ Yedekten yüklendi', 'warn');
    } else {
      setStatus('❌ Paketler yüklenemedi: ' + e.message, 'err');
    }
  }
}
function renderPackList(){
  const c = $('packListContainer');
  const totalDers = PACKS_INDEX.length;
  $('packStatsBar').innerHTML = `
    <div class="stat-chip"><span class="sc-num">${totalDers}</span><span class="sc-lbl">Paket</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--blue)">${PACKS_INDEX.filter(p => p.ders === 'Tarih').length}</span><span class="sc-lbl">Tarih</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--purple)">${PACKS_INDEX.filter(p => p.ders === 'Coğrafya').length}</span><span class="sc-lbl">Coğrafya</span></div>
    <div class="stat-chip"><span class="sc-num" style="color:var(--green)">${PACKS_INDEX.filter(p => p.ders === 'Vatandaşlık').length}</span><span class="sc-lbl">Vatandaşlık</span></div>
  `;
  if(PACKS_INDEX.length === 0){
    c.innerHTML = `<div class="empty"><div class="ico">📚</div>
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px">Henüz ders paketi yok</div>
      <div>Yukarıdan "➕ Yeni Ders Paketi" butonuna bas</div>
    </div>`;
    return;
  }
  c.innerHTML = `<div class="pack-grid">${PACKS_INDEX.map((p, i) => `
    <div class="pack-card">
      <div class="pack-top">
        <div class="pack-ico">${esc(p.ikon || '📖')}</div>
        <div style="flex:1;min-width:0">
          <div class="pack-title">${esc(p.baslik)}</div>
          <div class="pack-ders">${esc(p.ders || 'Ders')}</div>
        </div>
      </div>
      <div class="pack-desc">${esc(p.ozet || '—')}</div>
      <div class="pack-file">📄 ${esc(p.dosya)}</div>
      <div class="pack-actions">
        <button class="btn btn-sm btn-primary" onclick="openPack(${i})">📂 Aç</button>
        <button class="btn btn-sm" onclick="editPackMeta(${i})">✏️ Bilgi</button>
        <button class="btn btn-sm btn-danger" onclick="deletePack(${i})">🗑 Sil</button>
      </div>
    </div>
  `).join('')}</div>`;
}
async function openPack(idx){
  CURRENT_PACK = PACKS_INDEX[idx];
    try{
    const r = await githubReadFile(GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + CURRENT_PACK.dosya);
    if(r.notFound){
      CURRENT_PACK_DATA = { kategori: CURRENT_PACK.baslik, dersler: [] };
    } else {
      CURRENT_PACK_DATA = {
        kategori: r.data.kategori || CURRENT_PACK.baslik,
        dersler: Array.isArray(r.data.dersler) ? r.data.dersler : []
      };
    }
    $('packTitleLabel').textContent = CURRENT_PACK.ikon + ' ' + CURRENT_PACK.baslik;
    $('packFileLabel').textContent = '📄 data/dersler/' + CURRENT_PACK.dosya;
    $('packListView').style.display = 'none';
    $('packDetailView').style.display = 'block';
    renderLessonsTab();
  }catch(e){
    toast('Paket açılamadı: ' + e.message, true);
  }
}
function backToPackList(){
  $('packDetailView').style.display = 'none';
  $('packListView').style.display = 'block';
  CURRENT_PACK = null;
  CURRENT_PACK_DATA = null;
}
function renderLessonsTab(){
  if(!CURRENT_PACK_DATA) return;
  const grid = $('lessonGrid');
  const dersler = CURRENT_PACK_DATA.dersler || [];
  const totalCards = dersler.reduce((s, d) => s + ((d.kartlar || []).length), 0);
  const totalQs = dersler.reduce((s, d) => s + ((d.sorular || []).length), 0);
  $('lsTotal').textContent = dersler.length;
  $('lsCards').textContent = totalCards;
  $('lsQs').textContent = totalQs;
  if(dersler.length === 0){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="ico">📚</div>
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px">Bu pakette henüz ders yok</div>
      <div>Yukarıdan "➕ Yeni Ders" butonuna bas</div>
    </div>`;
    return;
  }
  grid.innerHTML = "";
  dersler.forEach((ders, i) => {
    const cardCount = (ders.kartlar || []).length;
    const qCount = (ders.sorular || []).length;
    const div = document.createElement("div");
    div.className = "lesson-card-admin";
    div.innerHTML = `
      <div class="la-top">
        <div style="display:flex;gap:10px;flex:1;min-width:0">
          <div class="la-ico">${ders.ikon || "📖"}</div>
          <div style="flex:1;min-width:0">
            <div class="la-title">${esc(ders.baslik || "(başlıksız)")}</div>
            <span class="la-id">${esc(ders.id || "-")}</span>
          </div>
        </div>
      </div>
      <div class="la-desc">${esc(ders.ozet || "—")}</div>
      <div class="la-meta">
        <span>📇 <b>${cardCount}</b> kart</span>
        <span>✍️ <b>${qCount}</b> soru</span>
      </div>
      <div class="la-actions">
        <button class="btn btn-sm" onclick="openLessonEdit(${i})">✏️ Düzenle</button>
        <button class="btn btn-sm btn-blue" onclick="duplicateLesson(${i})">📋 Kopyala</button>
        <button class="btn btn-sm btn-danger" onclick="deleteLesson(${i})">🗑 Sil</button>
      </div>
    `;
    grid.appendChild(div);
  });
}

/* ═══════════ YENİ PAKET ═══════════ */
function openNewPackModal(){
  $('npBaslik').value = '';
  $('npDers').value = 'Tarih';
  $('npIkon').value = '📖';
  $('npOzet').value = '';
  $('newPackModal').classList.add('show');
  setTimeout(() => $('npBaslik').focus(), 100);
}
async function createNewPack(){
  const baslik = $('npBaslik').value.trim();
  const ders = $('npDers').value;
  const ikon = $('npIkon').value.trim() || '📖';
  const ozet = $('npOzet').value.trim();
  if(!baslik){ toast('Paket başlığı gerekli', true); return; }
    
  let slug = slugify(baslik);
  while(PACKS_INDEX.some(p => p.dosya === slug + '.json')) slug = slug + '-' + Math.floor(Math.random() * 1000);
  const dosya = slug + '.json';
  const newPack = { id: slug, baslik, ders, ikon, ozet, dosya };

  $('createPackBtn').disabled = true;
  $('createPackBtn').textContent = '💾 Oluşturuluyor...';
  setStatus('💾 Paket oluşturuluyor...', '');
  try{
    await githubWriteFile(
      GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + dosya,
      { kategori: baslik, ders, dersler: [] },
      `Admin: yeni ders paketi oluşturuldu — ${baslik}`,
      token
    );
    PACKS_INDEX.push(newPack);
    await githubWriteFile(
      GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + PACKS_INDEX_FILE,
      { paketler: PACKS_INDEX },
      `Admin: ders paketi eklendi — ${baslik}`,
      token
    );
    localStorage.setItem('kpss_admin_packs_index_backup', JSON.stringify(PACKS_INDEX));
    closeModal('newPackModal');
    toast('✅ Paket oluşturuldu!');
    setStatus('✅ Paket oluşturuldu', 'ok');
    renderPackList();
    setTimeout(() => openPack(PACKS_INDEX.length - 1), 300);
  }catch(e){
    console.error(e);
    PACKS_INDEX = PACKS_INDEX.filter(p => p.dosya !== dosya);
    setStatus('❌ ' + e.message, 'err');
    toast('Hata: ' + e.message, true);
  }finally{
    $('createPackBtn').disabled = false;
    $('createPackBtn').textContent = '🚀 Oluştur ve Kaydet';
  }
}
function editPackMeta(idx){
  const p = PACKS_INDEX[idx];
  const newBaslik = prompt('Yeni başlık:', p.baslik);
  if(newBaslik === null) return;
  const newOzet = prompt('Yeni açıklama:', p.ozet || '');
  if(newOzet === null) return;
  p.baslik = newBaslik.trim() || p.baslik;
  p.ozet = newOzet.trim();
  localStorage.setItem('kpss_admin_packs_index_backup', JSON.stringify(PACKS_INDEX));
  renderPackList();
  toast('✏️ Değişiklik alındı (kaydetmek için 💾)');
}
async function deletePack(idx){
  const p = PACKS_INDEX[idx];
  if(!confirm(`"${p.baslik}" paketi listeden çıkarılsın mı?\n\n⚠️ GitHub'daki ${p.dosya} dosyası SİLİNMEZ, sadece listeden kaldırılır.`)) return;
  PACKS_INDEX.splice(idx, 1);
  localStorage.setItem('kpss_admin_packs_index_backup', JSON.stringify(PACKS_INDEX));
  renderPackList();
  toast('🗑 Paket listeden çıkarıldı (kaydetmek için 💾)');
}
async function savePackIndexToGithub(){
      if(!confirm(`Paket listesi (${PACKS_INDEX.length} paket) kaydedilecek. Devam?`)) return;
  $('saveIndexBtn').disabled = true;
  setStatus('💾 Paket listesi kaydediliyor...', '');
  try{
    await githubWriteFile(
      GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + PACKS_INDEX_FILE,
      { paketler: PACKS_INDEX },
      `Admin: paket listesi güncellendi (${PACKS_INDEX.length} paket)`,
      token
    );
    setStatus(`✅ ${new Date().toLocaleTimeString('tr-TR')} kaydedildi`, 'ok');
    toast('✅ Paket listesi kaydedildi');
  }catch(e){
    setStatus('❌ ' + e.message, 'err');
    toast('Hata: ' + e.message, true);
  }finally{ $('saveIndexBtn').disabled = false; }
}

/* ═══════════ DERS DÜZENLEME ═══════════ */
function openLessonEdit(idx){
  if(!CURRENT_PACK_DATA) return;
  LESSON_EDIT_IDX = idx;
  if(idx === -1){
    LFORM = { id: uid("d_"), baslik: "", ikon: "📖", ozet: "", kartlar: [], sorular: [] };
    $('lessonEditTitle').textContent = "➕ Yeni Ders";
  } else {
    LFORM = JSON.parse(JSON.stringify(CURRENT_PACK_DATA.dersler[idx]));
    if(!LFORM.kartlar) LFORM.kartlar = [];
    if(!LFORM.sorular) LFORM.sorular = [];
    $('lessonEditTitle').textContent = `✏️ Düzenle: ${LFORM.baslik || "(başlıksız)"}`;
  }
  renderLessonForm();
  $('lessonEditModal').classList.add('show');
}
function renderLessonForm(){
  const f = LFORM;
  const body = $('lessonEditBody');
  let cardsHTML = '';
  if(f.kartlar.length === 0){
    cardsHTML = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;background:rgba(0,0,0,.15);border-radius:8px">Henüz kart yok — "➕ Kart Ekle" ile başla</div>`;
  } else {
    f.kartlar.forEach((k, ki) => {
      const tip = k.tip || 'kavram';
      cardsHTML += `
        <div class="card-edit-item">
          <button class="cei-del" type="button" onclick="removeCardFromForm(${ki})">🗑</button>
          <div class="cei-head">
            <span class="cei-num">Kart ${ki + 1}</span>
            <span class="cei-type ${tip}">${tip}</span>
          </div>
          <div class="form-row-3" style="margin-bottom:10px">
            <div class="form-group" style="margin-bottom:0"><label>Tip</label>
              <select onchange="updateCardField(${ki}, 'tip', this.value)">
                <option value="kavram"${tip === 'kavram' ? ' selected' : ''}>📖 Kavram</option>
                <option value="onemli"${tip === 'onemli' ? ' selected' : ''}>⭐ Önemli</option>
                <option value="ornek"${tip === 'ornek' ? ' selected' : ''}>💡 Örnek</option>
                <option value="uyari"${tip === 'uyari' ? ' selected' : ''}>⚠️ Uyarı</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0"><label>İkon</label>
              <input value="${esc(k.ikon || '📘')}" oninput="updateCardField(${ki}, 'ikon', this.value)" maxlength="4">
            </div>
            <div class="form-group" style="margin-bottom:0"><label>Başlık</label>
              <input value="${esc(k.baslik || '')}" oninput="updateCardField(${ki}, 'baslik', this.value)">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0"><label>İçerik (HTML destekli)</label>
            <textarea oninput="updateCardField(${ki}, 'icerik', this.value)">${esc(k.icerik || '')}</textarea>
          </div>
        </div>`;
    });
  }
  let qsHTML = '';
  if(f.sorular.length === 0){
    qsHTML = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;background:rgba(0,0,0,.15);border-radius:8px">Henüz soru yok — "➕ Soru Ekle" ile başla</div>`;
  } else {
    f.sorular.forEach((q, qi) => {
      const letters = ['A','B','C','D','E'];
      qsHTML += `
        <div class="card-edit-item">
          <button class="cei-del" type="button" onclick="removeQuestionFromForm(${qi})">🗑</button>
          <div class="cei-head">
            <span class="cei-num">Soru ${qi + 1}</span>
            ${q.kartIndex !== undefined ? `<span class="cei-type kavram">🎯 Kart ${parseInt(q.kartIndex) + 1}</span>` : ''}
          </div>
          <div class="form-group" style="margin-bottom:10px"><label>Soru Metni</label>
            <textarea oninput="updateQuestionField(${qi}, 'soru', this.value)">${esc(q.soru || '')}</textarea>
          </div>
          ${letters.map((L, li) => `
            <div class="opts-row">
              <span class="letter">${L}</span>
              <input value="${esc((q.secenekler || [])[li] || '')}" oninput="updateOptionField(${qi}, ${li}, this.value)">
              <button class="correct-btn${q.dogru === li ? ' active' : ''}" type="button" onclick="setQuestionCorrect(${qi}, ${li}, this)"></button>
            </div>
          `).join('')}
          <div class="form-row" style="margin-top:10px">
            <div class="form-group" style="margin-bottom:10px"><label>İlgili Kart</label>
              <select onchange="updateQuestionField(${qi}, 'kartIndex', this.value)">
                <option value="">— Seçilmedi —</option>
                ${f.kartlar.map((k, ki) => `<option value="${ki}"${parseInt(q.kartIndex) === ki ? ' selected' : ''}>Kart ${ki + 1}: ${esc(k.baslik || '-')}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:10px"><label>Alt Konu</label>
              <input value="${esc(q.altKonu || '')}" oninput="updateQuestionField(${qi}, 'altKonu', this.value)">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0"><label>Açıklama</label>
            <textarea oninput="updateQuestionField(${qi}, 'aciklama', this.value)">${esc(q.aciklama || '')}</textarea>
          </div>
        </div>`;
    });
  }
  body.innerHTML = `
    <div class="sub-section">
      <div class="sub-section-header"><h4>📘 Ders Bilgileri</h4></div>
      <div class="form-row-3">
        <div class="form-group" style="margin-bottom:10px"><label>İkon</label>
          <input value="${esc(f.ikon)}" oninput="LFORM.ikon = this.value" maxlength="4">
        </div>
        <div class="form-group" style="margin-bottom:10px"><label>Başlık</label>
          <input value="${esc(f.baslik)}" oninput="LFORM.baslik = this.value">
        </div>
        <div class="form-group" style="margin-bottom:10px"><label>ID</label>
          <input value="${esc(f.id)}" readonly style="font-family:'JetBrains Mono',monospace;font-size:11.5px;opacity:.7">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0"><label>Özet</label>
        <input value="${esc(f.ozet)}" oninput="LFORM.ozet = this.value">
      </div>
    </div>
    <div class="sub-section">
      <div class="sub-section-header">
        <h4>📇 Kartlar</h4>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="count">${f.kartlar.length} kart</span>
          <button class="btn btn-sm btn-blue" type="button" onclick="addCardToForm()">➕ Kart Ekle</button>
        </div>
      </div>
      <div id="cardsContainer">${cardsHTML}</div>
    </div>
    <div class="sub-section">
      <div class="sub-section-header">
        <h4>✍️ Sorular</h4>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="count">${f.sorular.length} soru</span>
          <button class="btn btn-sm btn-blue" type="button" onclick="addQuestionToForm()">➕ Soru Ekle</button>
        </div>
      </div>
      <div id="questionsContainer">${qsHTML}</div>
    </div>
  `;
}
function addCardToForm(){ LFORM.kartlar.push({ tip: "kavram", ikon: "📘", baslik: "", icerik: "" }); renderLessonForm(); }
function removeCardFromForm(i){ if(!confirm("Kart silinsin mi?")) return; LFORM.kartlar.splice(i, 1); renderLessonForm(); }
function updateCardField(i, field, value){ LFORM.kartlar[i][field] = value; if(field === "tip") renderLessonForm(); }
function addQuestionToForm(){
  LFORM.sorular.push({ soru: "", secenekler: ["", "", "", "", ""], dogru: 0, aciklama: "", kartIndex: LFORM.kartlar.length > 0 ? 0 : undefined, altKonu: "" });
  renderLessonForm();
}
function removeQuestionFromForm(i){ if(!confirm("Soru silinsin mi?")) return; LFORM.sorular.splice(i, 1); renderLessonForm(); }
function updateQuestionField(i, field, value){
  LFORM.sorular[i][field] = value;
  if(field === "kartIndex" && value !== "") LFORM.sorular[i].kartIndex = parseInt(value, 10);
  else if(field === "kartIndex" && value === "") delete LFORM.sorular[i].kartIndex;
}
function updateOptionField(qi, oi, value){
  if(!LFORM.sorular[qi].secenekler) LFORM.sorular[qi].secenekler = ["", "", "", "", ""];
  LFORM.sorular[qi].secenekler[oi] = value;
}
function setQuestionCorrect(qi, oi, btn){
  LFORM.sorular[qi].dogru = oi;
  btn.closest(".card-edit-item").querySelectorAll(".correct-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}
function saveLessonEdit(){
  if(!LFORM.baslik.trim()){ toast("Ders başlığı boş olamaz", true); return; }
  if(LFORM.kartlar.some(k => !k.baslik.trim() || !k.icerik.trim())){ toast("Kart başlıkları ve içerikleri boş olamaz", true); return; }
  if(LFORM.sorular.some(q => !q.soru.trim() || q.secenekler.some(s => !s.trim()))){ toast("Soru metni ve tüm seçenekler dolu olmalı", true); return; }
  LFORM.sorular.forEach(q => { if(q.altKonu === "") delete q.altKonu; });
  if(LESSON_EDIT_IDX === -1){
    CURRENT_PACK_DATA.dersler.push(JSON.parse(JSON.stringify(LFORM)));
    toast("✅ Ders eklendi (kaydetmek için 💾)");
  } else {
    CURRENT_PACK_DATA.dersler[LESSON_EDIT_IDX] = JSON.parse(JSON.stringify(LFORM));
    toast("✅ Ders güncellendi (kaydetmek için 💾)");
  }
  closeModal("lessonEditModal");
  renderLessonsTab();
}
function deleteLesson(i){
  const d = CURRENT_PACK_DATA.dersler[i];
  if(!confirm(`"${d.baslik}" dersi silinsin mi?`)) return;
  CURRENT_PACK_DATA.dersler.splice(i, 1);
  renderLessonsTab();
  toast("🗑 Ders silindi (kaydetmek için 💾)");
}
function duplicateLesson(i){
  const d = CURRENT_PACK_DATA.dersler[i];
  const copy = JSON.parse(JSON.stringify(d));
  copy.id = uid("d_");
  copy.baslik = d.baslik + " (kopya)";
  CURRENT_PACK_DATA.dersler.splice(i + 1, 0, copy);
  renderLessonsTab();
  toast("📋 Ders kopyalandı");
}
async function saveCurrentPackToGithub(){
  if(!CURRENT_PACK || !CURRENT_PACK_DATA){ toast("Aktif paket yok", true); return; }
      if(!confirm(`"${CURRENT_PACK.baslik}" paketi (${CURRENT_PACK_DATA.dersler.length} ders) kaydedilecek. Devam?`)) return;
  $('savePackBtn').disabled = true;
  setStatus("💾 Paket kaydediliyor...", "");
  try{
    await githubWriteFile(
      GITHUB.dataFolder + '/' + PACKS_FOLDER + '/' + CURRENT_PACK.dosya,
      { kategori: CURRENT_PACK_DATA.kategori || CURRENT_PACK.baslik, ders: CURRENT_PACK.ders, dersler: CURRENT_PACK_DATA.dersler },
      `Admin: ${CURRENT_PACK.baslik} güncellendi (${CURRENT_PACK_DATA.dersler.length} ders)`,
      token
    );
    localStorage.setItem('kpss_admin_pack_' + CURRENT_PACK.id + '_backup', JSON.stringify(CURRENT_PACK_DATA));
    setStatus(`✅ ${new Date().toLocaleTimeString("tr-TR")} kaydedildi`, "ok");
    toast(`✅ Paket GitHub'a kaydedildi!`);
  }catch(e){
    console.error(e);
    setStatus("❌ " + e.message, "err");
    toast("Hata: " + e.message, true);
  }finally{ $('savePackBtn').disabled = false; }
}
function exportLessonsJSON(){
  if(!CURRENT_PACK_DATA) return;
  const blob = new Blob([JSON.stringify(CURRENT_PACK_DATA, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (CURRENT_PACK ? CURRENT_PACK.dosya : "dersler.json");
  a.click();
  URL.revokeObjectURL(url);
  toast("⬇️ JSON indirildi");
}
function importLessonsJSON(e){
  const f = e.target.files[0];
  if(!f || !CURRENT_PACK_DATA) return;
  const r = new FileReader();
  r.onload = ev => {
    try{
      const data = JSON.parse(ev.target.result);
      const dersler = Array.isArray(data) ? data : (data.dersler || []);
      if(!Array.isArray(dersler)) throw new Error("Geçersiz format");
      if(!confirm(`${dersler.length} ders mevcut derslerin üzerine yazılacak. Devam?`)) return;
      CURRENT_PACK_DATA = {
        kategori: data.kategori || CURRENT_PACK.baslik,
        dersler: dersler
      };
      renderLessonsTab();
      toast(`✅ ${dersler.length} ders yüklendi`);
    }catch(err){ toast("❌ " + err.message, true); }
  };
  r.readAsText(f);
  e.target.value = "";
}

/* ═══════════ INIT ═══════════ */
initLogin();
