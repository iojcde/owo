export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
}

export class ClangParser {
  static parse(input: string) {
    const matched = input.matchAll(/(.+):(\d+):(\d+):\s([^:]*):\s(.+)/gm);
    const diagnostics: Diagnostic[] = [];

    let match: RegExpMatchArray | null;
    while ((match = matched.next().value)) {
      const [, file, line, column, severity, message] = match;
      diagnostics.push({
        file,
        line: +line,
        column: +column,
        severity,
        message,
      });
    }
    return diagnostics;
  }
}