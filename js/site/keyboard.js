/* ═══════════ KEYBOARD KISAYOLLARI ═══════════ */
document.addEventListener("keydown", e => {
  if($("countModal").classList.contains("show")){
    if(e.key === "Escape") closeCountModal();
    if(e.key === "Enter"){ e.preventDefault(); confirmStartQuiz(); }
    return;
  }
  if($("examModal").classList.contains("show")){
    if(e.key === "Escape") closeExamModal();
    return;
  }
  if(!$("lessonQuiz").classList.contains("hidden")){
    const key = e.key.toLowerCase();
    if(key === "f" && !e.target.matches("input, textarea")){ e.preventDefault(); toggleLessonFav(); return; }
    if(e.key === "Enter" && LP.qAnswered){ e.preventDefault(); nextLessonQuestion(); return; }
    if(!LP.qAnswered){
      let idx = -1;
      if(["1","2","3","4","5"].includes(key)) idx = parseInt(key) - 1;
      else if(["a","b","c","d","e"].includes(key)) idx = "abcde".indexOf(key);
      if(idx >= 0){
        e.preventDefault();
        const b = document.querySelectorAll("#lqOptions .option")[idx];
        if(b && !b.classList.contains("disabled")) b.click();
      }
    }
    return;
  }
  if(!$("lessonCardView").classList.contains("hidden")){
    if(e.key === "Enter"){ e.preventDefault(); nextLessonCard(); }
    return;
  }
  if($("quiz").classList.contains("hidden")) return;
  const key = e.key.toLowerCase();
  if(key === "f" && !e.target.matches("input, textarea")){ e.preventDefault(); toggleFavorite(); return; }
  if(e.key === "Enter" && S.answered){ e.preventDefault(); nextQuestion(); return; }
  if(!S.answered){
    let idx = -1;
    if(["1","2","3","4","5"].includes(key)) idx = parseInt(key) - 1;
    else if(["a","b","c","d","e"].includes(key)) idx = "abcde".indexOf(key);
    if(idx >= 0){
      e.preventDefault();
      const b = document.querySelectorAll("#optionsList .option")[idx];
      if(b && !b.classList.contains("disabled")) b.click();
    }
  }
});
