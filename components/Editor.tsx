"use client";

import { editor } from "monaco-editor";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { FitAddon } from "xterm-addon-fit";

import MonacoEditor, {
  DiffEditor,
  useMonaco,
  loader,
} from "@monaco-editor/react";

import Terminal from "./Terminal";
import { useTerminalContext } from "@/context/terminalContext";
import { WorkerAPI } from "@/lib/workerAPI";
import { useEditorContext } from "@/context/editorcontext";
import { useRunContext } from "@/context/runContext";
const defaultValue = `#include <stdio.h>

int main() {
  printf("Hello, World!");
  return 0;
}
`;

const EditorComponent = () => {
  const apiRef = useRef<WorkerAPI>();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const monaco =
    useMonaco() as typeof import("/root/coderunner/node_modules/.pnpm/monaco-editor@0.38.0/node_modules/monaco-editor/esm/vs/editor/editor.api");

  function handleEditorMount(editor: editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
    monaco?.editor?.setTheme("vs-dark");
  }

  const { runSingleFile } = useRunContext();

  const { notifyFileChange, setMonaco } = useEditorContext();

  setMonaco(monaco);

  const onChange = async (value?: string) => {
    if (value === undefined) return;
    notifyFileChange(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "s" && e.ctrlKey) {
        e.preventDefault();
        console.log("asdfasdf");
        if (
          editorRef.current?.getValue().trim() !== "" &&
          editorRef.current?.getValue()
        ) {
          localStorage.setItem("code", editorRef.current?.getValue());
        }
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  useEffect(() => {
    if (localStorage.getItem("code")) {
      editorRef.current?.setValue(localStorage.getItem("code") ?? "");
    }
  }, []);

  return (
    <div>
      <div className="">
        <div className="flex items-center gap-4 p-1.5 px-6 border-b">
          <h1 className="text-sm font-bold">owo</h1>
          <button
            className="rounded text-sm bg-gray-4 hover:bg-gradient-to-br text-gray-12 from-gray-6 to-gray-4 hover:shadow transition font-medium px-4 py-1 border"
            onClick={() => {
              runSingleFile(editorRef.current?.getValue() ?? "");
            }}
          >
            Run
          </button>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <MonacoEditor
            height="90vh"
            defaultLanguage="cpp"
            defaultValue={localStorage.getItem("code") ?? defaultValue}
            onMount={handleEditorMount}
            theme="vs-dark"
            defaultPath="program.cpp"
            loading={<></>}
            options={{
              padding: { top: 24 },
              language: "cpp",
              fontLigatures: true,
              fontSize: 14,
              cursorSmoothCaretAnimation: "on",
            }}
            onChange={onChange}
          />
          <Terminal />
        </div>
      </div>
    </div>
  );
};

export default EditorComponent;
