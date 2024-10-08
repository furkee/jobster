import util from 'node:util';

type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';

export interface ILogger extends Pick<Console, LogLevel> {}

const COLORS: Record<LogLevel | 'reset', string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  log: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m', // Reset color
};

export class Logger implements ILogger {
  loggerName?: string;
  // @ts-ignore
  #fancyLogsEnabled = process.env.NODE_ENV !== 'production' && !!util.getCallSite;

  constructor(loggerName?: string) {
    this.loggerName = loggerName;
  }

  #getCallerData() {
    const sites: { functionName: string; scriptName: string; lineNumber: number; column: number }[] =
      // @ts-ignore
      util.getCallSite(3);
    return sites[2];
  }

  #log(level: LogLevel, message: any, ...optionalParams: any[]) {
    if (!this.#fancyLogsEnabled) {
      console[level](message, optionalParams);
      return;
    }

    const { scriptName, lineNumber } = this.#getCallerData();
    const fileName = this.loggerName ?? scriptName.split('/').pop();
    const timestamp = new Date().toISOString();
    const color = COLORS[level] || COLORS.info;
    const formattedMessage =
      typeof message === 'object' && message instanceof Error === false
        ? `${message.message || ''} - ${JSON.stringify(message, null, 2)}`
        : message instanceof Error
          ? message.message
          : message;
    const errorStack = message instanceof Error ? `\n${message.stack}` : '';
    const logOutput = `${color}[${level.toUpperCase()}] [${fileName}:${lineNumber}] - ${timestamp}${COLORS.reset} - ${formattedMessage} ${errorStack}`;

    console[level](logOutput, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.#log('debug', message, ...optionalParams);
  }

  info(message: any, ...optionalParams: any[]) {
    this.#log('info', message, ...optionalParams);
  }

  log(message: any, ...optionalParams: any[]) {
    this.#log('log', message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.#log('warn', message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.#log('error', message, ...optionalParams);
  }
}
