import chalk from "chalk";

enum LogLevel {
  DEBUG = "D",
  LOG = "L",
  INFO = "I",
  WARN = "W",
  ERROR = "E",
}

function prefix(group: string[], level: LogLevel): string {
  let s = `[${level}]`;
  s += `[${new Date().toISOString()}]`;

  if (group.length > 0) {
    s += `[${group.join(":")}]`;
  }

  switch (level) {
    case LogLevel.DEBUG:
      return chalk.gray(s + " ");
    case LogLevel.LOG:
      return chalk.blue(s + " ");
    case LogLevel.INFO:
      return chalk.magenta(s + " ");
    case LogLevel.WARN:
      return chalk.yellow(s + " ");
    case LogLevel.ERROR:
      return chalk.red(s + " ");
  }
}

function debug(
  group: string[] = [],
  message: string,
  ...optionalParams: any[]
): void {
  console.debug(prefix(group, LogLevel.DEBUG) + message, ...optionalParams);
}

function log(
  group: string[] = [],
  message: string,
  ...optionalParams: any[]
): void {
  console.log(prefix(group, LogLevel.LOG) + message, ...optionalParams);
}

function info(
  group: string[] = [],
  message: string,
  ...optionalParams: any[]
): void {
  console.info(prefix(group, LogLevel.INFO) + message, ...optionalParams);
}

function warn(
  group: string[] = [],
  message: string,
  ...optionalParams: any[]
): void {
  console.warn(prefix(group, LogLevel.WARN) + message, ...optionalParams);
}

function error(
  group: string[] = [],
  message: string,
  ...optionalParams: any[]
): void {
  console.error(prefix(group, LogLevel.ERROR) + message, ...optionalParams);
}

const konsole = {
  debug,
  log,
  info,
  warn,
  error,
};

export default konsole;
