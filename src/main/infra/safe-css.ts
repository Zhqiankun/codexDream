export interface CssValidation {
  valid: boolean;
  empty: boolean;
  errors: string[];
  ruleCount: number;
  declarationCount: number;
}

export const SAFE_CSS_PARTS = [
  "root",
  "sidebar",
  "main",
  "titlebar",
  "header",
  "thread-tab",
  "home",
  "home-hero",
  "home-title",
  "home-card",
  "project-list",
  "thread",
  "message",
  "change-card",
  "activity",
  "composer",
  "composer-toolbar",
  "composer-submit",
  "dialog",
] as const;

const MAX_BYTES = 256 * 1024;
const MAX_RULES = 128;
const MAX_DECLARATIONS = 512;
const MAX_VALUE_CHARACTERS = 512;
const parts = new Set<string>(SAFE_CSS_PARTS);
const states = new Set(["hover", "focus-visible", "focus-within"]);
const variables = new Set([
  "--ds-theme-color-background",
  "--ds-theme-color-panel",
  "--ds-theme-color-sidebar-text",
  "--ds-theme-color-thread-tab-background",
  "--ds-theme-color-thread-tab-text",
  "--ds-theme-color-home-title-text",
  "--ds-theme-color-home-card-background",
  "--ds-theme-color-home-card-text",
  "--ds-theme-color-panel-alt",
  "--ds-theme-color-composer-text",
  "--ds-theme-color-assistant-panel",
  "--ds-theme-color-assistant-message-text",
  "--ds-theme-color-user-message-text",
  "--ds-theme-color-change-card-background",
  "--ds-theme-color-change-card-text",
  "--ds-theme-color-activity-background",
  "--ds-theme-color-activity-text",
  "--ds-theme-color-activity-muted",
  "--ds-theme-color-top-bar-background",
  "--ds-theme-color-top-bar-text",
  "--ds-theme-color-accent",
  "--ds-theme-color-accent-text",
  "--ds-theme-color-accent-alt",
  "--ds-theme-color-secondary",
  "--ds-theme-color-highlight",
  "--ds-theme-color-selection-text",
  "--ds-theme-color-text",
  "--ds-theme-color-muted",
  "--ds-theme-color-line",
  "--ds-theme-font-family",
  "--ds-theme-font-scale",
  "--ds-theme-surface-opacity",
  "--ds-theme-surface-blur",
  "--ds-theme-surface-radius",
  "--ds-theme-surface-border-alpha",
  "--ds-theme-surface-shadow",
  "--ds-theme-image-focus-x",
  "--ds-theme-image-focus-y",
  "--ds-theme-image-zoom",
  "--ds-theme-image-dim",
  "--ds-theme-image-task-intensity",
  "--ds-theme-density-scale",
  "--ds-theme-motion-level",
]);
const colorVariables = new Set(
  [...variables].filter((value) => value.includes("-color-")),
);
const colorProperties = new Set([
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
]);
const widthProperties = new Set([
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
]);
const styleProperties = new Set([
  "border-style",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
]);
const radiusProperties = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
]);
const spacingProperties = new Set(["gap", "row-gap", "column-gap"]);
const transitionProperties = new Set([
  ...colorProperties,
  ...widthProperties,
  ...radiusProperties,
  ...spacingProperties,
  "box-shadow",
  "opacity",
  "backdrop-filter",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
]);
const properties = new Set([
  ...transitionProperties,
  ...styleProperties,
  "font-family",
  "transition-duration",
  "transition-property",
]);
const selectorPattern =
  /^\[data-ds-part="([a-z]+(?:-[a-z]+)*)"\](?::([a-z-]+))?$/u;
const propertyPattern = /^[a-z][a-z-]*$/u;
const controlPattern =
  /[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const numberPattern = /^(?:-?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|0?\.[0-9]+))$/u;

