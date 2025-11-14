let timetable=loadTimetable();

function addSession(day, session){
  session.id=generateId();
  session.reminderTriggered=false;
  session.color=session.color||getRandomColor();
  timetable[day].push(session);
  saveTimetable(timetable);
  renderTimetable();
}

function editSession(day,id){
  const s=timetable[day].find(sess=>sess.id===id);
  if(!s) return;
  const title=prompt("Edit title:",s.title);
  const start=prompt("Edit start time:",s.start);
  const end=prompt("Edit end time:",s.end);
  const reminder=prompt("Edit reminder (minutes):",s.reminder||0);
  const color=prompt("Edit color:",s.color);
  if(title && start && end){
    s.title=title; s.start=start; s.end=end;
    s.reminder=reminder?parseInt(reminder):0;
    s.color=color||s.color||getRandomColor();
    s.reminderTriggered=false;
    saveTimetable(timetable);
    renderTimetable();
  }
}

function deleteSession(day,id){
  timetable[day]=timetable[day].filter(s=>s.id!==id);
  saveTimetable(timetable);
  renderTimetable();
}
