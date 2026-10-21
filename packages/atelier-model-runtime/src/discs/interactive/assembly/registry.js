// Local trusted runtime, never a module path or script supplied by a model file.
export const assemblyLoaders=Object.freeze({
 'research-bai':()=>import('../../../../model-authoring/research-bai/assembly.js'),
 'nafelibeta2':()=>import('../../../../model-authoring/nafelibeta2/assembly.js'),
 'ups-and-downs-firdhaus':()=>import('../../../../model-authoring/ups-and-downs-firdhaus/assembly.js'),
 'yomei10-rad':()=>import('../../../../model-authoring/yomei10-rad/assembly.js'),
 'thunder-radio-luoyan':()=>import('../../../../model-authoring/thunder-radio-luoyan/assembly.js'),
 'qingluo-decoy':()=>import('../../../../model-authoring/qingluo-decoy/assembly.js')
});
