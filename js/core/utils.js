/* ═══════════ UTILS ═══════════ */
const $ = id => document.getElementById(id);

function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function shuffle(a){
  const arr = a.slice();
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtTime(sec){
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function qId(q){
  return q.id || ("h_" + String(q.soru || "").substring(0, 40).replace(/\s/g, "_"));
}

/* GitHub raw fetch — 2 kaynak dener (raw + jsdelivr) */
async function fetchJSON(fileName, subFolder){
  const folder = subFolder ? (GITHUB.dataFolder + "/" + subFolder + "/") : (GITHUB.dataFolder + "/");
  const bases = [
    `https://raw.githubusercontent.com/${GITHUB.user}/${GITHUB.repo}/${GITHUB.branch}/${folder}`,
    `https://cdn.jsdelivr.net/gh/${GITHUB.user}/${GITHUB.repo}@${GITHUB.branch}/${folder}`
  ];
  let lastErr = null;
  for(const base of bases){
    try{
      const res = await fetch(base + fileName + "?v=" + Date.now(), { cache: "no-store" });
      if(!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    }catch(err){ lastErr = err; }
  }
  throw lastErr || new Error("Bağlantı hatası");
}
