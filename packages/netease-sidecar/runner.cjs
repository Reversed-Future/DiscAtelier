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
    } else if (request.operation === 'album') {
      if (!args || !Number.isSafeInteger(args.id) || args.id <= 0) throw new Error('arguments');
    } else throw new Error('operation');
    active = true;
    api ||= require('@neteasecloudmusicapienhanced/api');
    const response = request.operation === 'search'
      ? await api.search({ keywords: args.query, type: 10, limit: 20, offset: 0 })
      : await api.album({ id: args.id });
    // Never forward upstream cookies, headers or errors containing request config.
    const reply = JSON.stringify({ id, body: response.body });
    if (Buffer.byteLength(reply) > 2 * 1024 * 1024) throw new Error('size');
    process.stdout.write(reply + '\n');
  } catch {
    send({ id, error: '内置网易云查询失败，请稍后重试。' });
  } finally { active = false; }
});
