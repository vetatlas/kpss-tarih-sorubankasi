/* ═══════════ TEMA — Koyu / Açık ═══════════ */
const LS_THEME = "kpssbm_theme_v1";

function loadTheme(){
  try{ return localStorage.getItem(LS_THEME) || "dark"; }
  catch(e){ return "dark"; }
}
function saveTheme(t){
  try{ localStorage.setItem(LS_THEME, t); }catch(e){}
  applyTheme(t);
  renderThemeBtn();
}
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
}
function toggleTheme(){
  const cur = loadTheme();
  const next = cur === "light" ? "dark" : "light";
  saveTheme(next);
}
function initTheme(){
  applyTheme(loadTheme());
  renderThemeBtn();
}
function renderThemeBtn(){
  const btn = document.getElementById("themeBtn");
  if(!btn) return;
  const cur = loadTheme();
  btn.textContent = cur === "light" ? "🌙" : "☀️";
  btn.title = cur === "light" ? "Koyu temaya geç" : "Açık temaya geç";
}
