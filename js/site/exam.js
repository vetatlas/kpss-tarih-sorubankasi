/* ═══════════ DENEME SINAVI ═══════════ */
let examCount = 20, examDuration = 15, examDers = "", examDiff = "";

function openDenemeSetup(){
  examDers = ""; examDiff = "";
  $("examDers").value = "";
  document.querySelectorAll("#examModal .diff-btn").forEach(b => b.classList.toggle("active", b.dataset.diff === ""));
  $("examModal").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeExamModal(){
  $("examModal").classList.remove("show");
  document.body.style.overflow = "";
}
$("examModal").addEventListener("click", e => {
  if(e.target === $("examModal")) closeExamModal();
});
$("examDers").addEventListener("change", () => { examDers = $("examDers").value; });
document.querySelectorAll("#examCountOptions .count-opt").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#examCountOptions .count-opt").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    examCount = parseInt(btn.dataset.count, 10);
  };
});
document.querySelectorAll("#examDurationOptions .duration-opt").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#examDurationOptions .duration-opt").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    examDuration = parseInt(btn.dataset.min, 10);
  };
});
document.querySelectorAll("#examModal .diff-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#examModal .diff-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    examDiff = btn.dataset.diff;
  };
});

async function startExam(){
  closeExamModal();
  await loadAllQuestions();
  let pool = ALL_QUESTIONS;
  if(examDers) pool = pool.filter(q => (q.ders || "Genel") === examDers);
  if(examDiff) pool = pool.filter(q => q.zorluk === examDiff);
  if(pool.length === 0){
    kbConfirm("Bu kriterlerle soru bulunamadı.", {icon:"📭", title:"Soru Yok", okText:"Tamam", cancelText:"Kapat"});
    return;
  }
  const list = shuffle(pool).slice(0, Math.min(examCount, pool.length));
  resetQuizFlags();
  S.isExamMode = true;
  S.list = list;
  S.idx = 0; S.correct = 0; S.wrong = []; S.answered = false;
  S.subject = { key: examDers || "exam" };
  const label = (examDers || "Karışık") + (examDiff ? " / " + examDiff : "");
  S.cat = { ad: `Deneme (${label}, ${examDuration} dk)` };
  $("qTotal").textContent = S.list.length;
  S.examTimeLeft = examDuration * 60;
  S.examStartTime = Date.now();
  showScreen("quiz");
  startExamTimer();
  renderQuestion();
}
function startExamTimer(){
  stopTimer();
  $("qTimer").textContent = String(Math.floor(S.examTimeLeft / 60)).padStart(2, "0") + ":" +
    String(S.examTimeLeft % 60).padStart(2, "0");
  S.timerId = setInterval(() => {
    S.examTimeLeft--;
    $("qTimer").textContent = String(Math.floor(S.examTimeLeft / 60)).padStart(2, "0") + ":" +
      String(S.examTimeLeft % 60).padStart(2, "0");
    if(S.examTimeLeft <= 0){ stopTimer(); finishQuiz(); }
  }, 1000);
}
