import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import type { CallToolResult, Tool } from "@modelcontextprotocol/client";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import {
  DEFAULT_CLIENT_INFO,
  analyze,
  computeVerdict,
  createRecording,
  recordedTransport,
  uiClientCapabilities,
  viewChecks,
} from "@dhananjay-jsr/mcp-inspector-core";
import type {
  Finding,
  RenderFacts,
  ServerIdentity,
  TimelineEvent,
  Verdict,
} from "@dhananjay-jsr/mcp-inspector-core";
import { createTransport, transportKinds } from "./server";
import type { ServerSpec } from "./server";

export interface RenderOptions {
  spec: ServerSpec;
  tool?: string;
  args: Record<string, unknown>;
  outDir: string;
  timeoutMs?: number;
}

export interface RenderResult {
  server?: ServerIdentity;
  findings: Finding[];
  verdict: Verdict;
  height: number;
  files: {
    screenshot: string;
    timeline: string;
    findings: string;
  };
  recording: TimelineEvent[];
}

type Json = any;

function uiUriOf(tool: Tool): string | undefined {
  const meta = (tool as Json)._meta;
  return meta?.ui?.resourceUri ?? meta?.["ui/resourceUri"];
}

function cspOf(tool: Tool, content: Json): Json {
  return (tool as Json)._meta?.ui?.csp ?? content._meta?.ui?.csp;
}

function visibilityOf(tool: Tool): string[] | undefined {
  const visibility = (tool as Json)._meta?.ui?.visibility;
  return Array.isArray(visibility) ? visibility : undefined;
}

function viewHtml(contents: Json[]): string {
  const content = contents[0];
  if (!content) {
    throw new Error("resources/read returned no content.");
  }
  if (typeof content.text === "string") {
    return content.text;
  }
  if (typeof content.blob === "string") {
    return Buffer.from(content.blob, "base64").toString("utf8");
  }
  throw new Error("resources/read returned neither text nor blob.");
}

async function connect(spec: ServerSpec) {
  const recording = createRecording();
  let lastError: unknown;

  for (const kind of transportKinds(spec)) {
    const client = new Client(DEFAULT_CLIENT_INFO, {
      capabilities: uiClientCapabilities(),
    });

    try {
      await client.connect(
        recordedTransport(createTransport(spec, kind), recording),
      );
      return { client, recording };
    } catch (error) {
      lastError = error;
      recording.events.length = 0;
      await client.close().catch(() => {});
    }
  }

  throw new Error(
    lastError instanceof Error ? lastError.message : String(lastError),
  );
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      `Could not launch a browser: ${error instanceof Error ? error.message : String(error)}\n` +
        "Install Chrome, or run `npx playwright install chromium`.",
    );
  }
}

function hostPageScript(): string {
  return readFileSync(join(__dirname, "host-page.js"), "utf8");
}

