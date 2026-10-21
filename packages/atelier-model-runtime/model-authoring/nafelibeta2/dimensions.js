// cm. Case dimensions reused from 人间开花 at the owner's request.
export const d=Object.freeze({caseWidth:14.1,caseHeight:12.5,caseDepth:1,hingeWidth:1,plastic:.15,bookWidth:11.8,bookHeight:12.2,bagWidth:15,bagHeight:14.5,bandWidth:.7});
export const inserts=Object.freeze({5:['5.5'],9:['9.5'],13:['13.3','13.6'],17:['17.5'],21:['21.5']});
export const leaves=[];
for(let front=0;front<=26;front+=2){
 leaves.push({front:front===0?'cover':`page-${front}`,back:front===26?'cover-back':`page-${front+1}`,thickness:front===0||front===26?.028:.012});
 for(const id of inserts[front+1]??[])leaves.push({transparent:true,id,thickness:.018});
}
export const bookDepth=leaves.reduce((s,l)=>s+l.thickness,0);
