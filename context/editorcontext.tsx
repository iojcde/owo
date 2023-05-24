import React from "react";
import { createContext } from "react";
import type { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { Uri } from "vscode";

type OnFileChangeListener = (content: string) => void;

export interface EditorContext {
  theme: string;
  setTheme: (theme: string) => void;

  setMonaco: (monaco: Monaco) => void;
  monaco: Monaco | null;
  notifyFileChange: (content: string) => void;

  addChangeFileListener: (listener: OnFileChangeListener) => () => void;

  mark(
    opts: {
      file: string;
      line: number;
      column: number;
      message: string;
      severity: string;
    }[]
  ): void;
}

const Context = createContext<EditorContext>({
  theme: "",
  setTheme: () => {},
  addChangeFileListener: () => () => {},
  notifyFileChange: () => {},
  mark: () => {},
  setMonaco: () => {},
  monaco: null,
});

const themePrefix = "vs-";

export default function EditorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = React.useState<string>(
    themePrefix + (localStorage.getItem("dark") === "true" ? "dark" : "light")
  );

  const monacoRef = React.useRef<Monaco | null>(null);
  const changeFileListenerRef = React.useRef<OnFileChangeListener[]>([]);

  const addChangeFileListener = (listener: OnFileChangeListener) => {
    changeFileListenerRef.current.push(listener);
    return () => {
      changeFileListenerRef.current = changeFileListenerRef.current.filter(
        (l) => l !== listener
      );
    };
  };

  const notifyFileChange = (content: string) => {
    if (changeFileListenerRef.current.length === 0) {
      console.warn("No open file listener");
      return;
    }

    changeFileListenerRef.current.forEach((l) => l(content));
  };

  const setMonaco = (monaco: Monaco) => {
    monacoRef.current = monaco;
  };

  const mark = (
    opts: {
      file: string;
      line: number;
      column: number;
      message: string;
      severity: string;
    }[]
  ) => {
    const monaco = monacoRef.current;

    function getMonacoSeverity(str: string) {
      if (!monaco) {
        return 4;
      }

      const errorMatch = str.match(/error/i);
      if (errorMatch) {
        return monaco.MarkerSeverity.Error;
      }

      const warningMatch = str.match(/warning/i);
      if (warningMatch) {
        return monaco.MarkerSeverity.Warning;
      }

      return monaco.MarkerSeverity.Info;
    }

    const model = monaco?.editor.getModels()[0];
    if (model == undefined) {
      return;
    }

    monaco?.editor.setModelMarkers(model, "owner", []);

    const markers = opts.map((o) => {
      const word = model.getWordAtPosition({
        lineNumber: o.line,
        column: o.column,
      });

      return {
        severity: getMonacoSeverity(o.severity),
        startLineNumber: o.line,
        startColumn: o.column,
        endLineNumber: o.line,
        // endColumn: end of line
        endColumn: word?.endColumn ?? o.column + Infinity,
        message: o.message,
      };
    });

    monaco?.editor.setModelMarkers(model, "owner", markers);
  };

  const value = {
    theme,
    setTheme,
    addChangeFileListener,
    notifyFileChange,
    mark,
    setMonaco,
    monaco: monacoRef.current,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEditorContext() {
  return React.useContext(Context);
}
