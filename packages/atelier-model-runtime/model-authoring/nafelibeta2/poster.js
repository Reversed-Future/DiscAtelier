import {THREE,rounded,sheet} from './surfaces.js';

// The lower-left printed panel remains on the outside of the folded packet.
// Upper rows accordion behind it; the right column then folds behind the left.
export function addPoster(bag,p){
 const poster=p.group('poster',bag);poster.position.set(0,-.45,-.02);
 const columns=[],rows=[],pw=12.2,ph=11.7;
 for(let c=0;c<2;c++){
  const column=p.group('poster-column-'+c,poster,false);
  column.position.set(c*pw/2,0,-c*.09);column.rotation.y=c*Math.PI;
  column.userData.foldHeight=-c*.09;columns.push(column);
  const center=p.group('poster-column-center-'+c,column,false);center.position.x=c*pw/2;
  let parent=center;
  for(const r of [2,1,0]){
   const pivot=p.group(`poster-row-${r}-${c}`,parent,false);
   const foldedAngle=r===1?-Math.PI:r===0?Math.PI:0;
   if(r!==2){pivot.position.set(0,ph/2,r===1?-.025:.015);pivot.rotation.x=foldedAngle;pivot.userData.foldHeight=pivot.position.z;rows.push({node:pivot,row:r,foldedAngle});}
   const panel=p.group(`poster-panel-${r}-${c}`,pivot,false);panel.position.y=r===2?0:ph/2;
   sheet(p,panel,`poster-sheet-${r}-${c}`,rounded(pw,ph,.002,-ph/2),p.photo(`poster-${r}-${c}`),p.white,.009);
   parent=panel;
  }
 }
 return {poster,columns,rows};
}

export async function foldPoster(parts,motion,opening){
 const row=n=>parts.rows.filter(r=>r.row===n).map(r=>[r.node,'x',opening?0:r.foldedAngle]);
 if(opening){
  await motion.angles([[parts.columns[1],'y',0]]);
  await motion.angles(row(1));await motion.angles(row(0));
 }else{
  await motion.angles(row(0));await motion.angles(row(1));
  await motion.angles([[parts.columns[1],'y',Math.PI]]);
 }
}
