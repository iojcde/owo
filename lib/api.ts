import { SourceType, assert, msToSec } from "./utils";
import { App } from "./app";
import { MemFS } from "./memfs";
import { Tar, TarPairType } from "./tar";
import { ClangParser } from "./clangparser"; 


export interface APIOptions {
  readBuffer: (filename: string | URL) => Promise<ArrayBuffer>;
  compileStreaming: (
    filename: string | URL, 
  ) => Promise<WebAssembly.Module>;
  hostWrite: (str: string) => void;
  hostReadLine: () => void;
  clang: string;
  lld: string;
  sysroot: string;
  showTiming?: boolean;
  sharedMem: WebAssembly.Memory;

  memfs?: URL | string;
}

export interface CompileOptions {
  input: string;
  source: string;
  obj: string;
}

export interface CompileLinkRunOptions {
  source: string;
}

export interface RunAnalysisOptions {
  source: string;
  sourceType: SourceType;
}

export class API {
  moduleCache: { [key: string]: Promise<WebAssembly.Module> };
  readBuffer: (filename: string | URL) => Promise<ArrayBuffer>;
  compileStreaming: (
    filename: string | URL,
  ) => Promise<WebAssembly.Module>;
  hostWrite: (str: string) => void;
  hostRead: () => void;
  clangFilename: string;
  lldFilename: string;
  sysrootFilename: string;
  showTiming: boolean;
  sharedMem: WebAssembly.Memory;

  compileClangCommonArgs: string[];
  diagnosticsClangCommonArgs: string[];

  memfs: MemFS;
  ready: Promise<void>;

  constructor(options: APIOptions) {
    this.moduleCache = {};
    this.readBuffer = options.readBuffer;
    this.compileStreaming = options.compileStreaming;
    this.hostWrite = options.hostWrite;
    this.hostRead = options.hostReadLine;
    this.clangFilename = options.clang;
    this.lldFilename = options.lld;
    this.sysrootFilename = options.sysroot;
    this.showTiming = options.showTiming || false;
    this.sharedMem = options.sharedMem;

    this.compileClangCommonArgs = [
      "-x c++",
      "-disable-free",
      "-isysroot",
      "/",
      "-internal-isystem",
      "/include/c++/v1",
      "-internal-isystem",
      "/include",
      "-internal-isystem",
      "/lib/clang/8.0.1/include",
      "-ferror-limit",
      "19",
      "-fmessage-length",
      "80",
      "-fcolor-diagnostics",

    ];

    this.diagnosticsClangCommonArgs = [
      "-disable-free",
      "-isysroot",
      "/",
      "-internal-isystem",
      "/include/c++/v1",
      "-internal-isystem",
      "/include",
      "-internal-isystem",
      "/lib/clang/8.0.1/include",
    ];

    // debugger;
    this.memfs = new MemFS({
      compileStreaming: this.compileStreaming,
      hostWrite: this.hostWrite,
      hostRead: this.hostRead,
      memfsFilename: options.memfs || "memfs",
      sharedMem: this.sharedMem,
    });
    this.ready = this.memfs.ready.then(() => {
      return this.untar(this.sysrootFilename);
    });
  }

  setSharedMem(mem: WebAssembly.Memory) {
    this.sharedMem = mem;
  }

  hostLog(message: string) {
    const yellowArrow = "\x1b[1;93m>\x1b[0m ";
    this.hostWrite(`${yellowArrow}${message}`);
  }

  async hostLogAsync<T = unknown>(message: string, promise: Promise<T>) {
    const start = +new Date();
    this.hostLog(`${message}...`);
    const result = await promise;
    const end = +new Date();
    this.hostWrite(" done.");
    if (this.showTiming) {
      const green = "\x1b[92m";
      const normal = "\x1b[0m";
      this.hostWrite(` ${green}(${msToSec(start, end)}s)${normal}\r\n`);
    }
    this.hostWrite("\r\n");
    return result;
  }

  async getModule(name: string) {  
    if (name in this.moduleCache) return this.moduleCache[name]; 
    const mod = new Promise<WebAssembly.Module>(async(resolve, reject) => { 
      resolve(this.hostLogAsync(
        `\x1b[38;5;248mFetching and compiling ${name}`,
      this.compileStreaming(name))
    );})
    this.moduleCache[name] =  mod;
    return mod;
  }

