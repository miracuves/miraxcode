/** In-browser ZIP builder for Virtual OS export */

let crcTable = null;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipHeader(sig, nameBytes, dataBytes, crc, localOffset, central = false) {
  const len = central ? 46 : 30;
  const out = new Uint8Array(len + nameBytes.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, sig, true);
  if (central) {
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, localOffset, true);
  } else {
    dv.setUint16(4, 20, true);
    dv.setUint16(26, nameBytes.length, true);
  }
  const base = central ? 16 : 14;
  dv.setUint32(base, crc, true);
  dv.setUint32(base + 4, dataBytes.length, true);
  dv.setUint32(base + 8, dataBytes.length, true);
  out.set(nameBytes, len);
  return out;
}

/**
 * @param {{ name: string, data: string }[]} entries
 * @param {(path: string) => string} normalizePath
 */
export function makeZip(entries, normalizePath) {
  const enc = new TextEncoder();
  const files = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = enc.encode(normalizePath(entry.name).replace(/\/?$/, entry.name.endsWith("/") ? "/" : ""));
    const dataBytes = enc.encode(String(entry.data ?? ""));
    const crc = crc32(dataBytes);
    const local = zipHeader(0x04034b50, nameBytes, dataBytes, crc, offset);
    files.push({ local, dataBytes, nameBytes, crc, offset });
    offset += local.length + dataBytes.length;
  }
  const central = [];
  for (const f of files) {
    const c = zipHeader(0x02014b50, f.nameBytes, f.dataBytes, f.crc, f.offset, true);
    central.push(c);
    offset += c.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const centralOffset = files.reduce((n, f) => n + f.local.length + f.dataBytes.length, 0);
  const end = new Uint8Array(22);
  const dv = new DataView(end.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(8, files.length, true);
  dv.setUint16(10, files.length, true);
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, centralOffset, true);
  return new Blob([...files.flatMap(f => [f.local, f.dataBytes]), ...central, end], { type: "application/zip" });
}
