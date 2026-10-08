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
async function fetchJSON(fileName, subFolder){
  const folder = subFolder ? (GITHUB.dataFolder + "/" + subFolder + "/") : (GITHUB.dataFolder + "/");
  const path = folder + fileName;
  const base = window.location.href.replace(/[^/]*$/, "");
  const urls = [
    new URL(path, base).href,
    "https://raw.githubusercontent.com/" + GITHUB.user + "/" + GITHUB.repo + "/" + GITHUB.branch + "/" + path,
    "https://cdn.jsdelivr.net/gh/" + GITHUB.user + "/" + GITHUB.repo + "@" + GITHUB.branch + "/" + path
  ];

  function fetchWithTimeout(url, ms){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, {cache:"no-store", signal:controller.signal})
      .then(res => {
        if(!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .finally(() => clearTimeout(timer));
  }

  let lastError = null;
  for(const url of urls){
    try{
      const data = await fetchWithTimeout(url, 6000);
      console.log("✅ Veri kaynağı:", url);
      return data;
    }catch(e){
      lastError = e;
      console.warn("Veri kaynağı başarısız:", url, e.message);
    }
  }
  throw new Error("Bağlantı hatası — içerik yüklenemedi" + (lastError ? ": " + lastError.message : ""));
}
