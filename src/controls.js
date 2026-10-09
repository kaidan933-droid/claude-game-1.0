/* Keyboard state: W/Up throttle, S/Down brake, A/Left and D/Right steer, R reset */
const down=new Set();
const MAP={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyR:'reset'};
window.addEventListener('keydown',e=>{
  if(!MAP[e.code]||e.ctrlKey||e.metaKey||e.altKey)return;
  e.preventDefault();down.add(MAP[e.code]);
});
window.addEventListener('keyup',e=>{if(MAP[e.code])down.delete(MAP[e.code]);});
window.addEventListener('blur',()=>down.clear());

export const controls={
  get throttle(){return down.has('throttle')?1:0;},
  get brake(){return down.has('brake')?1:0;},
  get left(){return down.has('left')?1:0;},
  get right(){return down.has('right')?1:0;},
  takeReset(){const r=down.has('reset');down.delete('reset');return r;}
};
