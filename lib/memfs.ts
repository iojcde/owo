import { assert, getImportObject } from "./utils";
import { AbortError } from "./error";
import { Memory } from "./memory";

export interface MemFSOptions {
  compileStreaming: (filename: string | URL) => Promise<WebAssembly.Module>;
  hostWrite: (str: string) => void;
  hostRead: () => void;
  stdinStr?: string;
  sharedMem: WebAssembly.Memory;
  memfsFilename: URL | string;
}

const ESUCCESS = 0;

export class MemFS {
  hostWrite: (str: string) => void;
  hostRead: () => void;
  stdinStr: string;
  stdinStrPos: number;
  sharedMem: WebAssembly.Memory;
  memfsFilename: string | URL;

  hostMem_: Memory | null;

  ready: Promise<void>;

  instance?: WebAssembly.Instance;
  exports?: any;
  mem?: Memory;

  onHostWriteCb?: (str: string) => void;
  shouldWriteStdout = true;

  constructor(options: MemFSOptions) {
    const compileStreaming = options.compileStreaming;
    this.hostWrite = options.hostWrite;
    this.hostRead = options.hostRead;
    this.stdinStr = options.stdinStr || "";
    this.stdinStrPos = 0;
    this.sharedMem = options.sharedMem;
    this.memfsFilename = options.memfsFilename;

    this.hostMem_ = null; // Set later when wired up to application.

    // Imports for memfs module.
    const env = getImportObject(this, [
      "abort",
      "host_write",
      "host_read",
      "memfs_log",
      "copy_in",
      "copy_out",
    ]);

    this.ready = compileStreaming(this.memfsFilename)
      .then((module) => WebAssembly.instantiate(module, { env }))
      .then((instance) => {
        this.instance = instance;
        this.exports = instance.exports;
        this.mem = new Memory(this.exports.memory);
        this.exports.init();
      });
  }

  onHostWrite(cb: (str: string) => void) {
    this.onHostWriteCb = cb;

    return () => {
      this.onHostWriteCb = undefined;
    };
  }

  set hostMem(mem: Memory) {
    this.hostMem_ = mem;
  }

  setStdinStr(str: string) {
    this.stdinStr = str;
    this.stdinStrPos = 0;
  }

  addDirectory(path: string) {
    assert(this.mem !== undefined);
    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    this.exports.AddDirectoryNode(path.length);
  }

  addFile(path: string, contents: ArrayBuffer | string) {
    assert(this.mem !== undefined);

    const length =
      contents instanceof ArrayBuffer ? contents.byteLength : contents.length;
    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    const inode = this.exports.AddFileNode(path.length, length);
    const addr = this.exports.GetFileNodeAddress(inode);
    this.mem.check();
    this.mem.write(addr, contents);
  }

  checkFileExists(path: string) {
    assert(this.mem !== undefined);

    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    const inode = this.exports.FindNode(path.length);
    return inode !== 0;
  }

  getFileContents(path: string) {
    assert(this.mem !== undefined);

    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    const inode = this.exports.FindNode(path.length);
    const addr = this.exports.GetFileNodeAddress(inode);
    const size = this.exports.GetFileNodeSize(inode);
    return new Uint8Array(this.mem.buffer, addr, size);
  }

  abort() {
    throw new AbortError();
  }

  host_write(fd: number, iovs: number, iovs_len: number, nwritten_out: number) {
    assert(this.hostMem_ !== null);

    this.hostMem_.check();
    assert(fd <= 2);
    let size = 0;
    let str = "";
    for (let i = 0; i < iovs_len; ++i) {
      const buf = this.hostMem_.read32(iovs);
      iovs += 4;
      const len = this.hostMem_.read32(iovs);
      iovs += 4;
      str += this.hostMem_.readStr(buf, len);
      size += len;
    }
    this.hostMem_.write32(nwritten_out, size);

    if (this.shouldWriteStdout) this.hostWrite(str);
    this.onHostWriteCb?.(str);

    return ESUCCESS;
  }

  async host_read(fd: number, iovs: number, iovs_len: number, nread: number) {
    assert(this.hostMem_ !== null);

    this.hostRead();
    Atomics.wait(new Int32Array(this.sharedMem.buffer), 0, 0);
    // read from shared memory
    const sharedMem = new Uint8Array(this.sharedMem.buffer);
    let str = "";
    for (let i = 0; ; i++) {
      if (sharedMem[i] === 0) {
        break;
      }

      str += String.fromCharCode(sharedMem[i]);
    }

    let strPos = 0;

    // clean shared memory
    for (let i = 0; i < sharedMem.length; i++) {
      sharedMem[i] = 0;
    }

    this.hostMem_.check();
    assert(fd === 0);
    let size = 0;
    for (let i = 0; i < iovs_len; ++i) {
      const buf = this.hostMem_.read32(iovs);
      iovs += 4;
      const len = this.hostMem_.read32(iovs);
      iovs += 4;
      const lenToWrite = Math.min(
        len,
        // this.stdinStr.length - this.stdinStrPos
        str.length - strPos
      );
      if (lenToWrite === 0) {
        break;
      }
      this.hostMem_.write(buf, str.substr(strPos, lenToWrite));
      size += lenToWrite;
      strPos += lenToWrite;
      if (lenToWrite !== len) {
        break;
      }
    }
    // For logging
    // this.hostWrite("Read "+ size + "bytes, pos: "+ this.stdinStrPos + "\n");
    this.hostMem_.write32(nread, size);

    return ESUCCESS;
  }

  memfs_log(buf: number, len: number) {
    assert(this.mem !== undefined);

    this.mem.check();
    console.log(this.mem.readStr(buf, len));
  }

  copy_out(clang_dst: number, memfs_src: number, size: number) {
    assert(this.hostMem_ !== null);
    assert(this.mem !== undefined);

    this.hostMem_.check();
    const dst = new Uint8Array(this.hostMem_.buffer, clang_dst, size);
    this.mem.check();
    const src = new Uint8Array(this.mem.buffer, memfs_src, size);
    dst.set(src);
  }

  copy_in(memfs_dst: number, clang_src: number, size: number) {
    assert(this.hostMem_ !== null);
    assert(this.mem !== undefined);

    this.mem.check();
    const dst = new Uint8Array(this.mem.buffer, memfs_dst, size);
    this.hostMem_.check();
    const src = new Uint8Array(this.hostMem_.buffer, clang_src, size);
    dst.set(src);
  }
}