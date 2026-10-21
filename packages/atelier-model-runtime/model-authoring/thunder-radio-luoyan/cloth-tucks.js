import {clothHeight} from './cloth-shape.js';

// Small returned folds at the corners are separate surfaces over the same sheet.
// Their curled cross-section doubles back, leaving a real overlap and air gap.
export function addCornerTucks(p,silk,material,patch){
 const tucks=[[-4.95,-6.55,.45,.89,1.6,.94],[-4.9,6.6,-.55,.84,1.5,.78],
  [4.95,6.55,.65,.76,1.7,.87],[4.9,-6.55,-.38,.92,1.45,.72],
  [-4.85,-5.85,.2,.98,.9,.62]];
 for(const [i,[cx,cy,dx,dy,length,width]]of tucks.entries()){
  patch(p,silk,'silk-tuck-'+i,material,(u,v)=>{
   const taper=Math.pow(Math.sin(Math.PI*u),.7),along=(u-.5)*length;
   const cross=width*taper*(v-.5+.25*Math.sin(2*Math.PI*v));
   const x=cx+dx*along-dy*cross,y=cy+dy*along+dx*cross;
   const base=clothHeight(x,y),lift=.01+(2.77-base-.01)*.85*taper*Math.sin(Math.PI*v);
   return[x,y,base+lift];
  },(u,v)=>[u*.2,v*.08],72,36);
 }
}
