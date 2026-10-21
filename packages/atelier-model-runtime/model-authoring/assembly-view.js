// The same distinction as location-shhh: framing an assembly does not isolate it.
// Inspection is explicit and remembers the exact camera to return to.
export function createAssemblyView({root,viewer,motion}){
 const original=new Map();root.traverse(n=>original.set(n,n.visible));let held=null,saved=null;
 function show(objects=[]){
  const keep=new Set();for(const object of objects){object.traverse(n=>keep.add(n));for(let n=object;n;n=n.parent)keep.add(n);}
  for(const [n,visible]of original)n.visible=visible&&(!objects.length||keep.has(n));
 }
 async function exit(){if(!held)return;held=null;show();const view=saved;saved=null;if(view)await motion.cameraTo(view);}
 async function frame(objects){await exit();show();await motion.focus(objects,{preserve:true});}
 async function inspect(object,frames=[object]){if(!held)saved=viewer.snapshot();held=object;show([object]);await motion.focus(frames,{front:true});}
 async function overview(){if(held)return exit();show();await motion.focus([root],{preserve:true});}
 return {show,exit,frame,inspect,overview,get held(){return held;}};
}
