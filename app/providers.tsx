"use client";

import EditorProvider from "@/context/editorContext";
import RunProvider from "@/context/runContext";
import { StorageProvider } from "@/context/storageContext";
import { TerminalProvider } from "@/context/terminalContext";
import { ReactNode, useEffect } from "react";

const Providers = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    process.env.NODE_ENV === "production" &&
      window.addEventListener("beforeunload", (event) => {
        event.preventDefault();
        event.returnValue = "";
      });
  });
  return (
    <TerminalProvider>
      <StorageProvider>
        <EditorProvider>
          <RunProvider>{children}</RunProvider>
        </EditorProvider>
      </StorageProvider>
    </TerminalProvider>
  );
};
export default Providers;
