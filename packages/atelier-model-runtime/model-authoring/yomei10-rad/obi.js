import {dimensions as d} from './dimensions.js';
import {addObiPaper} from './obi-paper.js';

// Same narrow three-panel obi dimensions as Human Bloom; both sides photographed.
export const obiSize={front:d.obiFront,back:d.obiBack,spine:d.obiSpine,height:d.obiHeight,paper:.012};
export const obiStored=[-d.caseWidth/2-.025,0,d.caseDepth/2];
export const obiTaken=[-12,-15,1.2];
export function addObi(parent,p){
 const obi=p.group('obi',parent);obi.position.fromArray(obiStored);obi.rotation.y=Math.PI/2;
 const paper=p.white.clone();paper.color.set('#f4f1e9');paper.roughness=.86;paper.envMapIntensity=.3;
 const spine=p.group('obi-spine',obi);const front=p.group('obi-front',obi,false),back=p.group('obi-back',obi,false);
 front.position.x=-obiSize.spine/2;front.rotation.y=Math.PI/2;
 back.position.x=obiSize.spine/2;back.rotation.y=-Math.PI/2;
 addObiPaper(p,spine,'obi-spine-paper',obiSize.spine,obiSize.height,obiSize.paper,'obi-spine-inner','obi-spine',paper,{left:true,right:true});
 addObiPaper(p,front,'obi-front-paper',obiSize.front,obiSize.height,obiSize.paper,'obi-front-inner','obi-front',paper,{x:-obiSize.front/2,right:true});
 addObiPaper(p,back,'obi-back-paper',obiSize.back,obiSize.height,obiSize.paper,'obi-back-inner','obi-back',paper,{x:obiSize.back/2,left:true});
 return obi;
}
