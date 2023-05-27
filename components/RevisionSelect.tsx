import { Dispatch, SetStateAction, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger as button,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Editor as MonacoEditor } from "@monaco-editor/react";
import { useStorageContext } from "@/context/storageContext";
import type { editor } from "monaco-editor";
import { useMedia } from "react-use";
import { Button } from "./ui/button";

const RevisionItem: React.FC<{
  revision: string;
  setRevision: (revision: string) => void;
}> = ({ revision, setRevision }) => {
  const { getRevision } = useStorageContext();
  const date = new Date(revision);
  return (
    <div className="py-1 pr-1">
      <button
        onClick={() => setRevision(revision)}
        className="text-sm text-gray-11 p-2 py-3 outline-none hover:bg-gray-2 text-left rounded-lg transition w-full"
      >
        <div>{`${date.toLocaleTimeString("en-US", {
          minute: "2-digit",
          hour: "2-digit",
          hour12: true,
        })}, ${date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`}</div>
        <div className=" text-gray-10">
          {getRevision(revision).length} characters
        </div>
      </button>
    </div>
  );
};

export const RevisionSelect: React.FC<{
  revisions: string[];
  revision: string;
}> = ({ revision, revisions }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isDark = useMedia("(prefers-color-scheme: dark)", true);
  const { getRevision } = useStorageContext();
  return (
    <DialogContent className="w-full sm:max-w-4xl xl:max-w-5xl">
      <DialogHeader>
        <DialogTitle>Revisions</DialogTitle>
        <div className="grid gap-4 grid-cols-[0.3fr_1fr] ">
          <ScrollArea className="h-[28rem] mt-2">
            {revisions.map((name, i) => {
              return (
                <div key={i}>
                  <RevisionItem
                    setRevision={(name) => {
                      console.log(name);
                      editorRef.current?.setValue(getRevision(name) ?? "");
                    }}
                    revision={name}
                  />
                  {revisions.length - 1 !== i && <Separator />}
                </div>
              );
            })}
          </ScrollArea>

          <div className="flex flex-col gap-4">
            <MonacoEditor
              height="100%"
              className="rounded-lg overflow-hidden border"
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              options={{
                padding: { top: 24 },
                readOnly: true,
                automaticLayout: true,
                minimap: { enabled: false },
              }}
              defaultValue={getRevision(revision)}
              theme={isDark ? "vs-dark" : "vs-light"}
              language="cpp"
            />
            <div className="flex items-center gap-4 justify-end px-6">
              <Button variant="outline">Cancel</Button>
              <Button variant="secondary">Download</Button>
              <Button variant="destructive">Revert</Button>
            </div>
          </div>
        </div>
      </DialogHeader>
    </DialogContent>
  );
};
