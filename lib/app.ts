import { assert, getImportObject, getInstance } from "./utils";
import { NotImplemented, ProcExit } from "./error";
import { MemFS } from "./memfs";
import { Memory } from "./memory";

const RAF_PROC_EXIT_CODE = 0xc0c0a;
const ESUCCESS = 0;

export class App {
  argv: string[];
  environ: { USER: string };
  memfs: MemFS;
  allowRequestAnimationFrame: boolean;
  handles: Map<any, any>;
  nextHandle: number;
  ready: Promise<void>;
  instance?: WebAssembly.Instance;
  exports?: Record<string, any>;
  mem?: Memory;
  _shouldWriteStdout: boolean = true;

  constructor(
    module: WebAssembly.Module,
    memfs: MemFS,
    name: string,
    ...args: string[]
  ) {
    this.argv = [name, ...args];
    this.environ = { USER: "alice" };
    this.memfs = memfs;
    this.allowRequestAnimationFrame = true;
    this.handles = new Map();
    this.nextHandle = 0;

    const wasi_unstable = getImportObject(this, [
      "proc_exit",
      "environ_sizes_get",
      "environ_get",
      "args_sizes_get",
      "args_get",
      "random_get",
      "clock_time_get",
      "poll_oneoff",
    ]);

    // Fill in some WASI implementations from memfs.
    Object.assign(wasi_unstable, this.memfs.exports);

    this.ready = getInstance(module, { wasi_unstable }).then((instance) => {
      this.instance = instance;
      this.exports = this.instance.exports;
      this.mem = new Memory(this.exports.memory);
      this.memfs.hostMem = this.mem;
    });
  }

  set shouldWriteStdout(value: boolean) {
    this.memfs.shouldWriteStdout = value;
    this._shouldWriteStdout = value;
  }

  get shouldWriteStdout() {
    return this._shouldWriteStdout;
  }

  async run() {
    await this.ready;

    try {
      this.exports?._start();
    } catch (exn) {
      // console.error("Caught exception in _start.");
      // console.error(exn);

      let code = 1;
      let errorMessage = "";

      if (exn instanceof ProcExit) {
        if (exn.code == 0 || exn.stack?.includes("runAnalysis")) {
          return false;
        }

        console.error("Process exited.", exn.code);
        if (exn.code === RAF_PROC_EXIT_CODE) {
          console.log("Allowing rAF after exit.");
          return true;
        }

        // Don't allow rAF unless you return the right code.
        console.log(`Disallowing rAF since exit code is ${exn.code}.`);
        this.allowRequestAnimationFrame = false;
      
      }

      if (exn instanceof Error) {
        errorMessage = exn.message; 
      }

      let msg = `\x1b[91mExit code: ${code} (${errorMessage})`;
      msg += "\x1b[0m\r\n";

      if (this.shouldWriteStdout) this.memfs.hostWrite(msg);

      // Propagate error.
      throw exn;
    }
  }

  proc_exit(code: number) {
    throw new ProcExit(code);
  }

  environ_sizes_get(environ_count_out: number, environ_buf_size_out: number) {
    assert(this.mem !== undefined);

    this.mem.check();
    let size = 0;
    const names = Object.getOwnPropertyNames(this.environ);
    for (const name of names) {
      const value = this.environ[name as keyof typeof this.environ];
      // +2 to account for = and \0 in "name=value\0".
      size += name.length + value.length + 2;
    }
    this.mem.write64(environ_count_out, names.length);
    this.mem.write64(environ_buf_size_out, size);
    return ESUCCESS;
  }

  environ_get(environ_ptrs: number, environ_buf: number) {
    assert(this.mem !== undefined);

    this.mem.check();
    const names = Object.getOwnPropertyNames(this.environ);
    for (const name of names) {
      this.mem.write32(environ_ptrs, environ_buf);
      environ_ptrs += 4;
      environ_buf += this.mem.writeStr(
        environ_buf,
        `${name}=${this.environ[name as keyof typeof this.environ]}`
      );
    }
    this.mem.write32(environ_ptrs, 0);
    return ESUCCESS;
  }

  args_sizes_get(argc_out: number, argv_buf_size_out: number) {
    assert(this.mem !== undefined);

    this.mem.check();
    let size = 0;
    for (let arg of this.argv) {
      size += arg.length + 1; // "arg\0".
    }
    this.mem.write64(argc_out, this.argv.length);
    this.mem.write64(argv_buf_size_out, size);
    return ESUCCESS;
  }

  args_get(argv_ptrs: number, argv_buf: number) {
    assert(this.mem !== undefined);

    this.mem.check();
    for (let arg of this.argv) {
      this.mem.write32(argv_ptrs, argv_buf);
      argv_ptrs += 4;
      argv_buf += this.mem.writeStr(argv_buf, arg);
    }
    this.mem.write32(argv_ptrs, 0);
    return ESUCCESS;
  }

  random_get(buf: number, buf_len: number) {
    assert(this.mem !== undefined);

    const data = new Uint8Array(this.mem.buffer, buf, buf_len);
    for (let i = 0; i < buf_len; ++i) {
      data[i] = (Math.random() * 256) | 0;
    }
  } 

  clock_time_get(clock_id: number, precision: BigInt, time_out: number) {
    const CLOCK_REALTIME = 0;
    // console.log("wow",clock_id)
    // if (clock_id !== CLOCK_REALTIME) {
    //   throw new NotImplemented("wasi_unstable", "clock_time_get");
    // }
    const now = Date.now() * 1e6;
    // get the low 32 bits
    const lowPart = Number(BigInt(now) & 0xffffffffn);
    // get the high 32 bits
    const highPart = Number(BigInt(now) >> 32n);

    this.mem!.write64(time_out, lowPart, highPart);
    return ESUCCESS;
  }


  poll_oneoff(
    in_ptr: number,
    out_ptr: number,
    nsubscriptions: number,
    nevents_out: number
  ) {
    throw new NotImplemented("wasi_unstable", "poll_oneoff");
  }
}