export function validateSafeCss(css: string): CssValidation {
  if (!css.trim()) return valid(true, 0, 0);
  const errors: string[] = [];
  if (Buffer.byteLength(css, "utf8") > MAX_BYTES) errors.push("css-too-large");
  if (controlPattern.test(css)) errors.push("control-character");
  if (css.includes("/*") || css.includes("*/"))
    errors.push("comment-not-allowed");
  if (css.includes("\\")) errors.push("escape-not-allowed");
  if (errors.length) return invalid(errors, 0, 0);

  try {
    const parser = new SafeCssParser(css);
    const result = parser.parse();
    return valid(false, result.ruleCount, result.declarationCount);
  } catch (error) {
    return invalid(
      [error instanceof Error ? error.message : "syntax-invalid"],
      0,
      0,
    );
  }
}

class SafeCssParser {
  private index = 0;
  private ruleCount = 0;
  private declarationCount = 0;

  constructor(private readonly source: string) {}

  parse(): { ruleCount: number; declarationCount: number } {
    this.skipWhitespace();
    while (this.index < this.source.length) {
      this.parseRule();
      this.skipWhitespace();
    }
    if (this.ruleCount === 0) this.fail("stylesheet-empty");
    return {
      ruleCount: this.ruleCount,
      declarationCount: this.declarationCount,
    };
  }

  private parseRule(): void {
    const start = this.index;
    while (this.index < this.source.length && this.source[this.index] !== "{") {
      const value = this.source[this.index];
      if (value === "}" || value === ";" || value === "@")
        this.fail("rule-invalid");
      this.index += 1;
    }
    if (this.index >= this.source.length) this.fail("rule-unclosed");
    const selector = this.source.slice(start, this.index).trim();
    const match = selector.match(selectorPattern);
    if (!match || !parts.has(match[1]) || (match[2] && !states.has(match[2])))
      this.fail("selector-not-allowed");
    this.ruleCount += 1;
    if (this.ruleCount > MAX_RULES) this.fail("too-many-rules");
    this.index += 1;
    this.parseDeclarations();
  }

  private parseDeclarations(): void {
    const seen = new Set<string>();
    let ruleDeclarations = 0;
    while (true) {
      this.skipWhitespace();
      if (this.index >= this.source.length) this.fail("block-unclosed");
      if (this.source[this.index] === "}") {
        if (ruleDeclarations === 0) this.fail("declaration-empty");
        this.index += 1;
        return;
      }
      const propertyStart = this.index;
      while (
        this.index < this.source.length &&
        this.source[this.index] !== ":"
      ) {
        if (";{}@!".includes(this.source[this.index]))
          this.fail("declaration-invalid");
        this.index += 1;
      }
      if (this.index >= this.source.length) this.fail("declaration-incomplete");
      const property = this.source
        .slice(propertyStart, this.index)
        .trim()
        .toLowerCase();
      if (!propertyPattern.test(property) || !properties.has(property))
        this.fail("property-not-allowed");
      if (seen.has(property)) this.fail("property-duplicate");
      seen.add(property);
      this.index += 1;
      const valueStart = this.index;
      let depth = 0;
      while (this.index < this.source.length) {
        const value = this.source[this.index];
        if (value === "(") depth += 1;
        if (value === ")") {
          depth -= 1;
          if (depth < 0) this.fail("value-parentheses");
        }
        if (depth === 0 && (value === ";" || value === "}")) break;
        if ("{}[]@!\"'".includes(value)) this.fail("value-token");
        this.index += 1;
      }
      if (depth !== 0) this.fail("value-parentheses");
      const declarationValue = this.source.slice(valueStart, this.index).trim();
      if (
        !declarationValue ||
        declarationValue.length > MAX_VALUE_CHARACTERS ||
        !validatePropertyValue(property, declarationValue)
      )
        this.fail("value-not-allowed");
      ruleDeclarations += 1;
      this.declarationCount += 1;
      if (this.declarationCount > MAX_DECLARATIONS)
        this.fail("too-many-declarations");
      if (this.source[this.index] === ";") this.index += 1;
    }
  }

  private skipWhitespace(): void {
    while (
      this.index < this.source.length &&
      /[\t\n\r\f ]/u.test(this.source[this.index])
    )
      this.index += 1;
  }

  private fail(code: string): never {
    throw new Error(code);
  }
}

