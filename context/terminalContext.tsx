import { createContext, useContext, useRef, useState } from "react";

type InputListener = (input: string) => void;
type WriteListener = (text: string) => void;

export interface TerminalContext {
  isWritable: () => boolean;
  setWritable: (writable: boolean) => void;

  addInputListener: (listener: InputListener) => () => void;
  triggerInputListeners: (input: string) => void;

  addWriteListener: (listener: WriteListener) => () => void;
  write: (text: string) => void;
}

const defaultValue: TerminalContext = {
  isWritable: () => false,
  setWritable: () => {},
  addInputListener: () => {
    return () => {};
  },
  triggerInputListeners: () => {},
  addWriteListener: () => {
    return () => {};
  },
  write: () => {},
};

const Context = createContext<TerminalContext>(defaultValue);

export function TerminalProvider(props: { children: React.ReactNode }) {
  const [_isWritable, setIsWritable] = useState<boolean>(false);
  const inputListenersRef = useRef<InputListener[]>([]);
  const writeListenersRef = useRef<WriteListener[]>([]);
  const queuedWritesRef = useRef<string[]>([]);

  function isWritable() {
    return _isWritable;
  }

  function setWritable(writable: boolean) {
    setIsWritable(writable);
  }

  function addInputListener(listener: InputListener) {
    inputListenersRef.current.push(listener);

    return () => {
      inputListenersRef.current = inputListenersRef.current.filter(
        (l) => l !== listener
      );
    };
  }

  function triggerInputListeners(input: string) {
    if (inputListenersRef.current.length === 0) {
      console.warn("No input listeners");
      return;
    }

    inputListenersRef.current.forEach((listener) => listener(input));
  }

  function addWriteListener(listener: InputListener) {
    writeListenersRef.current.push(listener);

    if (queuedWritesRef.current.length > 0) {
      queuedWritesRef.current.forEach((text) => listener(text));
      queuedWritesRef.current = [];
    }

    return () => {
      writeListenersRef.current = writeListenersRef.current.filter(
        (l) => l !== listener
      );
    };
  }

  function write(text: string) {
    if (writeListenersRef.current.length === 0) {
      console.warn("No write listeners");
      queuedWritesRef.current.push(text);
      return;
    }

    writeListenersRef.current.forEach((listener) => listener(text));
  }

  const value: TerminalContext = {
    isWritable,
    setWritable,
    addInputListener,
    triggerInputListeners,
    addWriteListener,
    write,
  };

  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

export function useTerminalContext() {
  return useContext(Context);
}
