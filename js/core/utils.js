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
  const urls = [
    `https://raw.githubusercontent.com/${GITHUB.user}/${GITHUB.repo}/${GITHUB.branch}/${folder}${fileName}?v=${Date.now()}`,
    `https://cdn.jsdelivr.net/gh/${GITHUB.user}/${GITHUB.repo}@${GITHUB.branch}/${folder}${fileName}`
  ];

  // Timeout'lu fetch (ms içinde yanıt gelmezse reject)
  function fetchWithTimeout(url, ms){
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("⏱ timeout")), ms);
      fetch(url, { cache: "no-store" })
        .then(res => {
          clearTimeout(timer);
          if(!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(resolve)
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  // Paralel dene — hangisi önce gelirse
  try{
    return await Promise.any([
      fetchWithTimeout(urls[0], 8000),
      fetchWithTimeout(urls[1], 8000)
    ]);
  }catch(e){
    throw new Error("Bağlantı hatası — içerik yüklenemedi");
  }
}
