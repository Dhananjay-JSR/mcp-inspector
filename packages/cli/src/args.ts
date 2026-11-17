/** A problem with the command line; the CLI exits with code 3. */
export class UsageError extends Error {}

export type FlagValue = string | boolean | string[];

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, FlagValue>;
}

/** Small `--flag value` / `--flag=value` / `--` parser. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, FlagValue> = {};
  let literal = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (!literal && arg === "--") {
      literal = true;
      continue;
    }

    if (!literal && (arg === "-h" || arg === "--help")) {
      setFlag(flags, "help", true);
      continue;
    }

    if (!literal && arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const name = equals >= 0 ? arg.slice(2, equals) : arg.slice(2);
      if (!name) {
        throw new UsageError(`Invalid flag: ${arg}`);
      }

      if (equals >= 0) {
        setFlag(flags, name, arg.slice(equals + 1));
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        setFlag(flags, name, next);
        index++;
      } else {
        setFlag(flags, name, true);
      }
      continue;
    }

    positionals.push(arg);
  }

  return { positionals, flags };
}

function setFlag(flags: Record<string, FlagValue>, name: string, value: string | boolean): void {
  const existing = flags[name];
  if (existing === undefined) {
    flags[name] = value;
  } else if (Array.isArray(existing)) {
    existing.push(String(value));
  } else {
    flags[name] = [String(existing), String(value)];
  }
}

export function flagStrings(flags: Record<string, FlagValue>, name: string): string[] {
  const value = flags[name];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [String(value)];
}

export function flagString(
  flags: Record<string, FlagValue>,
  name: string,
): string | undefined {
  const value = flags[name];
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

export function flagBool(flags: Record<string, FlagValue>, name: string): boolean {
  return flags[name] === true;
}
