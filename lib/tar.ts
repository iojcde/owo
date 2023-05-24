import { assert, readStr } from "./utils";

export type TarEntryType = "0" | "5";
export interface TarEntry {
  filename: string;
  mode: number;
  owner: number;
  group: number;
  size: number;
  mtim: number;
  checksum: number;
  type: TarEntryType;
  linkname: string;

  ownerName?: string;
  groupName?: string;
  devMajor?: string;
  devMinor?: string;
  filenamePrefix?: string;

  contents?: Uint8Array;
}

export enum TarPairType {
  File = "file",
  Directory = "directory",
}

export interface TarEntryPair {
  type: TarPairType;
  filenameOrPath: string;
  contents?: Uint8Array;
}

export type OnNewPairFn = (pair: TarEntryPair) => void;
export class Tar {
  u8: Uint8Array;
  offset: number;

  constructor(buffer: ArrayBuffer) {
    this.u8 = new Uint8Array(buffer);
    this.offset = 0;
  }

  readStr(len: number) {
    const result = readStr(this.u8, this.offset, len);
    this.offset += len;
    return result;
  }

  readOctal(len: number) {
    return parseInt(this.readStr(len), 8);
  }

  alignUp() {
    this.offset = (this.offset + 511) & ~511;
  }

  readEntry() {
    if (this.offset + 512 > this.u8.length) {
      return null;
    }

    const entry: TarEntry = {
      filename: this.readStr(100),
      mode: this.readOctal(8),
      owner: this.readOctal(8),
      group: this.readOctal(8),
      size: this.readOctal(12),
      mtim: this.readOctal(12),
      checksum: this.readOctal(8),
      type: this.readStr(1) as TarEntryType,
      linkname: this.readStr(100),
    };

    if (this.readStr(8) !== "ustar  ") {
      return null;
    }

    entry.ownerName = this.readStr(32);
    entry.groupName = this.readStr(32);
    entry.devMajor = this.readStr(8);
    entry.devMinor = this.readStr(8);
    entry.filenamePrefix = this.readStr(155);
    this.alignUp();

    if (entry.type === "0") {
      // Regular file.
      entry.contents = this.u8.subarray(this.offset, this.offset + entry.size);
      this.offset += entry.size;
      this.alignUp();
    } else if (entry.type !== "5") {
      // Directory.
      console.log("type", entry.type);
      assert(false);
    }
    return entry;
  }

  untar(cb: OnNewPairFn, endCb: () => void) {
    let entry: TarEntry | null;
    while ((entry = this.readEntry())) {
      switch (entry.type) {
        case "0": // Regular file.
          //   memfs.addFile(entry.filename, entry.contents);
          cb({
            type: TarPairType.File,
            filenameOrPath: entry.filename,
            contents: entry.contents,
          });
          break;
        case "5":
          //   memfs.addDirectory(entry.filename);
          cb({
            type: TarPairType.Directory,
            filenameOrPath: entry.filename,
            contents: entry.contents,
          });
          break;
      }
    }

    endCb();
  }
}