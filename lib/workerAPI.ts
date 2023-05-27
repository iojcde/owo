import { CppCheckOut, RunCppCheckOptions } from "./cppcheck";

export class WorkerAPI {
  nextResponseId: number;
  responseCBs: Map<number, { resolve: any; reject: any }>;
  worker: Worker;
  port: MessagePort;
  workerTerminated: boolean = false;

  static sharedMem: WebAssembly.Memory = new WebAssembly.Memory({
    initial: 1,
    maximum: 80,
    shared: true,
  });

  constructor(
    private onCompleteInput: () => Promise<string>,
    private write: (text: string) => void
  ) {
    this.nextResponseId = 0;
    this.responseCBs = new Map();
    this.worker = new Worker(new URL("./worker.ts", import.meta.url));
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = this.onmessage.bind(this);

    const remotePort = channel.port2; 
    this.worker.postMessage(
      {
        id: "constructor",
        data: {
          port: remotePort,
          sharedMem: WorkerAPI.sharedMem,
        },
      },
      [remotePort]
    );

    this.setShowTiming(false);
  }

  setShowTiming(value: boolean) {
    this.port.postMessage({ id: "setShowTiming", data: value });
  }

  reset() {
    this.responseCBs = new Map();
    this.nextResponseId = 0;
  }

  terminate() {
    // before terminating we need to resolve any pending promises
    for (const [responseId, { reject }] of this.responseCBs) {
      reject();
      console.error( `Response ${responseId} Worker forcefully terminated`)
    }
    this.responseCBs.clear();

    this.port.onmessage = null;
    this.port.close();
    this.worker.terminate();
    this.workerTerminated = true;
  }

  async runAsync(id: any, options: any) {
    const responseId = this.nextResponseId++;
    const responsePromise = new Promise((resolve, reject) => {
      this.responseCBs.set(responseId, { resolve, reject });
    });
    this.port.postMessage({ id, responseId, data: options });
    return await responsePromise;
  }

  // async compileToAssembly(options: any) {
  //   return this.runAsync("compileToAssembly", options);
  // }

  // async compileTo6502(options: any) {
  //   return this.runAsync("compileTo6502", options);
  // }

  compileLinkRun(source: string) {
    return this.runAsync("compileLinkRun", {
      source
    });
  }

  runCppCheck(opts: RunCppCheckOptions): Promise<CppCheckOut[]> {
    try {
      return this.runAsync("runCppCheck", opts) as Promise<CppCheckOut[]>;
    } catch (error) {
      console.error(error);
      return Promise.reject(error);
    }
  }

  private onmessage(event: any) {
    if (this.workerTerminated) {
      console.error(
        "Worker terminated, but still receiving messages. Evicting"
      );
      return;
    }
 
    switch (event.data.id) {
      case "write": {  
        this.write(event.data.data);
        break;
      }
      case "readLine": {
        this.onCompleteInput().then((value: string) => {
          const view = new Uint8Array(WorkerAPI.sharedMem!.buffer);
          for (let i = 0; i < value.length; i++) {
            // to the shared memory
            view[i] = value.charCodeAt(i);
          }
          // the last byte is the null terminator
          view[value.length] = 0;

          Atomics.notify(new Int32Array(WorkerAPI.sharedMem!.buffer), 0);
        });
        break;
      }

      case "compileLinkRunDone":
        break;

      case "runAsync": {
        const responseId = event.data.responseId;
        const promise = this.responseCBs.get(responseId);
        if (promise) {
          this.responseCBs.delete(responseId);
          promise.resolve(event.data.data);
        }
        break;
      }
    }
  }
}