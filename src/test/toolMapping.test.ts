import * as assert from "assert";
import { toTool } from "@dhananjay-jsr/mcp-inspector-core";

suite("Tool mapping", () => {
	test("keeps the metadata MCP Apps depends on", () => {
		const tool = {
			name: "roll_dice",
			description: "Roll a die",
			inputSchema: { type: "object" },
			_meta: { ui: { resourceUri: "ui://dice/view.html" } },
			annotations: { readOnlyHint: true },
			outputSchema: { type: "object", properties: {} },
		};

		const mapped = toTool(tool);

		assert.deepStrictEqual(mapped._meta, tool._meta);
		assert.deepStrictEqual(mapped.annotations, tool.annotations);
		assert.deepStrictEqual(mapped.outputSchema, tool.outputSchema);
		assert.strictEqual(mapped.name, tool.name);
		assert.strictEqual(mapped.input_schema, tool.inputSchema);
	});

	test("omits fields the server did not send", () => {
		const mapped = toTool({ name: "ping", inputSchema: { type: "object" } });

		assert.strictEqual("_meta" in mapped, false);
		assert.strictEqual("annotations" in mapped, false);
		assert.strictEqual("outputSchema" in mapped, false);
	});
});