export async function render(options: RenderOptions): Promise<RenderResult> {
  const { client, recording } = await connect(options.spec);

  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    const tools = (await client.listTools()).tools;
    const tool =
      (options.tool
        ? tools.find((candidate) => candidate.name === options.tool)
        : tools.find((candidate) => uiUriOf(candidate))) ??
      tools.find((candidate) => uiUriOf(candidate));

    if (!tool) {
      throw new Error(
        options.tool
          ? `Tool ${options.tool} was not found.`
          : "No tool declares _meta.ui.resourceUri.",
      );
    }

    const uri = uiUriOf(tool);
    if (!uri) {
      throw new Error(`${tool.name} does not declare a UI resource.`);
    }

    const resource = await client.readResource({ uri });
    const content = resource.contents[0] as Json;
    const html = viewHtml(resource.contents as Json[]);
    const csp = cspOf(tool, content);
    const result = (await client.callTool({
      name: tool.name,
      arguments: options.args,
    })) as CallToolResult;

    browser = await launch();
    page = await browser.newPage({ viewport: { width: 900, height: 800 } });

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    const toolsByName = new Map(tools.map((candidate) => [candidate.name, candidate]));
    await page.exposeBinding(
      "__hostCall",
      async (_source, method: string, params: Json) => {
        if (method === "tools/call") {
          const target = toolsByName.get(params?.name);
          const visibility = target ? visibilityOf(target) : undefined;
          if (visibility && !visibility.includes("app")) {
            throw new Error(`${params?.name} is not visible to apps`);
          }
          return await client.callTool({
            name: params?.name,
            arguments: params?.arguments ?? {},
          });
        }
        if (method === "resources/read") {
          return await client.readResource({ uri: params?.uri });
        }
        throw new Error(`Unsupported host call: ${method}`);
      },
    );

    await page.setContent(
      '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>',
    );
    await page.addScriptTag({ content: hostPageScript() });
    await page.evaluate(
      ({ html, csp }) => (window as Json).__mount(html, csp),
      { html, csp },
    );

    const initialized = await page
      .waitForFunction("window.__state && window.__state.initialized === true", undefined, {
        timeout: options.timeoutMs ?? 5000,
        polling: 50,
      })
      .then(() => true)
      .catch(() => false);

    if (initialized) {
      await page
        .waitForFunction(
          "window.__state && window.__state.initializedNotification === true",
          undefined,
          { timeout: 1500, polling: 50 },
        )
        .catch(() => {});

      await page.evaluate(
        (args) => (window as Json).__send("ui/notifications/tool-input", { arguments: args }),
        options.args,
      );
      await page.evaluate(
        (callResult) => (window as Json).__send("ui/notifications/tool-result", callResult),
        result,
      );

      await page
        .waitForFunction("(window.__state && window.__state.height) > 0", undefined, {
          timeout: 3000,
          polling: 50,
        })
        .catch(() => {});

      await page
        .evaluate(() => (window as Json).__request("ping", {}, 1500))
        .catch(() => {});
    }

    await page.waitForTimeout(250);

    const facts = await page.evaluate(() => (window as Json).__finalize());

    for (const event of facts.events as Array<TimelineEvent & { t: number }>) {
      recording.events.push({
        t: Math.max(0, event.t - recording.startedAt),
        channel: "view",
        dir: event.dir,
        msg: event.msg,
      });
    }
    recording.events.sort((a, b) => a.t - b.t);

    const renderFacts: RenderFacts = {
      recording,
      height: facts.height,
      initialized: facts.initialized,
      initializedNotification: facts.initializedNotification,
      pageErrors: [...pageErrors, ...facts.pageErrors],
      consoleErrors: [...consoleErrors, ...facts.consoleErrors],
      cspViolations: facts.cspViolations,
      unansweredRequests: facts.unansweredRequests,
      hostCapabilities: facts.hostCapabilities,
      viewRequests: facts.viewRequests,
      tool: { name: tool.name, visibility: visibilityOf(tool) },
      toolCallFailures: facts.toolCallFailures,
    };

    const preflight = analyze(recording);
    const findings = [...preflight.findings, ...viewChecks(renderFacts)];
    const verdict = computeVerdict(recording, findings);

    mkdirSync(options.outDir, { recursive: true });
    const screenshot = join(options.outDir, "view.png");
    const timeline = join(options.outDir, "timeline.ndjson");
    const findingsPath = join(options.outDir, "findings.json");

    try {
      await page.locator("#app").screenshot({ path: screenshot });
    } catch {
      await page.screenshot({ path: screenshot, fullPage: true });
    }

    writeFileSync(
      timeline,
      recording.events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );

    const document = {
      schema: "mcp-inspector/apps-render@1",
      server: preflight.server ?? {},
      verdict,
      findings,
      height: facts.height,
      files: { screenshot, timeline, findings: findingsPath },
    };
    writeFileSync(findingsPath, JSON.stringify(document, null, 2) + "\n");

    return {
      server: preflight.server,
      findings,
      verdict,
      height: facts.height,
      files: { screenshot, timeline, findings: findingsPath },
      recording: recording.events,
    };
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await client.close().catch(() => {});
  }
}
