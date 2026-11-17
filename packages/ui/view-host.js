import { on, send } from "./bridge.js";

const HOST_INFO = { name: "mcp-inspector", version: "1.0.0" };
const HOST_CAPABILITIES = {
  tools: { call: true },
  resources: { read: true },
  message: true,
  updateModelContext: true,
};

let active = null;

on("viewResponse", (data) => {
  if (active) {
    active.resolve(data);
  }
});

export function disposeView() {
  if (active) {
    active.dispose();
    active = null;
  }
}

/**
 * Mount a View in a sandboxed iframe and answer the MCP Apps host handshake.
 * Requests that need the server are forwarded through the extension with
 * `send("viewRequest", …)`; the reply arrives as `viewResponse`.
 */
export function mountView(container, payload) {
  disposeView();
  active = new ViewHost(container, payload);
  active.start();
}

class ViewHost {
  constructor(container, payload) {
    this.container = container;
    this.html = payload.html;
    this.csp = payload.csp;
    this.args = payload.args || {};
    this.result = payload.result;
    this.onIssue = payload.onIssue;
    this.iframe = null;
    this.pending = new Map();
    this.nextId = 1;
    this.initialized = false;
    this.onMessage = this.handleMessage.bind(this);
    window.addEventListener("message", this.onMessage);
  }

  start() {
    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-modals allow-popups",
    );
    iframe.title = "MCP App";
    iframe.style.cssText = "display:block;width:100%;height:0;border:0;background:transparent";
    iframe.srcdoc = instrument(this.html, this.csp, this.args);
    this.container.replaceChildren(iframe);
    this.iframe = iframe;

    // The View may send ui/initialize before this point; the listener is
    // installed in the constructor, so it is ready as soon as the iframe runs.
  }

  dispose() {
    window.removeEventListener("message", this.onMessage);
    this.pending.clear();
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }

  post(message) {
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage(message, "*");
    }
  }

  respond(id, result) {
    this.post({ jsonrpc: "2.0", id, result });
  }

  fail(id, message) {
    this.post({ jsonrpc: "2.0", id, error: { code: -32603, message: String(message) } });
  }

  resolve(data) {
    const entry = this.pending.get(data && data.id);
    if (!entry) {
      return;
    }
    this.pending.delete(data.id);
    if (data.error) {
      entry.reject(new Error(data.error.message || "View request failed"));
    } else {
      entry.resolve(data.result);
    }
  }

  handleMessage(event) {
    if (!this.iframe || event.source !== this.iframe.contentWindow) {
      return;
    }

    const message = event.data;
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.__inspectorView) {
      this.onIssue?.(message.__inspectorView, message.data);
      return;
    }

    if (message.jsonrpc !== "2.0") {
      return;
    }

    if (message.id !== undefined && this.pending.has(message.id)) {
      this.resolve(message);
      return;
    }

    if (message.id !== undefined) {
      this.handleRequest(message);
      return;
    }

    if (message.method === "ui/notifications/initialized") {
      this.post({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-input",
        params: { arguments: this.args },
      });
      this.post({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: this.result,
      });
      return;
    }

    if (message.method === "ui/notifications/size-changed") {
      const height = Number(message.params && message.params.height) || 0;
      if (this.iframe) {
        this.iframe.style.height = Math.max(0, height) + "px";
      }
    }
  }

  handleRequest(message) {
    const method = message.method;

    if (method === "ui/initialize") {
      this.initialized = true;
      this.respond(message.id, {
        protocolVersion:
          (message.params && message.params.protocolVersion) || "2026-01-26",
        hostInfo: HOST_INFO,
        hostCapabilities: HOST_CAPABILITIES,
        hostContext: {
          theme: "light",
          displayMode: "inline",
          availableDisplayModes: ["inline"],
          platform: "web",
        },
      });
      return;
    }

    if (method === "tools/call" || method === "resources/read") {
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: (result) => this.respond(message.id, result),
        reject: (error) => this.fail(message.id, error.message),
      });
      send("viewRequest", { id, method, params: message.params });
      return;
    }

    this.respond(message.id, {});
  }
}

function instrument(html, csp, args) {
  const resource = domains(csp, ["resourceDomains", "baseUriDomains"]);
  const connect = domains(csp, ["connectDomains"]);
  const frames = domains(csp, ["frameDomains"]);
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' " + resource,
    "style-src 'unsafe-inline' " + resource,
    "img-src data: " + resource,
    "font-src " + resource,
    "media-src " + resource,
    "connect-src " + connect,
    "frame-src " + frames,
  ].join("; ");

  const head =
    '<meta http-equiv="Content-Security-Policy" content="' + policy + '">' +
    "<script>" +
    "(function(){" +
    "function post(k,d){try{parent.postMessage({__inspectorView:k,data:d},\"*\");}catch(e){}}" +
    'window.addEventListener("error",function(e){post("error",{message:e.message});});' +
    'window.addEventListener("unhandledrejection",function(e){var r=e.reason;post("error",{message:String(r&&r.message||r)});});' +
    'document.addEventListener("securitypolicyviolation",function(e){post("csp",{blockedURI:e.blockedURI,violatedDirective:e.violatedDirective});});' +
    'var original=console.error;console.error=function(){post("console",{text:Array.prototype.map.call(arguments,String).join(" ")});return original.apply(console,arguments);};' +
    "})();" +
    "</script>";

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (tag) => tag + "\n" + head);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (tag) => tag + "\n<head>" + head + "</head>");
  }
  return "<head>" + head + "</head>" + html;
}

function domains(csp, keys) {
  let values = [];
  if (csp) {
    for (const key of keys) {
      if (Array.isArray(csp[key])) {
        values = values.concat(csp[key]);
      }
    }
  }
  return values.join(" ");
}
