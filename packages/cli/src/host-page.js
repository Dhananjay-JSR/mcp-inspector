// Browser-side MCP Apps host used by `apps render`. It mounts one View in a
// sandboxed iframe, answers the View handshake, forwards tools/call to the MCP
// server through a Playwright binding, and records every message.
(function () {
  "use strict";

  var HOST_INFO = { name: "mcp-inspector", version: "1.0.0" };
  var HOST_CAPABILITIES = {
    tools: { call: true },
    resources: { read: true },
    message: true,
    updateModelContext: true,
  };

  var state = {
    iframe: null,
    events: [],
    pageErrors: [],
    consoleErrors: [],
    cspViolations: [],
    toolCallFailures: [],
    unansweredRequests: [],
    viewRequests: [],
    height: 0,
    initialized: false,
    initializedNotification: false,
    nextId: 1,
    pending: new Map(),
    hostCapabilities: HOST_CAPABILITIES,
  };

  window.__state = state;

  function record(dir, msg) {
    state.events.push({ t: Date.now(), dir: dir, msg: msg });
  }

  function toView(msg) {
    if (!state.iframe || !state.iframe.contentWindow) {
      return;
    }
    record("out", msg);
    state.iframe.contentWindow.postMessage(msg, "*");
  }

  function respond(id, result) {
    toView({ jsonrpc: "2.0", id: id, result: result });
  }

  function fail(id, message) {
    toView({
      jsonrpc: "2.0",
      id: id,
      error: { code: -32603, message: String(message) },
    });
  }

  window.__inspectorEvent = function (kind, data) {
    if (kind === "pageError") {
      state.pageErrors.push(data && data.message ? data.message : String(data));
    } else if (kind === "csp") {
      state.cspViolations.push(data || {});
    } else if (kind === "console" && data && data.level === "error") {
      state.consoleErrors.push(data.text);
    }
  };

  function instrument(html, csp) {
    var resource = domainList(csp, ["resourceDomains", "baseUriDomains"]);
    var connect = domainList(csp, ["connectDomains"]);
    var frames = domainList(csp, ["frameDomains"]);
    var policy = [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' " + resource,
      "style-src 'unsafe-inline' " + resource,
      "img-src data: " + resource,
      "font-src " + resource,
      "media-src " + resource,
      "connect-src " + connect,
      "frame-src " + frames,
    ].join("; ");

    var head =
      '<meta http-equiv="Content-Security-Policy" content="' + policy + '">' +
      '<script>' +
      '(function(){' +
      'function post(k,d){try{parent.__inspectorEvent(k,d);}catch(e){}}' +
      'window.addEventListener("error",function(e){post("pageError",{message:e.message,source:e.filename,line:e.lineno});});' +
      'window.addEventListener("unhandledrejection",function(e){var r=e.reason;post("pageError",{message:String(r&&r.message||r)});});' +
      'document.addEventListener("securitypolicyviolation",function(e){post("csp",{blockedURI:e.blockedURI,violatedDirective:e.violatedDirective,sourceFile:e.sourceFile});});' +
      '["error","warn"].forEach(function(level){var original=console[level];console[level]=function(){var text=Array.prototype.map.call(arguments,function(a){try{return typeof a==="string"?a:JSON.stringify(a);}catch(e){return String(a);}}).join(" ");post("console",{level:level,text:text});return original.apply(console,arguments);};});' +
      '})();' +
      "</script>";

    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, function (tag) {
        return tag + "\n" + head;
      });
    }
    if (/<html[^>]*>/i.test(html)) {
      return html.replace(/<html[^>]*>/i, function (tag) {
        return tag + "\n<head>" + head + "</head>";
      });
    }
    return "<head>" + head + "</head>" + html;
  }

  function domainList(csp, keys) {
    var values = [];
    if (csp) {
      keys.forEach(function (key) {
        if (Array.isArray(csp[key])) {
          values = values.concat(csp[key]);
        }
      });
    }
    return values.join(" ");
  }

  window.__mount = function (html, csp) {
    var iframe = document.createElement("iframe");
    iframe.id = "app";
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-modals allow-popups",
    );
    iframe.style.cssText = "display:block;border:0;width:100%;height:0;background:transparent";
    iframe.srcdoc = instrument(html, csp);
    document.body.appendChild(iframe);
    state.iframe = iframe;
  };

  function resize() {
    if (state.iframe) {
      state.iframe.style.height = Math.max(0, state.height) + "px";
    }
  }

  window.__send = function (method, params) {
    toView({ jsonrpc: "2.0", method: method, params: params });
  };

  window.__request = function (method, params, timeout) {
    return new Promise(function (resolve, reject) {
      var id = state.nextId++;
      var timer = setTimeout(function () {
        state.pending.delete(id);
        state.unansweredRequests.push(method);
        reject(new Error("timeout waiting for " + method));
      }, timeout || 2000);

      state.pending.set(id, function (msg) {
        clearTimeout(timer);
        if (msg.error) {
          reject(new Error(msg.error.message || "view request failed"));
        } else {
          resolve(msg.result);
        }
      });

      toView({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  };

  window.__finalize = function () {
    return {
      height: state.height,
      initialized: state.initialized,
      initializedNotification: state.initializedNotification,
      events: state.events,
      pageErrors: state.pageErrors,
      consoleErrors: state.consoleErrors,
      cspViolations: state.cspViolations,
      hostCapabilities: state.hostCapabilities,
      viewRequests: Array.from(new Set(state.viewRequests)),
      toolCallFailures: state.toolCallFailures,
      unansweredRequests: state.unansweredRequests,
    };
  };

  window.addEventListener("message", function (event) {
    if (!state.iframe || event.source !== state.iframe.contentWindow) {
      return;
    }

    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") {
      return;
    }

    record("in", msg);

    if (msg.id !== undefined && state.pending.has(msg.id)) {
      var resolve = state.pending.get(msg.id);
      state.pending.delete(msg.id);
      resolve(msg);
      return;
    }

    if (msg.id !== undefined) {
      handleRequest(msg);
      return;
    }

    if (msg.method === "ui/notifications/initialized") {
      state.initializedNotification = true;
      return;
    }

    if (msg.method === "ui/notifications/size-changed") {
      state.height = (msg.params && msg.params.height) || 0;
      resize();
    }
  });

  function handleRequest(msg) {
    var method = msg.method;

    if (method === "ui/initialize") {
      state.initialized = true;
      respond(msg.id, {
        protocolVersion: (msg.params && msg.params.protocolVersion) || "2026-01-26",
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

    state.viewRequests.push(method);

    if (method === "tools/call" || method === "resources/read") {
      Promise.resolve(window.__hostCall(method, msg.params))
        .then(function (result) {
          if (method === "tools/call" && result && result.isError) {
            state.toolCallFailures.push("tools/call returned isError");
          }
          respond(msg.id, result);
        })
        .catch(function (error) {
          if (method === "tools/call") {
            state.toolCallFailures.push(String(error && error.message ? error.message : error));
          }
          fail(msg.id, error && error.message ? error.message : error);
        });
      return;
    }

    respond(msg.id, {});
  }
})();
