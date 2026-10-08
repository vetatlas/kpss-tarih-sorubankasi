/* ═══════════ INIT ═══════════ */
/* Korumalı init — bir özellik eksikse atla, çökmeyi önle */
try{ if(typeof initTheme === "function") initTheme(); }catch(e){ console.warn("initTheme:", e.message); }
try{ if(typeof renderSoundBtn === "function") renderSoundBtn(); }catch(e){ console.warn("renderSoundBtn:", e.message); }
try{ renderXP(); }catch(e){ console.warn("renderXP:", e.message); }
try{ renderFavBadge(); }catch(e){ console.warn("renderFavBadge:", e.message); }
try{ renderWrongBadge(); }catch(e){ console.warn("renderWrongBadge:", e.message); }
try{ initHome(); }catch(e){ console.error("initHome:", e.message); }
