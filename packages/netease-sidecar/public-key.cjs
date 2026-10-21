'use strict';
const { default: axios } = require('axios');
const encrypt = require('@neteasecloudmusicapienhanced/api/util/crypto');
const { APP_CONF } = require('@neteasecloudmusicapienhanced/api/util/config.json');

// Adapt register_xeapikey from pinned api-enhanced 4.41.1. The response observed
// on 2026-10-21 contains publicKey, version and nextUpdateTime, without sk.
// Its own xeapiEncryptS already supports absent sk; never rename publicKey to sk.
module.exports = async function getPublicKey(deviceId = '') {
  const nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  const timestamp = String(Date.now());
  const data = {
    appVersion: '9.5.61', currentKeyVersion: '', deviceId, nonce, os: 'android',
    requestType: 'active', signature: encrypt.xeapiSign(timestamp, nonce),
    t1: '', t2: '', timestamp, uid: '',
  };
  const res = await axios({
    method: 'POST', url: APP_CONF.apiDomain + '/api/bsr/sk/get',
    headers: {
      'User-Agent': 'NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)',
      Cookie: deviceId ? `deviceId=${encodeURIComponent(deviceId)}` : '',
    },
    data: new URLSearchParams(data).toString(), proxy: false, timeout: 15000,
  });
  const body = res.data;
  if (body?.code !== 200 || !body.data?.encryptedData) throw new Error('xeapi public key request failed');
  if (!body.data.signature || encrypt.xeapiSign(body.data.timestamp, nonce) !== body.data.signature) {
    throw new Error('xeapi public key response signature mismatch');
  }
  const key = encrypt.xeapiDecryptPublicKey(body.data.encryptedData);
  if (!key || typeof key.publicKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key.publicKey)
      || Buffer.from(key.publicKey, 'base64').length !== 32 || typeof key.version !== 'string' || !key.version
      || (key.sk !== undefined && typeof key.sk !== 'string')) {
    throw new Error('xeapi public key response invalid key');
  }
  return { ...key, deviceId };
};
