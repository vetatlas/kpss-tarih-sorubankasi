/* SES — Web Audio API, harici dosya gerektirmez */
let soundEnabled=true, audioCtx=null;
function loadSound(){try{return localStorage.getItem("kpssbm_sound_v1")!=="off"}catch(e){return true}}
function toggleSound(){soundEnabled=!soundEnabled;try{localStorage.setItem("kpssbm_sound_v1",soundEnabled?"on":"off")}catch(e){} renderSoundBtn();}
function renderSoundBtn(){const b=$("soundBtn");if(!b)return;b.textContent=soundEnabled?"🔊":"🔇";b.title=soundEnabled?"Sesi kapat":"Sesi aç"}
(function(){soundEnabled=loadSound()})();
function beep(freq,duration,type="sine",gain=.035){if(!soundEnabled)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch(e){}}
function playCorrectSound(){beep(660,.08,"sine",.03);setTimeout(()=>beep(880,.12,"sine",.025),70)}
function playWrongSound(){beep(180,.12,"sawtooth",.025)}
function playCompleteSound(){beep(523,.08);setTimeout(()=>beep(659,.08),90);setTimeout(()=>beep(784,.16),180)}
