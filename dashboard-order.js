function placeInsights(){
  const projection=document.querySelector('.projection-band');
  const insights=document.querySelector('.finance-insights');
  if(!projection||!insights)return false;
  if(projection.nextElementSibling!==insights){
    projection.insertAdjacentElement('afterend',insights);
  }
  return true;
}

let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(placeInsights()||tries>=20)clearInterval(timer);
},250);

setTimeout(placeInsights,1200);
setTimeout(placeInsights,2500);
