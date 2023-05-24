import { SourceType, assert } from "./utils";
interface ExportedCppCheck {
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (
      path: string,
      data: string | ArrayBuffer,
      options: {
        flags?:
          | "r"
          | "r+"
          | "w"
          | "wx"
          | "w+"
          | "wx+"
          | "a"
          | "ax"
          | "a+"
          | "ax+";
        mode?: number;
        encoding: "utf8";
      }
    ) => void;
    readFile: (path: string, options: { encoding: "utf8" }) => string;
    mkdir: (path: string, mode?: number) => void;
    mkdirTree: (path: string, mode?: number) => void;
    stat: (path: string, dontFollow: boolean) => any;
  };
}

export interface FileInput {
  name: string; // path
  contents: ArrayBuffer | string;
}

export interface RunCppCheckOptions {
  source: ArrayBuffer
}

export interface CppCheckOut {
  file: string;
  line: number;
  column: number;
  severity: string;
  id: string;
  message: string;
}

export default class CppCheck {
  script: ((Module: any, ...args: any[]) => any) | null = null;
  baseReady: Promise<void>;
  ready: Promise<void> = Promise.resolve();
  baseInited: boolean = false;
  exportedCppCheck: ExportedCppCheck | null = null;

  ignoreFileNames: string[] = ["nofile"];

  constructor() {
    this.baseReady = import("./resources/cppcheck").then(
      ({ default: cppcheck }) => {
        this.script = cppcheck;
      }
    );
  }

  async init() {
    await this.baseReady;
    this.ready = this.initModule().then(() => this.writeCfgFile());
  }

  private async initModule() {
    assert(this.script !== null);
    const Module = {
      noInitialRun: true,
      print: (...args: any[]) => console.log(...args),
      printErr: (...args: any[]) => console.error(...args),
    };

    this.exportedCppCheck = await this.script(Module);
    this.baseInited = true;
  }

  private async writeCfgFile() {
    assert(this.baseInited);
    assert(this.exportedCppCheck !== null);

    const cfgFileUrl = new URL(
      "./resources/cppcheck-std.cfg",
      import.meta.url
    );
    const cfgFile = await fetch(cfgFileUrl);
    const cfgFileText = await cfgFile.text();

    this.exportedCppCheck.FS.writeFile("std.cfg", cfgFileText, {
      flags: "w+",
      encoding: "utf8",
    });
  }

  createFile(name: string, contents: ArrayBuffer | string) {
    assert(this.baseInited);
    assert(this.exportedCppCheck !== null);

    // creates a file and its parent directories
    const parts = name.split("/");
    parts.pop();
    const dir = parts.join("/");
    this.exportedCppCheck.FS.mkdirTree(dir);
    this.exportedCppCheck.FS.writeFile(name, contents, {
      flags: "w",
      encoding: "utf8",
    });
  }

  async run(options: RunCppCheckOptions) {
    await this.ready;
    assert(this.baseInited);
    assert(this.exportedCppCheck !== null);

    const { source,   } = options;

    this.createFile('program.cpp', source);

    this.createFile("cppcheck-result.txt", "");
 
    const args = [
      "--enable=all",
      "--std=c++17",
      "--template={file}$%*{line}$%*{column}$%*{severity}$%*{id}$%*{message}",
      // "--inline-suppr",
      "--language=c++" ,
      "--quiet",
      "--library=std.cfg",
      "--suppress=missingIncludeSystem",
      "--output-file=cppcheck-result.txt", 
      'program.cpp',
    ];

    try {
      const exitCode = this.exportedCppCheck.callMain(args);
      if (exitCode !== 0) {
        throw new Error(`Cppcheck exited with code ${exitCode}`);
      }

      const result = this.exportedCppCheck.FS.readFile("cppcheck-result.txt", {
        encoding: "utf8",
      });

      const parsed = this.parseResult(result);
      return parsed;
    } catch (error) {
      console.error("Cppcheck error:", error);
    }

    return [];
  }

  parseResult(result: string): CppCheckOut[] {
    // example result: main.c:4:style:unusedVariable:Unused variable: str
    const lines = result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed: CppCheckOut[] = [];
    for (const line of lines) {
      const [file, lineStr, columnStr, severity, id, message] =
        line.split("$%*");

      if (this.ignoreFileNames.includes(file)) continue;

      parsed.push({
        file,
        line: parseInt(lineStr),
        column: parseInt(columnStr),
        severity,
        id,
        message,
      });
    }

    return parsed;
  }
}