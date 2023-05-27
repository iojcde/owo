"use client";

import { editor } from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

const Terminal = dynamic(() => import("../components/Terminal"), {
  ssr: false,
});
import { useMonaco } from "@monaco-editor/react";

import { useEditorContext } from "@/context/editorContext";
import { useRunContext } from "@/context/runContext";
import { useStorageContext } from "@/context/storageContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import debounce from "just-debounce-it";
import { useMedia } from "react-use";
import dynamic from "next/dynamic";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Dialog, DialogTrigger } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { RevisionSelect } from "./RevisionSelect";
const defaultValue = `#include <stdio.h>

int main() {
  printf("Hello, World!");
  return 0;
}
`;

const EditorComponent = () => {
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const monaco =
    useMonaco() as typeof import("monaco-editor/esm/vs/editor/editor.api");
  const isDark = useMedia("(prefers-color-scheme: dark)", true);

  function handleEditorMount(editor: editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
  }

  const { save, getRevisions, getRevision } = useStorageContext();
  const { runSingleFile } = useRunContext();
  const { notifyFileChange, setMonaco, addChangeFileListener } =
    useEditorContext();

  setMonaco(monaco);

  const setTheme = () => {
    if (isDark) {
      monaco?.editor.setTheme("vs-dark");
    } else {
      monaco?.editor.setTheme("vs-light");
    }
  };

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

  const autoSave = useCallback(
    debounce(async () => {
      save(editorRef.current?.getValue() ?? "");
      setSaved(true);
    }, 1000),
    []
  );

  useEffect(() => {
    if (localStorage.getItem("code")) {
      editorRef.current?.setValue(localStorage.getItem("code") ?? "");
    }

    addChangeFileListener(() => {
      setSaved(false);

      autoSave();
    });
  }, []);

  useEffect(() => {
    setTheme();
  }, [isDark]);

  return (
    <div className="h-screen">
      <div className="flex flex-col h-full w-full">
        <div className=" border-b">
          <div className="flex max-w-screen-xl mx-auto w-full items-center gap-4 p-1.5 px-6 justify-between">
            <div className="flex items-center gap-4">
              <h1 className="font-bold">owo</h1>
              <button
                className="rounded text-sm bg-gray-4 hover:bg-gradient-to-br text-gray-12 from-gray-6 to-gray-4 hover:shadow transition font-medium px-4 py-1 border"
                onClick={() => {
                  runSingleFile(editorRef.current?.getValue() ?? "");
                }}
              >
                Run
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`${saved ? "text-gray-10" : "text-gray-12"} text-sm`}
              >
                {saved ? "Saved" : "Unsaved changes"}
              </div>

              <button
                className="rounded text-sm bg-gray-4 hover:bg-gradient-to-br text-gray-12 from-gray-6 to-gray-4 hover:shadow transition font-medium px-4 py-1 border"
                onClick={() => {
                  save(editorRef.current?.getValue() ?? "");
                  setSaved(true);
                }}
              >
                Save
              </button>
              <Dialog>
                <AlertDialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="text-sm outline-none">
                      Menu ▾
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DialogTrigger className="w-full">
                        <DropdownMenuItem>Revisions</DropdownMenuItem>
                      </DialogTrigger>
                      <AlertDialogTrigger className="text-sm group w-full">
                        <DropdownMenuItem className="group-hover:text-red-500">
                          Reset
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will clear your current editor content and replace
                        it with default template code.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-500 hover:bg-red-600"
                        onClick={() => {
                          editorRef.current?.setValue(defaultValue);
                        }}
                      >
                        Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <RevisionSelect revisions={getRevisions()} />
              </Dialog>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 flex-1 ">
          <MonacoEditor
            height="100%"
            defaultLanguage="cpp"
            defaultValue={getRevision(getRevisions()[0]) ?? defaultValue}
            onMount={handleEditorMount}
            defaultPath="program.cpp"
            loading={<></>}
            options={{
              padding: { top: 24 },
              language: "cpp",
              fontLigatures: true,
              fontSize: 16,
              cursorSmoothCaretAnimation: "on",
              automaticLayout: true,
            }}
            theme={isDark ? "vs-dark" : "vs-light"}
            onChange={onChange}
          />
          <Terminal />
        </div>
      </div>
    </div>
  );
};

export default EditorComponent;
