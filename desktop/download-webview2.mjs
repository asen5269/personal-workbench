import { createWriteStream } from 'node:fs';
import { mkdir, stat, rename, writeFile, readFile, appendFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../artifacts');
await mkdir(`${root}/webview2-chunks`, { recursive: true });
let response;
for (let attempt = 0; attempt < 5; attempt++) {
  try {
    response = await fetch('https://go.microsoft.com/fwlink/?linkid=2124701', { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    break;
  } catch (error) { if (attempt === 4) throw error; }
}
if (!response.ok || !new URL(response.url).hostname.endsWith('.dl.delivery.mp.microsoft.com')) throw new Error('Invalid Microsoft download');
const length = Number(response.headers.get('content-length'));
if (!length) throw new Error('Missing download length');
const size = 1048576;
const count = Math.ceil(length / size);
const downloadUrl = new URL(response.url);
// The wrapper requires a valid Microsoft Authenticode signature before use.
downloadUrl.protocol = 'http:';
let next = 0;
await Promise.all(Array.from({ length: 64 }, async () => {
 while (next < count) {
  const i = next++;
  const start = i * size, end = Math.min(length - 1, start + size - 1);
  const path = `${root}/webview2-chunks/${i}.bin`;
  if ((await stat(path).catch(() => null))?.size === end - start + 1) continue;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const part = await fetch(downloadUrl, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(180000) });
      if (part.status !== 206 || part.headers.get('content-range') !== `bytes ${start}-${end}/${length}`) throw new Error('Invalid download range');
      await pipeline(part.body, createWriteStream(`${path}.tmp`));
      if ((await stat(`${path}.tmp`)).size !== end - start + 1) throw new Error('Incomplete download');
      await rename(`${path}.tmp`, path);
      console.log(`Downloaded ${i + 1}/${count}`);
      break;
    } catch (error) { if (attempt === 4) throw error; }
  }
 }
}));
const output = `${root}/WebView2Offline-x64.exe`;
await writeFile(output, '');
for (let i = 0; i < count; i++) await appendFile(output, await readFile(`${root}/webview2-chunks/${i}.bin`));
console.log(`Downloaded ${length} bytes; verify Microsoft signature before packaging`);
