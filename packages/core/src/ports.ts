/** Secret storage the shells provide: VS Code SecretStorage, a file, or memory. */
export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

/** The client name/version sent in initialize. */
export interface ClientInfo {
  name: string;
  version: string;
}

export const DEFAULT_CLIENT_INFO: ClientInfo = {
  name: "mcp-inspector",
  version: "0.0.0",
};

/** The subset of a cancellation token the transport needs. */
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

/** UI the transport needs; the VS Code and CLI shells implement it. */
export interface Notifier {
  info(message: string): void;
  withProgress<T>(
    title: string,
    task: (token: CancellationToken) => Promise<T>,
  ): PromiseLike<T>;
  openExternal(url: string): PromiseLike<void>;
}

export const noopNotifier: Notifier = {
  info() {},
  withProgress(_title, task) {
    return task({
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose() {} }),
    });
  },
  async openExternal() {},
};
