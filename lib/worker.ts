
import { API } from "./api";
import { App } from "./app";
import CppCheck from "./cppcheck";

let port: MessagePort;
let api: API;
let currentApp: App | null = null;

let cppCheck: CppCheck = new CppCheck();
cppCheck.init();

const apiOptions = {
  async readBuffer(filename: string | URL) {
    const response = await fetch(filename);
    return response.arrayBuffer();
  },
  async compileStreaming(filename: string | URL) {
    // TODO: make compileStreaming work. It needs the server to use the
    // application/wasm mimetype.
    if (false && WebAssembly.compileStreaming) {
      return WebAssembly.compileStreaming(fetch(filename));
    } else {
      const response = await fetch(filename);
      return WebAssembly.compile(await response.arrayBuffer());
    }
  },

  hostWrite(s: string) {
    port.postMessage({ id: "write", data: s }); 
  },

  hostReadLine() {
    port.postMessage({ id: "readLine" });
  },
};

async function onAnyMessage(event: MessageEvent) {
  switch (event.data.id) {
    case "constructor":
      port = event.data.data.port;
      const sharedMem = event.data.data.sharedMem;
      port.onmessage = onAnyMessage;
      api = new API({
        ...apiOptions,
        sharedMem,
        memfs: "memfs.wasm",
        clang: "clang.wasm",
        lld: "lld.wasm",
        sysroot: "sysroot.tar",
      });

      break;

    case "setSharedMem": {
      const sharedMem = event.data.data;
      api.setSharedMem(sharedMem);
      break;
    }
    case "setShowTiming":
      api.showTiming = event.data.data;
      break;

    // case "compileToAssembly": {
    //   const responseId = event.data.responseId;
    //   let output = null;
    //   let transferList;
    //   try {
    //     output = await api.compileToAssembly(event.data.data);
    //   } finally {
    //     port.postMessage(
    //       { id: "runAsync", responseId, data: output },
    //       transferList
    //     );
    //   }
    //   break;
    // }

    // case "compileTo6502": {
    //   const responseId = event.data.responseId;
    //   let output = null;
    //   let transferList;
    //   try {
    //     output = await api.compileTo6502(event.data.data);
    //   } finally {
    //     port.postMessage(
    //       { id: "runAsync", responseId, data: output },
    //       transferList
    //     );
    //   }
    //   break;
    // }

    case "compileLinkRun": {
      if (currentApp) {
        console.log("First, disallowing rAF from previous app.");
        // Stop running rAF on the previous app, if any.
        currentApp.allowRequestAnimationFrame = false;
      }

      const responseId = event.data.responseId;

      let transferList;
      try {
        currentApp = await api.compileLinkRun(event.data.data);
      } finally {
        port.postMessage(
          { id: "runAsync", responseId, data: currentApp },
          transferList
        );
      }
      break;
    }

    case "runCppCheck": {
      const responseId = event.data.responseId;
      let output = null;
      let transferList;
      try {
        output = await api.runAnalysis(event.data.data); 
        if (!output || !output.length) { // if no errors, run cppcheck
          // output = await cppCheck.run(event.data.data); // TODO: add more files to cppcheck env
        }
      } catch (e) {
        console.error(e);
      } finally {
        port.postMessage(
          { id: "runAsync", responseId, data: output },
          transferList
        );
      }
      break;
    }
  }
}

onmessage = onAnyMessage;