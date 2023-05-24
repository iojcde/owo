import { readStr } from "./utils";

export class Memory {
  buffer: ArrayBuffer;
  u8: Uint8Array;
  u32: Uint32Array;

  constructor(private memory: WebAssembly.Memory) {
    this.buffer = this.memory.buffer;
    this.u8 = new Uint8Array(this.buffer);
    this.u32 = new Uint32Array(this.buffer);
  }

  check() {
    if (this.buffer.byteLength === 0) {
      this.buffer = this.memory.buffer;
      this.u8 = new Uint8Array(this.buffer);
      this.u32 = new Uint32Array(this.buffer);
    }
  }

  read8(o: number) {
    return this.u8[o];
  }
  read32(o: number) {
    return this.u32[o >> 2];
  }
  write8(o: number, v: number) {
    this.u8[o] = v;
  }
  write32(o: number, v: number) {
    this.u32[o >> 2] = v;
  }
  write64(o: number, vlo: number, vhi = 0) {
    this.write32(o, vlo);
    this.write32(o + 4, vhi);
  }

  readStr(o: number, len: number) {
    return readStr(this.u8, o, len);
  }

  // Null-terminated string.
  writeStr(o: number, str: string) {
    o += this.write(o, str);
    this.write8(o, 0);
    return str.length + 1;
  }

  write(o: number, buf: ArrayBuffer | string | Uint8Array): number {
    if (buf instanceof ArrayBuffer) {
      return this.write(o, new Uint8Array(buf));
    } else if (typeof buf === "string") {
      return this.write(
        o,
        new Uint8Array(buf.split("").map((c) => c.charCodeAt(0)))
      );
    } else {
      const dst = new Uint8Array(this.buffer, o, buf.length);
      dst.set(buf);
      return buf.length;
    }
  }
}