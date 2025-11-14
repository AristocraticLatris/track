const STORAGE_KEY='track-timetable';

function saveTimetable(tt){ localStorage.setItem(STORAGE_KEY,JSON.stringify(tt)); }

function loadTimetable(){
  const data=localStorage.getItem(STORAGE_KEY);
  return data?JSON.parse(data):{ monday:[], tuesday:[], wednesday:[], thursday:[], friday:[], saturday:[], sunday:[] };
}