function validatePropertyValue(property: string, value: string): boolean {
  if (colorProperties.has(property)) return colorValue(value, property);
  if (widthProperties.has(property))
    return repeatedValues(value, 1, 4, (part) => zeroOrPx(part, 0, 4));
  if (styleProperties.has(property))
    return repeatedValues(value, 1, 4, (part) =>
      ["none", "solid", "dashed", "dotted"].includes(part.toLowerCase()),
    );
  if (radiusProperties.has(property))
    return (
      registeredVar(value, new Set(["--ds-theme-surface-radius"])) ||
      repeatedValues(value, 1, 4, (part) => zeroOrPx(part, 0, 28))
    );
  if (spacingProperties.has(property)) return zeroOrPx(value, 0, 24);
  if (property === "box-shadow") return shadowValue(value);
  if (property === "opacity")
    return (
      registeredVar(value, new Set(["--ds-theme-surface-opacity"])) ||
      numeric(value, 0.65, 1)
    );
  if (property === "backdrop-filter") return backdropFilterValue(value);
  if (property === "font-family") return fontFamilyValue(value);
  if (property === "font-size") return numeric(value, 12, 20, "px");
  if (property === "font-weight")
    return /^(?:400|500|600|700|normal|bold)$/iu.test(value);
  if (property === "line-height") return numeric(value, 1.1, 1.8);
  if (property === "letter-spacing")
    return value === "0" || numeric(value, 0, 2, "px");
  if (property === "transition-duration") return transitionDurationValue(value);
  if (property === "transition-property") return transitionPropertyValue(value);
  return false;
}

