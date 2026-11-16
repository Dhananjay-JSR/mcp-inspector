import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/client";

/** Who produced a message: the MCP server, a View, or the host. */
export type Channel = "server" | "view" | "host";

/** `out` is inspector → peer; `in` is peer → inspector. */
export type Direction = "in" | "out";

export interface TimelineEvent {
  /** Milliseconds since the recording started. */
  t: number;
  channel: Channel;
  dir: Direction;
  msg: JSONRPCMessage;
}

export interface Recording {
  startedAt: number;
  events: TimelineEvent[];
}

export function createRecording(now = Date.now()): Recording {
  return { startedAt: now, events: [] };
}

export function appendEvent(
  recording: Recording,
  channel: Channel,
  dir: Direction,
  msg: JSONRPCMessage,
  now = Date.now(),
): TimelineEvent {
  const event: TimelineEvent = { t: now - recording.startedAt, channel, dir, msg };
  recording.events.push(event);
  return event;
}

/**
 * Wrap a transport so every message in both directions lands in `recording`.
 * The wrapper delegates the rest of the `Transport` surface untouched.
 */
export function recordedTransport(
  inner: Transport,
  recording: Recording,
  channel: Channel = "server",
): Transport {
  let messageHandler: Transport["onmessage"];

  return {
    start: () => inner.start(),
    send: (message, options) => {
      appendEvent(recording, channel, "out", message);
      return inner.send(message, options);
    },
    close: () => inner.close(),
    get onmessage() {
      return messageHandler;
    },
    set onmessage(handler) {
      messageHandler = handler;
      inner.onmessage = handler
        ? (message, extra) => {
            appendEvent(recording, channel, "in", message);
            handler(message, extra);
          }
        : undefined;
    },
    get onclose() {
      return inner.onclose;
    },
    set onclose(handler) {
      inner.onclose = handler;
    },
    get onerror() {
      return inner.onerror;
    },
    set onerror(handler) {
      inner.onerror = handler;
    },
    get sessionId() {
      return inner.sessionId;
    },
    get hasPerRequestStream() {
      return inner.hasPerRequestStream;
    },
    setProtocolVersion: (version) => inner.setProtocolVersion?.(version),
    setSupportedProtocolVersions: (versions) => inner.setSupportedProtocolVersions?.(versions),
  };
}
