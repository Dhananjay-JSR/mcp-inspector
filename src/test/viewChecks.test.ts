import * as assert from "assert";
import { viewChecks } from "@dhananjay-jsr/mcp-inspector-core";
import type { Recording, RenderFacts, TimelineEvent } from "@dhananjay-jsr/mcp-inspector-core";

const INIT: TimelineEvent = {
	t: 1,
	channel: "view",
	dir: "in",
	msg: {
		jsonrpc: "2.0",
		id: 1,
		method: "ui/initialize",
		params: {
			protocolVersion: "2026-01-26",
			appInfo: { name: "fixture", version: "1.0.0" },
			appCapabilities: {},
		},
	} as never,
};

const INITIALIZED: TimelineEvent = {
	t: 2,
	channel: "view",
	dir: "in",
	msg: {
		jsonrpc: "2.0",
		method: "ui/notifications/initialized",
		params: {},
	} as never,
};

function sizeEvent(t: number): TimelineEvent {
	return {
		t,
		channel: "view",
		dir: "in",
		msg: {
			jsonrpc: "2.0",
			method: "ui/notifications/size-changed",
			params: { height: 200 },
		} as never,
	};
}

function facts(overrides: Partial<RenderFacts> = {}, events: TimelineEvent[] = [INIT, INITIALIZED, sizeEvent(3)]): RenderFacts {
	const recording: Recording = { startedAt: 0, events };

	return {
		recording,
		height: 200,
		initialized: true,
		initializedNotification: true,
		pageErrors: [],
		consoleErrors: [],
		cspViolations: [],
		unansweredRequests: [],
		toolCallFailures: [],
		...overrides,
	};
}

const ids = (result: Array<{ id: string }>) => result.map((finding) => finding.id);

suite("View checks", () => {
	test("VIEW001 when the View never initializes", () => {
		const result = viewChecks(facts({ initialized: false }, []));

		assert.ok(ids(result).includes("VIEW001"));
	});

	test("VIEW002 when ui/initialize is incomplete", () => {
		const bad: TimelineEvent = {
			...INIT,
			msg: { jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { appInfo: {} } } as never,
		};
		const result = viewChecks(facts({}, [bad, INITIALIZED, sizeEvent(3)]));

		assert.deepStrictEqual(ids(result), ["VIEW002"]);
	});

	test("VIEW003 when the initialized notification is missing", () => {
		const result = viewChecks(facts({ initializedNotification: false }, [INIT, sizeEvent(3)]));

		assert.deepStrictEqual(ids(result), ["VIEW003"]);
	});

	test("VIEW004 when no usable height is reported", () => {
		const result = viewChecks(facts({ height: 0 }, [INIT, INITIALIZED]));

		assert.deepStrictEqual(ids(result), ["VIEW004"]);
	});

	test("VIEW005 when size-changed repeats", () => {
		const events = [INIT, INITIALIZED, ...Array.from({ length: 8 }, (_, index) => sizeEvent(index + 3))];
		const result = viewChecks(facts({}, events));

		assert.deepStrictEqual(ids(result), ["VIEW005"]);
	});

	test("VIEW006 when the View throws", () => {
		const result = viewChecks(facts({ pageErrors: ["boom"] }));

		assert.deepStrictEqual(ids(result), ["VIEW006"]);
	});

	test("VIEW007 when the View violates the CSP", () => {
		const result = viewChecks(facts({ cspViolations: [{ blockedURI: "https://esm.sh/app.js" }] }));

		assert.deepStrictEqual(ids(result), ["VIEW007"]);
	});

	test("VIEW008 when the View uses an unadvertised capability", () => {
		const result = viewChecks(
			facts({
				hostCapabilities: { message: false },
				viewRequests: ["ui/message"],
			}),
		);

		assert.deepStrictEqual(ids(result), ["VIEW008"]);
	});

	test("VIEW009 when the View does not answer the host", () => {
		const result = viewChecks(facts({ unansweredRequests: ["ping"] }));

		assert.deepStrictEqual(ids(result), ["VIEW009"]);
	});

	test("VIEW010 when a View tools/call fails", () => {
		const result = viewChecks(facts({ toolCallFailures: ["roll_dice is not visible to apps"] }));

		assert.deepStrictEqual(ids(result), ["VIEW010"]);
	});
});
