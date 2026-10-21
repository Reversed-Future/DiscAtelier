'use strict';
// App-defined JSON-lines protocol over private process pipes. No HTTP listener.
const { createInterface } = require('node:readline');
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
// Upstream diagnostics must never enter the protocol or persist cookies.
for (const name of ['log', 'info', 'warn', 'error', 'debug']) console[name] = () => {};
let api;
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let active = false;
input.on('close', () => process.exit(0));
input.on('line', async line => {
  let id = '';
  try {
    if (line.length > 8192 || active) throw new Error('protocol');
    const request = JSON.parse(line);
    id = request.id;
    if (typeof id !== 'string' || id.length > 100 || !id) throw new Error('protocol');
    const args = request.arguments;
    if (request.operation === 'search') {
      if (!args || typeof args.query !== 'string' || !args.query.trim() || Buffer.byteLength(args.query) > 500) throw new Error('arguments');
      if (args.offset !== undefined && (!Number.isInteger(args.offset) || args.offset < 0 || args.offset > 4294967295)) throw new Error('offset');
    } else if (request.operation === 'album' || request.operation === 'songUrl' || request.operation === 'songDetail') {
      if (!args || !Number.isSafeInteger(args.id) || args.id <= 0) throw new Error('arguments');
    } else throw new Error('operation');
    active = true;
    try { api ||= require('@neteasecloudmusicapienhanced/api'); }
    catch { throw Object.assign(new Error('Component load failed'), { code: 'NETEASE_COMPONENT_LOAD' }); }
    const response = request.operation === 'search'
      ? await api.search({ keywords: args.query, type: 10, limit: 20, offset: args.offset ?? 0 })
      : request.operation === 'album' ? await api.album({ id: args.id })
      : request.operation === 'songDetail' ? await api.song_detail({ ids: String(args.id) })
      : await require('./playback.cjs')(api, args.id);
    // Never forward upstream cookies, headers or errors containing request config.
    const reply = JSON.stringify({ id, body: response.body });
    if (Buffer.byteLength(reply) > 2 * 1024 * 1024) throw new Error('size');
    process.stdout.write(reply + '\n');
  } catch (error) {
    const message = error?.code === 'NETEASE_PLAYBACK_INIT'
      ? '网易云播放初始化失败，请检查网络后重试。'
      : error?.code === 'NETEASE_PLAYBACK_REQUEST'
        ? `网易云播放请求失败${Number.isInteger(error.status) ? `（HTTP ${error.status}）` : ''}，请稍后重试。`
        : '内置网易云查询失败，请稍后重试。';
    // Internal protocol codes let Rust display a safe, specific failure.
    const errorCode = ['NETEASE_PLAYBACK_INIT', 'NETEASE_PLAYBACK_REQUEST', 'NETEASE_COMPONENT_LOAD'].includes(error?.code) ? error.code : 'NETEASE_QUERY';
    const errorReason = ['key_response', 'key_signature', 'key_missing', 'cache_write', 'timeout', 'key_request'].includes(error?.reason) ? error.reason : undefined;
    const errorStatus = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined;
    send({ id, error: message, errorCode, errorReason, errorStatus });
  } finally { active = false; }
});
