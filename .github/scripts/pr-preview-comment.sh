#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?}"
: "${REPO:?}"
: "${PR_NUMBER:?}"
: "${RUN_ID:?}"
: "${PR_BRANCH:?}"

marker="<!-- mcp-inspector-preview -->"
run_url="https://github.com/${REPO}/actions/runs/${RUN_ID}"
safe_branch=$(printf '%s' "${PR_BRANCH}" | tr -cd 'A-Za-z0-9._/-')
codespaces_url="https://codespaces.new/${REPO}/tree/${safe_branch}?quickstart=1"

body=$(cat <<EOF
${marker}
## Test this pull request

### Desktop (VSIX)

\`\`\`bash
gh run download ${RUN_ID} -n mcp-inspector-vsix
code --profile "MCP PR ${PR_NUMBER}" --install-extension mcp--inspector-*.vsix
code --profile "MCP PR ${PR_NUMBER}"
\`\`\`

Or download the \`mcp-inspector-vsix\` artifact from [this run](${run_url}).

### Web (live, Codespaces)

1. Open <${codespaces_url}>.
2. In the terminal, start the full VS Code Web with this branch's extension:

\`\`\`bash
yarn install
yarn compile-web
npx vscode-test-web --browser none --host 0.0.0.0 --port 3000 --extensionDevelopmentPath=.
\`\`\`

3. Open the forwarded **3000** port. Set it to **Public** in the Ports tab if you need to share it.

### Web (local)

\`\`\`bash
yarn test:web
# or
yarn compile-web
npx vscode-test-web --browser chromium --extensionDevelopmentPath=. --open-devtools
\`\`\`

vscode.dev cannot sideload a hosted PR build: its CSP allows only Marketplace/CDN origins and localhost. The Codespaces path runs the whole editor, so the extension loads without a sideload. Desktop-only STDIO and custom-TLS features need the VSIX; browser CORS needs the web build.
EOF
)

existing=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" --paginate \
  --jq '.[] | select(.user.login == "github-actions[bot]" and (.body | contains("<!-- mcp-inspector-preview -->"))) | .id' \
  | head -n 1)

if [ -n "${existing}" ]; then
  gh api -X PATCH "repos/${REPO}/issues/comments/${existing}" -f body="${body}" >/dev/null
  echo "Updated preview comment ${existing}"
else
  gh api -X POST "repos/${REPO}/issues/${PR_NUMBER}/comments" -f body="${body}" >/dev/null
  echo "Created preview comment"
fi
