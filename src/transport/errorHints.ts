export interface FailureDescription {
  message: string;
  details: string;
  corsLikely: boolean;
}

function endpointSuggestion(endpoint: URL | null): string {
  if (!endpoint) {
    return "";
  }
  if (endpoint.pathname === "/" || endpoint.pathname === "") {
    return ` Try ${endpoint.origin}/mcp.`;
  }
  return "";
}

/**
 * Turns a raw transport error into a sentence the user can act on, while
 * keeping the original text for the details disclosure.
 */
export function describeFailure(
  raw: string,
  endpoint: URL | null,
  corsLikely = false,
): FailureDescription {
  if (corsLikely) {
    return {
      message: "Could not reach the server. The browser blocked this cross-origin request.",
      details: raw,
      corsLikely: true,
    };
  }

  if (/405|method not allowed/i.test(raw)) {
    return {
      message: `The server rejected the request method (405).${
        endpointSuggestion(endpoint) || " Check the endpoint path."
      }`,
      details: raw,
      corsLikely: false,
    };
  }

  if (/404|not found/i.test(raw)) {
    return {
      message: `The endpoint was not found (404).${
        endpointSuggestion(endpoint) || " Check the URL path."
      }`,
      details: raw,
      corsLikely: false,
    };
  }

  if (/401|unauthorized/i.test(raw)) {
    return {
      message: "The server rejected the credentials (401). Check the Authorization header.",
      details: raw,
      corsLikely: false,
    };
  }

  if (/403|forbidden/i.test(raw)) {
    return {
      message: "The server refused the request (403). The token may not have access.",
      details: raw,
      corsLikely: false,
    };
  }

  return { message: raw, details: raw, corsLikely: false };
}