function colorValue(value: string, property: string): boolean {
  if (registeredVar(value, colorVariables)) return true;
  if (/^#[0-9a-f]{3}(?:[0-9a-f]|[0-9a-f]{3}(?:[0-9a-f]{2})?)?$/iu.test(value))
    return true;
  if (value.toLowerCase() === "currentcolor") return true;
  if (value.toLowerCase() === "transparent") return property !== "color";
  const functionMatch = value.match(/^(rgb|rgba)\((.*)\)$/iu);
  if (!functionMatch) return false;
  const values = splitTopLevel(functionMatch[2], ",");
  const expected = functionMatch[1].toLowerCase() === "rgb" ? 3 : 4;
  return Boolean(
    values &&
      values.length === expected &&
      values.slice(0, 3).every(colorChannel) &&
      (expected === 3 || alphaChannel(values[3])),
  );
}

function shadowValue(value: string): boolean {
  if (value.toLowerCase() === "none") return true;
  const shadows = splitTopLevel(value, ",");
  return Boolean(
    shadows &&
      shadows.length > 0 &&
      shadows.length <= 2 &&
      shadows.every((shadow) => {
        const values = splitWhitespace(shadow);
        if (!values) return false;
        if (values[0]?.toLowerCase() === "inset") values.shift();
        if (values.length < 3 || values.length > 5) return false;
        const color = values.pop();
        return Boolean(
          color &&
            colorValue(color, "box-shadow") &&
            values.length >= 2 &&
            values.length <= 4 &&
            zeroOrPx(values[0], -32, 32) &&
            zeroOrPx(values[1], -32, 32) &&
            (values[2] === undefined || zeroOrPx(values[2], 0, 48)) &&
            (values[3] === undefined || zeroOrPx(values[3], -8, 16)),
        );
      }),
  );
}

function backdropFilterValue(value: string): boolean {
  if (value.toLowerCase() === "none") return true;
  const filters = splitWhitespace(value);
  if (!filters || filters.length < 1 || filters.length > 4) return false;
  const seen = new Set<string>();
  for (let index = 0; index < filters.length; index += 1) {
    const match = filters[index].match(
      /^(blur|saturate|brightness|contrast)\(\s*(.+?)\s*\)$/iu,
    );
    if (!match || seen.has(match[1].toLowerCase())) return false;
    const name = match[1].toLowerCase();
    const argument = match[2].trim();
    seen.add(name);
    if (
      (name === "blur" &&
        (index !== 0 ||
          !(
            registeredVar(argument, new Set(["--ds-theme-surface-blur"])) ||
            zeroOrPx(argument, 0, 30)
          ))) ||
      (name === "saturate" && !numeric(argument, 0.5, 2)) ||
      ((name === "brightness" || name === "contrast") &&
        !numeric(argument, 0.8, 1.5))
    )
      return false;
  }
  return seen.has("blur");
}

function fontFamilyValue(value: string): boolean {
  const allowed = new Set([
    "system-ui",
    "-apple-system",
    "blinkmacsystemfont",
    "ui-sans-serif",
    "ui-rounded",
    "ui-serif",
    "ui-monospace",
    "sans-serif",
    "serif",
    "monospace",
  ]);
  const families = splitTopLevel(value, ",");
  return Boolean(
    families &&
      families.length <= 4 &&
      families.every((family) => allowed.has(family.toLowerCase())),
  );
}

function transitionDurationValue(value: string): boolean {
  const values = splitTopLevel(value, ",");
  return Boolean(
    values &&
      values.length <= 4 &&
      values.every((item) => {
        if (item === "0") return true;
        if (/ms$/iu.test(item)) return numeric(item.slice(0, -2), 0, 400);
        if (/s$/iu.test(item)) return numeric(item.slice(0, -1), 0, 0.4);
        return false;
      }),
  );
}

function transitionPropertyValue(value: string): boolean {
  const values = splitTopLevel(value, ",");
  return Boolean(
    values &&
      values.length <= 4 &&
      values.every((item) => transitionProperties.has(item.toLowerCase())),
  );
}

function repeatedValues(
  value: string,
  minimum: number,
  maximum: number,
  check: (item: string) => boolean,
): boolean {
  const values = splitWhitespace(value);
  return Boolean(
    values &&
      values.length >= minimum &&
      values.length <= maximum &&
      values.every(check),
  );
}

function splitTopLevel(value: string, separator: string): string[] | undefined {
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")") depth -= 1;
    if (depth < 0) return undefined;
    if (value[index] === separator && depth === 0) {
      values.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (depth !== 0) return undefined;
  values.push(value.slice(start).trim());
  return values;
}

function splitWhitespace(value: string): string[] | undefined {
  const values: string[] = [];
  let start = -1;
  let depth = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const item = value[index] ?? " ";
    if (item === "(") depth += 1;
    if (item === ")") depth -= 1;
    if (depth < 0) return undefined;
    const whitespace = /[\t\n\r\f ]/u.test(item);
    if (start === -1 && !whitespace) start = index;
    if (start !== -1 && whitespace && depth === 0) {
      values.push(value.slice(start, index));
      start = -1;
    }
  }
  return depth === 0 ? values : undefined;
}

function registeredVar(value: string, allowed = variables): boolean {
  const match = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/u);
  return Boolean(match && allowed.has(match[1]));
}

function colorChannel(value: string): boolean {
  if (value.endsWith("%")) return numeric(value.slice(0, -1), 0, 100);
  return /^(?:0|[1-9][0-9]{0,2})$/u.test(value) && Number(value) <= 255;
}

function alphaChannel(value: string): boolean {
  return value.endsWith("%")
    ? numeric(value.slice(0, -1), 0, 100)
    : numeric(value, 0, 1);
}

function zeroOrPx(value: string, minimum: number, maximum: number): boolean {
  return value === "0" || numeric(value, minimum, maximum, "px");
}

function numeric(
  value: string,
  minimum: number,
  maximum: number,
  unit = "",
): boolean {
  if (!value.endsWith(unit)) return false;
  const raw = unit ? value.slice(0, -unit.length) : value;
  if (!numberPattern.test(raw)) return false;
  const number = Number(raw);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

function valid(
  empty: boolean,
  ruleCount: number,
  declarationCount: number,
): CssValidation {
  return { valid: true, empty, errors: [], ruleCount, declarationCount };
}

function invalid(
  errors: string[],
  ruleCount: number,
  declarationCount: number,
): CssValidation {
  return {
    valid: false,
    empty: false,
    errors: [...new Set(errors)],
    ruleCount,
    declarationCount,
  };
}
