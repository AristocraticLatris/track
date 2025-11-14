function generateId(){ return Date.now(); }

function getRandomColor(){
  const r=Math.floor(Math.random()*127+127), g=Math.floor(Math.random()*127+127), b=Math.floor(Math.random()*127+127);
  return `rgb(${r},${g},${b})`;
}

function getContrastColor(color){
  if(!color) return "#fff";
  const rgb=color.match(/\d+/g).map(Number);
  const [r,g,b]=rgb.map(Number);
  return (r*0.299+g*0.587+b*0.114)>186?"#000":"#fff";
}
