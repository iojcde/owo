import { createContext } from "react";

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

const getRevisions = async () => {
  const revisions = localStorage.getItem("revisions");
  if (revisions) {
    return JSON.parse(revisions);
  } else {
    return [];
  }
};

const save = async (content: string) => {
  localStorage.setItem(
    "revisions",
    JSON.stringify([
      ...JSON.parse(localStorage.getItem("revisions") ?? "[]"),
      new Date().toISOString(),
    ])
  );
  localStorage.setItem(`content${new Date().toISOString()}`, content);
};

const getRevision = async (revision: string) => {
  return localStorage.getItem(`content${revision}`);
};

const value = {
  getRevisions,
  save,
  getRevision,
};
const StorageProvider = ({ children }: { children: React.ReactNode }) => {
  return <Context.Provider value={value}>{children}</Context.Provider>;
};
