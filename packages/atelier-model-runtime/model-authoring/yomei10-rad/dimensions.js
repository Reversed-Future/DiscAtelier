// Centimetres. Measured dimensions supplied by the owner; estimates explicitly
// permitted for paper thickness, unmeasured heights and assembly clearance.
export const dimensions=Object.freeze({
 caseWidth:14.1,caseHeight:12.5,caseDepth:1,hingeWidth:1,plastic:.15,
 bookWidth:12.1,bookHeight:12,leaves:12,paper:.0095,coverPaper:.022,
 backingWidth:13.8,backingHeight:12.1,backingSpine:.6,backingPaper:.015,
 obiFront:1.8,obiSpine:1.05,obiBack:3,obiHeight:12,clearance:.025
});
export const thickness=i=>i===0||i===dimensions.leaves-1?dimensions.coverPaper:dimensions.paper;
export const bookDepth=Array.from({length:dimensions.leaves},(_,i)=>thickness(i)).reduce((a,b)=>a+b,0);
export function leafHeight(i,turned=false){
 const below=Array.from({length:turned?i:dimensions.leaves-1-i},(_,j)=>thickness(turned?j:i+1+j)).reduce((a,b)=>a+b,0);
 return below+thickness(i)/2;
}
