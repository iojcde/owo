"use client";

import EditorProvider from "@/context/editorcontext";
import RunProvider from "@/context/runContext";
import { TerminalProvider } from "@/context/terminalContext";
import { ReactNode, useEffect } from "react";

const Providers = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    window.addEventListener("beforeunload", (event) => {
      event.preventDefault();
      event.returnValue = "";
    });
  });
  return (
    <TerminalProvider>
      <EditorProvider>
        <RunProvider>{children}</RunProvider>
      </EditorProvider>
    </TerminalProvider>
  );
};
export default Providers;
