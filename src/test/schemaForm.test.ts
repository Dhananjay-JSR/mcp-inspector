import * as assert from "assert";
import {
  buildToolArguments,
  buildToolFields,
  parseRawArguments,
} from "../tools/schemaForm";

suite("Schema forms", () => {
  suite("field mapping", () => {
    const schema = {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
        limit: { type: "integer", default: 10 },
        ratio: { type: "number", default: 0.5 },
        exact: { type: "boolean", default: false },
        mode: { type: "string", enum: ["fast", "thorough"] },
        filters: {
          type: "object",
          properties: { tag: { type: "string" } },
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["query", "mode"],
    };

    test("maps each property to a control that matches its type", () => {
      const fields = buildToolFields(schema);

      assert.deepStrictEqual(
        fields.map((field) => [field.name, field.control]),
        [
          ["query", "string"],
          ["limit", "integer"],
          ["ratio", "number"],
          ["exact", "boolean"],
          ["mode", "enum"],
          ["filters", "json"],
          ["tags", "json"],
        ],
      );
    });

    test("carries required, description, enum values, and defaults", () => {
      const fields = buildToolFields(schema);
      const byName = new Map(fields.map((field) => [field.name, field]));

      assert.strictEqual(byName.get("query")?.required, true);
      assert.strictEqual(byName.get("query")?.description, "Search text");
      assert.strictEqual(byName.get("limit")?.required, false);
      assert.strictEqual(byName.get("limit")?.defaultValue, 10);
      assert.strictEqual(byName.get("exact")?.defaultValue, false);
      assert.deepStrictEqual(byName.get("mode")?.enumValues, [
        "fast",
        "thorough",
      ]);
      assert.strictEqual(byName.get("filters")?.container, "object");
      assert.strictEqual(byName.get("tags")?.container, "array");
    });

    test("treats a schema without properties or required as empty", () => {
      assert.deepStrictEqual(buildToolFields({ type: "object" }), []);
      assert.deepStrictEqual(buildToolFields(null), []);

      const optional = buildToolFields({
        type: "object",
        properties: { a: { type: "string" } },
        required: "nope",
      });
      assert.strictEqual(optional[0].required, false);
    });

    test("falls back to a string control for unknown or untyped properties", () => {
      const fields = buildToolFields({
        type: "object",
        properties: {
          anything: {},
          nullable: { type: ["null", "number"] },
        },
      });

      assert.deepStrictEqual(
        fields.map((field) => [field.name, field.control]),
        [
          ["anything", "string"],
          ["nullable", "number"],
        ],
      );
    });
  });

  suite("argument building", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
        ratio: { type: "number" },
        enabled: { type: "boolean" },
        disabled: { type: "boolean" },
        note: { type: "string" },
      },
    };

    test("coerces controls into the types the schema declares", () => {
      const { arguments: args, errors } = buildToolArguments(schema, {
        name: "Ada",
        count: "3",
        ratio: "1.5",
        enabled: true,
        disabled: false,
      });

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(args, {
        name: "Ada",
        count: 3,
        ratio: 1.5,
        enabled: true,
        disabled: false,
      });
    });

    test("keeps false, zero, and numeric-looking strings intact", () => {
      const { arguments: args } = buildToolArguments(schema, {
        name: "42",
        count: "0",
        disabled: "false",
      });

      assert.strictEqual(args.name, "42");
      assert.strictEqual(args.count, 0);
      assert.strictEqual(args.disabled, false);
    });

    test("omits empty optional fields and ignores unknown values", () => {
      const { arguments: args, errors } = buildToolArguments(schema, {
        name: "",
        note: "   ",
        secret: "not-in-the-schema",
      });

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(args, {});
    });
  });

  suite("validation", () => {
    const schema = {
      type: "object",
      properties: {
        query: { type: "string" },
        mode: { type: "string", enum: ["fast", "thorough"] },
        level: { type: "integer", enum: [1, 2, 3] },
        count: { type: "integer" },
        ratio: { type: "number" },
        enabled: { type: "boolean" },
      },
      required: ["query", "mode"],
    };

    test("reports missing required fields and keeps the valid ones", () => {
      const { arguments: args, errors } = buildToolArguments(schema, {
        count: "1",
      });

      assert.deepStrictEqual(
        errors.map((error) => error.name).sort(),
        ["mode", "query"],
      );
      assert.match(
        errors.find((error) => error.name === "query")?.message ?? "",
        /required/,
      );
      assert.deepStrictEqual(args, { count: 1 });
    });

    test("treats whitespace as missing for a required field", () => {
      const { errors } = buildToolArguments(schema, {
        query: "   ",
        mode: "fast",
      });

      assert.deepStrictEqual(
        errors.map((error) => error.name),
        ["query"],
      );
    });

    test("rejects values outside an enum", () => {
      const { errors } = buildToolArguments(schema, {
        query: "x",
        mode: "slow",
      });

      assert.deepStrictEqual(errors, [
        { name: "mode", message: "must be one of: fast, thorough" },
      ]);
    });

    test("accepts numeric enum values and returns the declared type", () => {
      const { arguments: args, errors } = buildToolArguments(schema, {
        query: "x",
        mode: "fast",
        level: "2",
      });

      assert.deepStrictEqual(errors, []);
      assert.strictEqual(args.level, 2);
    });

    test("rejects malformed numbers, integers, and booleans", () => {
      const { errors } = buildToolArguments(schema, {
        query: "x",
        mode: "fast",
        count: "3.5",
        ratio: "not-a-number",
        enabled: "maybe",
      });

      assert.deepStrictEqual(
        errors.map((error) => error.name).sort(),
        ["count", "enabled", "ratio"],
      );
      assert.strictEqual(
        errors.find((error) => error.name === "count")?.message,
        "must be a whole number",
      );
      assert.strictEqual(
        errors.find((error) => error.name === "ratio")?.message,
        "must be a number",
      );
      assert.strictEqual(
        errors.find((error) => error.name === "enabled")?.message,
        "must be true or false",
      );
    });

    test("a required boolean is satisfied by false", () => {
      const { arguments: args, errors } = buildToolArguments(
        {
          type: "object",
          properties: { strict: { type: "boolean" } },
          required: ["strict"],
        },
        { strict: false },
      );

      assert.deepStrictEqual(errors, []);
      assert.strictEqual(args.strict, false);
    });
  });

  suite("structured arguments", () => {
    const schema = {
      type: "object",
      properties: {
        filters: {
          type: "object",
          properties: { tag: { type: "string" } },
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["filters"],
    };

    test("parses JSON text for object and array fields", () => {
      const { arguments: args, errors } = buildToolArguments(schema, {
        filters: '{"tag":"release"}',
        tags: '["a","b"]',
      });

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(args, {
        filters: { tag: "release" },
        tags: ["a", "b"],
      });
    });

    test("accepts values that are already parsed", () => {
      const { arguments: args, errors } = buildToolArguments(schema, {
        filters: { tag: "release" },
        tags: ["a"],
      });

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(args, {
        filters: { tag: "release" },
        tags: ["a"],
      });
    });

    test("reports invalid JSON", () => {
      const { errors } = buildToolArguments(schema, { filters: "{nope" });

      assert.deepStrictEqual(errors, [
        { name: "filters", message: "must be valid JSON" },
      ]);
    });

    test("requires the parsed value to match the declared container", () => {
      const { errors } = buildToolArguments(schema, {
        filters: "[]",
        tags: '{"a":1}',
      });

      assert.deepStrictEqual(errors, [
        { name: "filters", message: "must be a JSON object" },
        { name: "tags", message: "must be a JSON array" },
      ]);
    });

    test("reports a missing required structured field", () => {
      const { errors } = buildToolArguments(schema, { filters: "" });

      assert.deepStrictEqual(errors, [
        { name: "filters", message: "is required" },
      ]);
    });
  });

  suite("raw JSON", () => {
    const schema = {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "integer" },
        mode: { type: "string", enum: ["fast", "slow"] },
      },
      required: ["query", "mode"],
    };

    test("passes a JSON object through without coercion", () => {
      const { arguments: args, errors } = parseRawArguments(
        '{"query":"x","count":7,"mode":"fast","extra":true}',
        schema,
      );

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(args, {
        query: "x",
        count: 7,
        mode: "fast",
        extra: true,
      });
    });

    test("keeps raw values exactly as written", () => {
      const { arguments: args, errors } = parseRawArguments(
        '{"query":"x","mode":"fast","count":"5"}',
        schema,
      );

      assert.deepStrictEqual(errors, []);
      assert.strictEqual(args.count, "5");
    });

    test("treats empty text as an empty object and enforces required", () => {
      const { errors } = parseRawArguments("   ", schema);

      assert.deepStrictEqual(
        errors.map((error) => error.name).sort(),
        ["mode", "query"],
      );
    });

    test("reports invalid JSON", () => {
      const { arguments: args, errors } = parseRawArguments("{nope", schema);

      assert.deepStrictEqual(args, {});
      assert.deepStrictEqual(errors, [
        { name: "", message: "Arguments must be valid JSON" },
      ]);
    });

    test("rejects JSON that is not an object", () => {
      const expected = [
        { name: "", message: "Arguments must be a JSON object" },
      ];

      assert.deepStrictEqual(parseRawArguments("[1,2]", schema).errors, expected);
      assert.deepStrictEqual(parseRawArguments("null", schema).errors, expected);
      assert.deepStrictEqual(parseRawArguments('"text"', schema).errors, expected);
    });

    test("validates enum membership without rewriting the value", () => {
      const { arguments: args, errors } = parseRawArguments(
        '{"query":"x","mode":"turbo"}',
        schema,
      );

      assert.deepStrictEqual(errors, [
        { name: "mode", message: "must be one of: fast, slow" },
      ]);
      assert.strictEqual(args.mode, "turbo");
    });
  });
});
