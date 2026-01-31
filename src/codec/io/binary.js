/**
 * Little-endian binary buffer read/write cursor.
 * Read: single forward cursor; write: chunked buffer then merge.
 */

const LE = true;
const CHUNK = 64 * 1024;

/**
 * Create read-only cursor from buffer.
 * @param {ArrayBuffer} buffer
 * @returns Cursor object: pos(), left(), u8(), u32(), i32(), u64(), u64Num(), i64(), f64(), cstr(), consume(n), atEnd()
 */
export function createBinaryReader(buffer) {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  let pos = 0;

  function move(n) {
    pos += n;
  }

  return {
    pos: () => pos,
    left: () => len - pos,
    u8: () => {
      const v = view.getUint8(pos);
      move(1);
      return v;
    },
    u32: () => {
      const v = view.getUint32(pos, LE);
      move(4);
      return v;
    },
    i32: () => {
      const v = view.getInt32(pos, LE);
      move(4);
      return v;
    },
    u64: () => {
      const v = view.getBigUint64(pos, LE);
      move(8);
      return v;
    },
    u64Num: () => {
      const v = view.getBigUint64(pos, LE);
      move(8);
      return Number(v);
    },
    i64: () => {
      const v = view.getBigInt64(pos, LE);
      move(8);
      return v;
    },
    f64: () => {
      const v = view.getFloat64(pos, LE);
      move(8);
      return v;
    },
    cstr: () => {
      const start = pos;
      while (pos < len && view.getUint8(pos) !== 0) pos++;
      const slice = buffer.slice(start, pos);
      pos++;
      return slice.byteLength ? new TextDecoder('ascii').decode(slice) : '';
    },
    consume: (n) => move(n),
    atEnd: () => pos >= len,
  };
}

/**
 * Create chunked writer; call build() to get ArrayBuffer.
 */
export function createBinaryWriter() {
  const chunks = [];
  let buf = new ArrayBuffer(CHUNK);
  let dv = new DataView(buf);
  let at = 0;

  function need(byteCount) {
    if (at + byteCount > CHUNK) {
      chunks.push(buf.slice(0, at));
      buf = new ArrayBuffer(CHUNK);
      dv = new DataView(buf);
      at = 0;
    }
  }

  return {
    u8: (v) => {
      need(1);
      dv.setUint8(at, v);
      at++;
    },
    u32: (v) => {
      need(4);
      dv.setUint32(at, v, LE);
      at += 4;
    },
    i32: (v) => {
      need(4);
      dv.setInt32(at, v, LE);
      at += 4;
    },
    u64: (v) => {
      need(8);
      dv.setBigUint64(at, typeof v === 'bigint' ? v : BigInt(v), LE);
      at += 8;
    },
    i64: (v) => {
      need(8);
      dv.setBigInt64(at, BigInt(v), LE);
      at += 8;
    },
    f64: (v) => {
      need(8);
      dv.setFloat64(at, v, LE);
      at += 8;
    },
    cstr: (s) => {
      const bytes = new TextEncoder().encode(s);
      for (let i = 0; i < bytes.length; i++) {
        need(1);
        dv.setUint8(at, bytes[i]);
        at++;
      }
      need(1);
      dv.setUint8(at, 0);
      at++;
    },
    build: () => {
      if (at > 0) chunks.push(buf.slice(0, at));
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      const out = new ArrayBuffer(total);
      const u8 = new Uint8Array(out);
      let off = 0;
      for (const c of chunks) {
        u8.set(new Uint8Array(c), off);
        off += c.byteLength;
      }
      return out;
    },
  };
}
