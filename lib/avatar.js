'use strict';
const zlib = require('zlib');
const MAX_DATA_URI = 140000, MAX_EDGE = 1024, MAX_PIXELS = 1024 * 1024;
const dimensions = (width, height) => Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= MAX_EDGE && height <= MAX_EDGE && width * height <= MAX_PIXELS;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
function crc32(bytes) { let n = 0xffffffff; for (const byte of bytes) n = CRC_TABLE[(n ^ byte) & 255] ^ n >>> 8; return (n ^ 0xffffffff) >>> 0; }
function png(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return null;
  let offset = 8, width, height, bits, color, interlace, ended = false, palette = false;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8), end = offset + 12 + size;
    if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return null;
    const data = bytes.subarray(offset + 8, end - 4);
    if (offset === 8 && (type !== 'IHDR' || size !== 13)) return null;
    if (type === 'IHDR') {
      if (width !== undefined || size !== 13) return null;
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bits = data[8]; color = data[9]; interlace = data[12];
      if (!dimensions(width, height) || !({ 0:[1,2,4,8,16], 2:[8,16], 3:[1,2,4,8], 4:[8,16], 6:[8,16] })[color]?.includes(bits) || data[10] || data[11] || interlace > 1) return null;
    } else if (type === 'PLTE') { if (!size || size % 3 || size > 768) return null; palette = true; }
    else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') { if (size || end !== bytes.length) return null; ended = true; break; }
    else if (type === 'acTL') return null; // Static avatars only.
    offset = end;
  }
  if (!ended || !compressed.length || (color === 3 && !palette)) return null;
  const channels = ({ 0:1, 2:3, 3:1, 4:2, 6:4 })[color];
  const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const rows = passes.map(([x,y,dx,dy]) => ({ width: Math.max(0, Math.ceil((width - x) / dx)), height: Math.max(0, Math.ceil((height - y) / dy)) })).filter(p => p.width && p.height);
  const expected = rows.reduce((sum, p) => sum + p.height * (1 + Math.ceil(p.width * bits * channels / 8)), 0);
  let data; try { data = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 }); } catch { return null; }
  if (data.length !== expected) return null;
  offset = 0;
  for (const row of rows) for (let y = 0; y < row.height; y++) { if (data[offset] > 4) return null; offset += 1 + Math.ceil(row.width * bits * channels / 8); }
  return { width, height };
}
function jpeg(bytes) {
  if (bytes.length < 30 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) return null;
  let offset = 2, frame;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0 || marker === 216 || marker === 217 || marker >= 208 && marker <= 215) return null;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) return null;
    if ([192,193,194].includes(marker)) {
      if (frame || length < 8 || bytes[offset + 2] !== 8) return null;
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5), components = bytes[offset + 7];
      if (!dimensions(width, height) || ![1,3,4].includes(components) || length !== 8 + components * 3) return null;
      frame = { width, height };
    }
    if (marker === 218) return frame && offset + length < bytes.length - 2 ? frame : null;
    offset += length;
  }
  return null;
}
function webp(bytes) {
  if (bytes.length < 26 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) !== bytes.length - 8) return null;
  let offset = 12, frame, extended;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), end = offset + 8 + size;
    if (end + (size & 1) > bytes.length) return null;
    const data = bytes.subarray(offset + 8, end);
    if (type === 'VP8X') {
      if (size !== 10 || data[0] & 2) return null;
      extended = { width: 1 + data.readUIntLE(4, 3), height: 1 + data.readUIntLE(7, 3) };
      if (!dimensions(extended.width, extended.height)) return null;
    } else if (type === 'VP8 ') {
      if (frame || size < 10 || data[0] & 1 || !data.subarray(3, 6).equals(Buffer.from([157,1,42]))) return null;
      frame = { width: data.readUInt16LE(6) & 16383, height: data.readUInt16LE(8) & 16383 };
    } else if (type === 'VP8L') {
      if (frame || size < 5 || data[0] !== 47 || data[4] >> 5) return null;
      frame = { width: 1 + (data[1] | (data[2] & 63) << 8), height: 1 + ((data[2] >> 6) | data[3] << 2 | (data[4] & 15) << 10) };
    } else if (type === 'ANIM' || type === 'ANMF') return null;
    offset = end + (size & 1);
  }
  if (offset !== bytes.length || !frame || !dimensions(frame.width, frame.height) || extended && (extended.width !== frame.width || extended.height !== frame.height)) return null;
  return frame;
}
function validateAvatar(value) {
  if (typeof value !== 'string' || value.length > MAX_DATA_URI) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.toString('base64') !== match[2]) return null;
  const size = ({ png, jpeg, webp })[match[1]](bytes);
  return size ? { mime: 'image/' + match[1], bytes, ...size } : null;
}
module.exports = { validateAvatar, dimensions, MAX_DATA_URI };
