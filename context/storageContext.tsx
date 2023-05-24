import { createContext, useContext } from "react";

const isClient = () => typeof window !== "undefined";

export interface StorageContext {
  getRevisions: () => string[];
  save: (content: string) => void;
  getRevision: (revision: string) => string;
}

const Context = createContext<StorageContext>({
  getRevisions: () => [],
  save: () => {},
  getRevision: () => "",
});

const getRevisions = (): string[] => {
  if (isClient()) {
    const revisions = localStorage.getItem("revisions");
    if (revisions) {
      return JSON.parse(revisions);
    } else {
      return [];
    }
  } else {
    return [];
  }
};

const save = (content: string) => {
  if (isClient()) {
    console.log("saving");
    const old = JSON.parse(localStorage.getItem("revisions") ?? "[]");
    const time = new Date();
    const revisions: string[] = JSON.parse(
      localStorage.getItem("revisions") ?? "[]"
    );

    if (
      time.getTime() - new Date(revisions[0]).getTime() > 60 * 1000 * 10 ||
      revisions.length === 0
    ) {
      //larger than 10 minutes
      localStorage.setItem(
        "revisions",
        JSON.stringify([time.toISOString(), ...old])
      );
      localStorage.setItem(`content${time.toISOString()}`, content);
    } else {
      localStorage.setItem(`content${revisions[0]}`, content);
    }
  }
};

const getRevision = (revision: string): string => {
  if (isClient()) {
    return localStorage.getItem(`content${revision}`) ?? "";
  } else return "";
};

const value = {
  getRevisions,
  save,
  getRevision,
};

const StorageProvider = ({ children }: { children: React.ReactNode }) => {
  return <Context.Provider value={value}>{children}</Context.Provider>;
};

const useStorageContext = () => {
  return useContext(Context);
};

export { StorageProvider, useStorageContext };
