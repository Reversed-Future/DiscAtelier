import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/netease-sidecar/public-key.cjs', import.meta.url),'utf8');
const require = createRequire(new URL('../packages/netease-sidecar/runner.cjs', import.meta.url));
const crypto = require('@neteasecloudmusicapienhanced/api/util/crypto');
const publicKey = generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
function harness({ key = {publicKey,version:'test-version',nextUpdateTime:1}, signature = 'valid' } = {}) {
  const module = { exports:{} }, events=[];
  runInNewContext(source, {module,Buffer,URLSearchParams, require(name) {
    if(name === 'axios') return {default:async request=>{
      events.push('request'); assert.equal(request.timeout,15000);
      const params=new URLSearchParams(request.data);
      assert.equal(params.get('currentKeyVersion'),'');
      assert.equal(params.get('deviceId'),'test-device');
      return {data:{code:200,data:{encryptedData:'fixture',signature,timestamp:'1'}}};
    }};
    if(name === '@neteasecloudmusicapienhanced/api/util/config.json') return {APP_CONF:{apiDomain:'https://example.invalid'}};
    if(name === '@neteasecloudmusicapienhanced/api/util/crypto') return {
      xeapiSign:()=> 'valid', xeapiDecryptPublicKey:()=>{events.push('decrypt'); return key;},
    };
    throw new Error('Unexpected dependency');
  }});
  return {read:()=>module.exports('test-device'),events};
}
test('verified publicKey response without sk is accepted by adapter and installed encryption', async()=>{
  const key=await harness().read();
  assert.equal(key.sk,undefined);
  assert.equal(key.publicKey,publicKey);
  const request=crypto.xeapi('/api/song/enhance/player/url/v1', {ids:'[42]',level:'standard'}, {publicKeyState:key,os:'android'});
  assert.ok(request.C && request.S && request.R);
});
test('signature validation happens before decoding; malformed keys are never accepted',async()=>{
  const h=harness({signature:'invalid'});
  await assert.rejects(h.read(), /signature mismatch/);
  assert.deepEqual(h.events,['request']);
  for(const key of [{sk:'not-a-public-key',version:'1'}, {publicKey:'bad',version:'1'}, {publicKey,version:''}, {publicKey,version:'1',sk:42}]) {
    await assert.rejects(harness({key}).read(), /invalid key/);
  }
});
