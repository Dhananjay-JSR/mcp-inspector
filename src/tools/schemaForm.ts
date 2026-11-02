/**
 * Pure schema handling shared by the desktop and web inspectors. Nothing in
 * this module imports `vscode`, so the same rules apply in both hosts.
 */

export type FieldControl =
	| "string"
	| "number"
	| "integer"
	| "boolean"
	| "enum"
	| "json";

export type JsonContainer = "object" | "array";

export interface ToolField {
	name: string;
	control: FieldControl;
	required: boolean;
	description?: string;
	enumValues?: unknown[];
	defaultValue?: unknown;
	container?: JsonContainer;
}

export interface ValidationError {
	/** Field name, or an empty string for a whole-form problem. */
	name: string;
	message: string;
}

export interface BuiltArguments {
	arguments: Record<string, unknown>;
	errors: ValidationError[];
}

interface NormalizedSchema {
	properties: Record<string, unknown>;
	required: string[];
}

type Coerced = { ok: true; value: unknown } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tolerates the loose JSON that servers put on the wire. */
function normalizeSchema(schema: unknown): NormalizedSchema {
	const source = isRecord(schema) ? schema : {};
	const properties = isRecord(source.properties) ? source.properties : {};
	const required = Array.isArray(source.required)
		? source.required.filter((name): name is string => typeof name === "string")
		: [];

	return { properties, required };
}

function propertyType(property: unknown): string | undefined {
	if (!isRecord(property)) {
		return undefined;
	}

	const type = property.type;
	if (Array.isArray(type)) {
		const named = type.find(
			(entry): entry is string => typeof entry === "string" && entry !== "null",
		);
		return named;
	}

	return typeof type === "string" ? type : undefined;
}

function fieldFor(
	name: string,
	property: unknown,
	required: boolean,
): ToolField {
	const spec = isRecord(property) ? property : {};
	const type = propertyType(spec);
	const enumValues =
		Array.isArray(spec.enum) && spec.enum.length > 0 ? spec.enum : undefined;

	let control: FieldControl;
	if (enumValues) {
		control = "enum";
	} else if (type === "boolean") {
		control = "boolean";
	} else if (type === "integer") {
		control = "integer";
	} else if (type === "number") {
		control = "number";
	} else if (type === "object" || type === "array") {
		control = "json";
	} else {
		control = "string";
	}

	const field: ToolField = { name, control, required };
	if (typeof spec.description === "string" && spec.description.trim()) {
		field.description = spec.description;
	}
	if (enumValues) {
		field.enumValues = enumValues;
	}
	if ("default" in spec) {
		field.defaultValue = spec.default;
	}
	if (control === "json") {
		field.container = type === "array" ? "array" : "object";
	}

	return field;
}

/**
 * Describes how to render each top-level argument. Nested objects and arrays
 * become JSON fields; everything else gets a control that matches its type.
 */
export function buildToolFields(schema: unknown): ToolField[] {
	const { properties, required } = normalizeSchema(schema);

	return Object.entries(properties).map(([name, property]) =>
		fieldFor(name, property, required.includes(name)),
	);
}

/** Blank text means "not supplied"; a checkbox's `false` and a `0` do not. */
function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim() === "")
	);
}

function coerceField(field: ToolField, raw: unknown): Coerced {
	switch (field.control) {
		case "boolean": {
			if (typeof raw === "boolean") {
				return { ok: true, value: raw };
			}
			const text = String(raw).trim();
			if (text === "true") {
				return { ok: true, value: true };
			}
			if (text === "false") {
				return { ok: true, value: false };
			}
			return { ok: false, message: "must be true or false" };
		}
		case "number": {
			const value = typeof raw === "number" ? raw : Number(String(raw).trim());
			if (!Number.isFinite(value)) {
				return { ok: false, message: "must be a number" };
			}
			return { ok: true, value };
		}
		case "integer": {
			const value = typeof raw === "number" ? raw : Number(String(raw).trim());
			if (!Number.isInteger(value)) {
				return { ok: false, message: "must be a whole number" };
			}
			return { ok: true, value };
		}
		case "enum": {
			const values = field.enumValues ?? [];
			const text = String(raw).trim();
			const index = values.findIndex((value) => String(value) === text);
			if (index === -1) {
				return {
					ok: false,
					message: `must be one of: ${values.map(String).join(", ")}`,
				};
			}
			return { ok: true, value: values[index] };
		}
		case "json": {
			let value = raw;
			if (typeof raw === "string") {
				try {
					value = JSON.parse(raw);
				} catch {
					return { ok: false, message: "must be valid JSON" };
				}
			}
			if (field.container === "array") {
				return Array.isArray(value)
					? { ok: true, value }
					: { ok: false, message: "must be a JSON array" };
			}
			return isRecord(value)
				? { ok: true, value }
				: { ok: false, message: "must be a JSON object" };
		}
		case "string":
			return { ok: true, value: typeof raw === "string" ? raw : String(raw) };
		default:
			return { ok: true, value: raw };
	}
}

/**
 * Turns the values collected by the form into the argument object sent to the
 * server, coercing and validating each declared property. Undeclared values
 * are ignored, and empty optional fields are omitted.
 */
export function buildToolArguments(
	schema: unknown,
	values: Record<string, unknown>,
): BuiltArguments {
	const { properties, required } = normalizeSchema(schema);
	const source = isRecord(values) ? values : {};
	const args: Record<string, unknown> = {};
	const errors: ValidationError[] = [];

	for (const [name, property] of Object.entries(properties)) {
		const field = fieldFor(name, property, required.includes(name));
		const raw = source[name];
		if (isEmpty(raw)) {
			if (field.required) {
				errors.push({ name, message: "is required" });
			}
			continue;
		}

		const coerced = coerceField(field, raw);
		if (coerced.ok) {
			args[name] = coerced.value;
		} else {
			errors.push({ name, message: coerced.message });
		}
	}

	return { arguments: args, errors };
}

/** Raw mode keeps the JSON the user wrote; only required/enum are checked. */
function validateRawArguments(
	schema: unknown,
	values: Record<string, unknown>,
): BuiltArguments {
	const { properties, required } = normalizeSchema(schema);
	const errors: ValidationError[] = [];

	for (const name of required) {
		if (isEmpty(values[name])) {
			errors.push({ name, message: "is required" });
		}
	}

	for (const [name, property] of Object.entries(properties)) {
		if (!isRecord(property) || !Array.isArray(property.enum)) {
			continue;
		}

		const raw = values[name];
		if (isEmpty(raw)) {
			continue;
		}

		const field = fieldFor(name, property, required.includes(name));
		const coerced = coerceField(field, raw);
		if (!coerced.ok) {
			errors.push({ name, message: coerced.message });
		}
	}

	return { arguments: values, errors };
}

/**
 * Parses the raw-JSON editor. The text must be a JSON object; values are sent
 * as written, so numbers, arrays, and nested objects keep their JSON types.
 */
export function parseRawArguments(
	text: string,
	schema: unknown,
): BuiltArguments {
	const trimmed = typeof text === "string" ? text.trim() : "";
	if (!trimmed) {
		return validateRawArguments(schema, {});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return {
			arguments: {},
			errors: [{ name: "", message: "Arguments must be valid JSON" }],
		};
	}

	if (!isRecord(parsed)) {
		return {
			arguments: {},
			errors: [{ name: "", message: "Arguments must be a JSON object" }],
		};
	}

	return validateRawArguments(schema, parsed);
}
