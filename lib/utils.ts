import { AssertError } from "./error";


export enum SourceType {
  C = "c",
  CPP = "c++",
}

export function sleep(ms: number) {
  return new Promise((resolve, _) => setTimeout(resolve, ms));
}

export function readStr(u8: Uint8Array, o: number, len = -1) {
  let str = "";
  let end = u8.length;
  if (len !== -1) end = o + len;
  for (let i = o; i < end && u8[i] !== 0; ++i)
    str += String.fromCharCode(u8[i]);
  return str;
}

export function assert(cond: boolean): asserts cond {
  if (!cond) {
    throw new AssertError("assertion failed.");
  }
}

export function getImportObject(obj: Object, names: string[]) {
  const result: any = {};
  for (let name of names) {
    result[name] = obj[name as keyof typeof obj].bind(obj);
  }

  return result;
}

export function getInstance(
  module: WebAssembly.Module,
  imports: WebAssembly.Imports = {}
) {
  return WebAssembly.instantiate(module, imports);
}

export function msToSec(start: number, end: number) {
  return ((end - start) / 1000).toFixed(2);
}

import { ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}