  async untar(filename: string) {
    await this.memfs.ready;
    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        const tar = new Tar(await this.readBuffer(filename));
        tar.untar(({ type, filenameOrPath, contents }) => {
          if (type === TarPairType.File) {
            assert(contents instanceof Uint8Array);

            this.memfs.addFile(filenameOrPath, contents);
          } else if (type === TarPairType.Directory) {
            this.memfs.addDirectory(filenameOrPath);
          }
        }, resolve);
      } catch (error) {
        reject(error);
      }
    });

    await this.hostLogAsync(`\x1b[38;5;248mUntarring ${filename}`, promise);
    await promise;
  }

  async compile(options: CompileOptions) {
    const input = options.input;
    const contents = options.source;
    const obj = options.obj;

    await this.ready;

    this.memfs.addFile(input, contents);

    const clang = await this.getModule(this.clangFilename);
    await this.run(
      { module: clang, gray: true },
      "clang",
      "-cc1",
      "-Wall",
      "-emit-obj",
      // headersStr,
      // libPathsStr,
      ...this.compileClangCommonArgs,
      "-O2",
      "-o",
      obj,
      "-x",
      "c++",
      input
    );

    return obj;
  }

  async link(obj: string, wasm: string) {
    const stackSize = 1024 * 1024;

    const libdir = "lib/wasm32-wasi";
    const crt1 = `${libdir}/crt1.o`;
    await this.ready;
    const lld = await this.getModule(this.lldFilename);
    return await this.run(
      {
        module: lld,
        shouldWriteStdout: false,
      },

      "wasm-ld",
      "--no-threads",
      "--export-dynamic", // TODO required?
      "-z",
      `stack-size=${stackSize}`,
      `-L${libdir}`,
      `${libdir}/libunistd_ext.o`,
      crt1,
      obj,
      "-o",
      wasm,
      "-lc",
      "-lc++",
      "-lc++abi",
      "-lunistd_ext"
    );
  }

  async run(
    {
      module,
      shouldWriteStdout = true,
      gray = false,
    }: {
      module: WebAssembly.Module;
      shouldWriteStdout?: boolean;
      gray?: boolean;
    },
    ...args: string[]
  ) {
    if (shouldWriteStdout)
      this.hostLog(`${gray ? `\x1b[38;5;248m` : ""}${args.join(" ")}\r\n`);

    const name = args[0];
    const start = +new Date();
    const app = new App(module, this.memfs, name, ...args.slice(1));
    app.shouldWriteStdout = shouldWriteStdout;
    const instantiate = +new Date();
    const stillRunning = await app.run();
    const end = +new Date();
    if (shouldWriteStdout) this.hostWrite("\r\n");
    if (this.showTiming && shouldWriteStdout) {
      const green = "\x1b[92m";
      const normal = "\x1b[0m";
      let msg = `${green}(${msToSec(start, instantiate)}s`;
      msg += `/${msToSec(instantiate, end)}s)${normal}\r\n`;
      this.hostWrite(msg);
    }
    return stillRunning ? app : null;
  }

  async compileLinkRun(options: CompileLinkRunOptions) {
    const input = `program.cpp`;
    const wasm = `program.wasm`;
    const obj = `program.o`;

    const { source } = options;

    await this.compile({ source, input, obj });

    await this.link(obj, wasm);

    const buffer = this.memfs.getFileContents(wasm);
    const testMod = await this.hostLogAsync(
      `\x1b[38;5;248mCompiling ${wasm}`,
      WebAssembly.compile(buffer)
    );

    return await this.run({ module: testMod, gray: false }, wasm);
  }

  async runAnalysis(options: RunAnalysisOptions) {
    await this.ready;
    const clang = await this.getModule(this.clangFilename);

    const { source } = options;

    this.memfs.addFile(`program.cpp`, source);

    let output = "";
    const remove = this.memfs.onHostWrite((str) => {
      output += str;
    });

    await this.run(
      { module: clang, shouldWriteStdout: false },
      "clang",
      "-cc1",
      "-fsyntax-only",
      "-Wall",
      "-x",
      "c++",
      ...this.diagnosticsClangCommonArgs,
      `program.cpp`
    ).catch(() => {
      // ignore
    });

    remove();

    const parsed = ClangParser.parse(output);

    return parsed;
  }
}
