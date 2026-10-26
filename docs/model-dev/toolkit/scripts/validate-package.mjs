// Structural preflight only; does not open or modify a collection database.
import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {parseModel, modelFileLimit} from '../runtime/index.js';

if (process.argv.length !== 3) throw Error('Usage: node validate-package.mjs <file.ateliermodel>');
const file = resolve(process.argv[2]);
if ((await stat(file)).size > modelFileLimit) throw Error('Package exceeds 50 MiB');
const bytes = await readFile(file);
const model = parseModel(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
console.log(JSON.stringify({file, version: model.version, id: model.id, title: model.title,
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  structureValidated: true, imagesDecoded: false, nativeImportVerified: false}, null, 2));
