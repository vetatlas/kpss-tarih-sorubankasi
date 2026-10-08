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

/* ═══════════ GitHub raw fetch — PARALEL + TIMEOUT ═══════════
   İki kaynak (raw.githubusercontent.com + jsdelivr.net) AYNI ANDA denenir.
   İlk yanıt veren kazanır. Her ikisi de 8 saniye içinde yanıt vermezse hata.
   → Yavaş yükleme sorunu çözülür.
   ═══════════════════════════════════════════════════════════════ */
async function fetchJSON(fileName, subFolder){\n  const folder = subFolder ? (GITHUB.dataFolder + "/" + subFolder + "/") : (GITHUB.dataFolder + "/");\n  const path = folder + fileName;\n  const base = window.location.href.replace(/[^/]*$/, "");\n  const urls = [\n    new URL(path, base).href,\n    "https://raw.githubusercontent.com/" + GITHUB.user + "/" + GITHUB.repo + "/" + GITHUB.branch + "/" + path,\n    "https://cdn.jsdelivr.net/gh/" + GITHUB.user + "/" + GITHUB.repo + "@" + GITHUB.branch + "/" + path\n  ];\n\n  function fetchWithTimeout(url, ms){\n    const controller = new AbortController();\n    const timer = setTimeout(() => controller.abort(), ms);\n    return fetch(url, {cache:"no-store", signal:controller.signal})\n      .then(res => { if(!res.ok) throw new Error("HTTP " + res.status); return res.json(); })\n      .finally(() => clearTimeout(timer));\n  }\n\n  let lastError = null;\n  for(const url of urls){\n    try{\n      const data = await fetchWithTimeout(url, 6000);\n      console.log("✅ Veri kaynağı:", url);\n      return data;\n    }catch(e){ lastError = e; console.warn("Veri kaynağı başarısız:", url, e.message); }\n  }\n  throw new Error("Bağlantı hatası — içerik yüklenemedi" + (lastError ? ": " + lastError.message : ""));\n}\n