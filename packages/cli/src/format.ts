import type { AppsCheckResult, Finding } from "@dhananjay-jsr/mcp-inspector-core";

function serverLine(result: AppsCheckResult): string {
  const server = result.server;
  if (!server?.name) {
    return "server: unknown";
  }
  const version = server.version ? ` ${server.version}` : "";
  const protocol = server.protocolVersion ? ` (${server.protocolVersion})` : "";
  return `server: ${server.name}${version}${protocol}`;
}

function findingLines(finding: Finding): string[] {
  const lines = [
    `  ${finding.id}  ${finding.severity.padEnd(7)}  ${finding.title}`,
    `    ${finding.detail}`,
  ];
  if (finding.tool) {
    lines.push(`    tool: ${finding.tool}`);
  }
  if (finding.resourceUri) {
    lines.push(`    resource: ${finding.resourceUri}`);
  }
  lines.push(`    fix: ${finding.fix}`);
  return lines;
}

export function checkText(result: AppsCheckResult): string {
  const lines = ["MCP Inspector: apps check", serverLine(result)];

  if (result.connectError) {
    lines.push(`verdict: COULD NOT CONNECT`, `  ${result.connectError}`);
    return lines.join("\n");
  }

  lines.push(
    result.verdict.ok
      ? "verdict: OK"
      : `verdict: FAILED${result.verdict.stoppedAt ? ` at ${result.verdict.stoppedAt}` : ""}`,
    `  ${result.verdict.summary}`,
  );

  if (result.findings.length === 0) {
    lines.push("", "findings: none");
  } else {
    lines.push("", `findings: ${result.findings.length}`);
    for (const finding of result.findings) {
      lines.push(...findingLines(finding));
    }
  }

  return lines.join("\n");
}

export function toolsText(tools: Array<{ name?: string; description?: string }>): string {
  if (tools.length === 0) {
    return "No tools.";
  }
  return tools
    .map((tool) => `${tool.name ?? "(unnamed)"}${tool.description ? `  — ${tool.description}` : ""}`)
    .join("\n");
}

export function bodyText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
