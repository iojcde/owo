import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useKeyPress } from "react-use";
import debounce from "just-debounce-it";

import { WorkerAPI } from "../lib/workerAPI";
import { useTerminalContext } from "./terminalContext";
import type { editor } from "monaco-editor";
import { useEditorContext } from "./editorcontext";

type OnRunningChange = (isRunning: boolean) => void;

interface RunContext {
  runSingleFile: (content: string) => Promise<void>;

  addRunningChangeListener: (listener: OnRunningChange) => () => void;
  isRunning: boolean;

  forceAbort(): void;
}

const Context = createContext<RunContext>({
  runSingleFile: () => Promise.resolve(),
  addRunningChangeListener: () => () => {},
  forceAbort: () => {},
  isRunning: false,
});
export default function RunProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiRef = useRef<WorkerAPI>();
  const runningChangeListeners = useRef<OnRunningChange[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [rootHtml, setRootHtml] = useState<string | null>(null);


  const { addInputListener, write } = useTerminalContext();
  const { addChangeFileListener, mark, monaco } = useEditorContext();

  const addRunningChangeListener = (listener: OnRunningChange) => {
    runningChangeListeners.current.push(listener);
    return () => {
      runningChangeListeners.current = runningChangeListeners.current.filter(
        (l) => l !== listener
      );
    };
  };

  useEffect(() => {
    (async () => {
      const rootHTML = await (await fetch("/")).text();
      setRootHtml(rootHTML);
    })();
  }, []);

  const runSingleFile = async (source: string) => {
    setIsRunning(true);

    await apiRef.current?.compileLinkRun(source).finally(() => {
      setIsRunning(false);
    });
  };

  const forceAbort = () => {
    loadNewWorkerAPI();
    write(
      "\r\n\u001b[41m##### Program forcefully terminated #####\u001b[0m\r\n"
    );
  };

  const loadNewWorkerAPI = useCallback(() => {
    async function waitForInput() {
      return new Promise<string>((resolve) => {
        const cleanup = addInputListener((input) => {
          cleanup();
          resolve(input);
        });
      });
    }

    if (apiRef.current) {
      // terminate old worker
      apiRef.current.terminate();
      delete apiRef.current;
    }

    const api = new WorkerAPI(waitForInput, write);
    apiRef.current = api;
  }, [addInputListener, write]);

  useEffect(() => {
    loadNewWorkerAPI();
  }, [loadNewWorkerAPI]);

  useEffect(() => {
    runningChangeListeners.current.forEach((l) => l(isRunning));
  }, [isRunning]);

  useEffect(() => {
    const fn = debounce(
      async (source: string) => {
        const contentArrBuffer = new TextEncoder().encode(source);

        const result = await apiRef.current?.runCppCheck({
          source: contentArrBuffer,
        });

        if (!result) return;

        mark(result);
      },
      300,
      true
    );

    const rmListener = addChangeFileListener(fn);

    const disposable = monaco?.languages.registerHoverProvider(["c", "c++"], {
      async provideHover(model, position, token) {
        const word: editor.IWordAtPosition | null =
          model.getWordAtPosition(position);
        if (!word) {
          return null;
        }

        const range: any = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // check if is string literal -> show string literal
        const lineContent: string = model.getLineContent(position.lineNumber);
        const lineTillCurrentPosition = lineContent.substring(
          word.startColumn - 2,
          word.endColumn
        );
        const lineTillCurrentPositionTrimmed = lineTillCurrentPosition.trim();
        if (
          lineTillCurrentPositionTrimmed.startsWith('"') &&
          lineTillCurrentPositionTrimmed.endsWith('"')
        ) {
          return {
            range,
            contents: [
              {
                value: lineTillCurrentPositionTrimmed,
                isTrusted: true,
              },
            ],
          };
        }

        // check if is number literal -> show number literal
        if (!isNaN(Number(word.word))) {
          return {
            range,
            contents: [
              {
                value: word.word,
                isTrusted: true,
              },
            ],
          };
        }
        let htmlContent: string | null = null;
        let baseURI = process.env.PUBLIC_URL + "/resources/man";
        let uri: string = `${baseURI}/3_${word.word}.html`;
        try {
          const result = await fetch(uri);
          if (result.ok) {
            htmlContent = await result.text();
            if (htmlContent === rootHtml) htmlContent = null;
          }
        } catch (error) {
          console.error(error);
        }

        return {
          range,
          contents: [
            htmlContent
              ? {
                  value: htmlContent,
                  supportHtml: true,
                  baseUri: monaco.Uri.from({
                    scheme: "http",
                    path: uri,
                  }),

                  isTrusted: true,
                }
              : {
                  value: word.word,
                  isTrusted: true,
                },
          ],
        };
      },
    });

    return () => {
      rmListener();
      disposable?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChangeFileListener, mark]);

  const value = {
    runSingleFile,
    addRunningChangeListener,
    forceAbort,
    isRunning,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRunContext() {
  return useContext(Context);
}
