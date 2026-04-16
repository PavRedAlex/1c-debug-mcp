import { XMLParser, XMLValidator } from "fast-xml-parser";

export const NS = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";

export class XmlParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "XmlParseError";
  }
}

// ---------------------------------------------------------------------------
// Manual XML builder — avoids fast-xml-parser encoding issues with Cyrillic
// ---------------------------------------------------------------------------

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildXmlNode(tag: string, value: unknown): string {
  if (value === null || value === undefined) {
    return `<${tag}/>`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => buildXmlNode(tag, item)).join("");
  }
  if (typeof value === "object") {
    const inner = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith("@_"))
      .map(([k, v]) => buildXmlNode(k, v))
      .join("");
    return `<${tag}>${inner}</${tag}>`;
  }
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) =>
    ["obj", "bp", "item", "callStack", "result", "expr", "stackItem"].includes(name),
  parseTagValue: true,
  parseAttributeValue: true,
});

/**
 * Serialize a request object to XML with the 1C debug namespace.
 * The root element name is derived from the object's `_type` property,
 * or defaults to "request".
 */
export function serialize(request: Record<string, unknown>): string {
  const payload = { ...request };
  delete payload["_type"];

  const inner = Object.entries(payload)
    .map(([k, v]) => buildXmlNode(k, v))
    .join("");

  // Platform expects root element "request" with the debug namespace
  return `<?xml version="1.0" encoding="UTF-8"?><request xmlns="${NS}">${inner}</request>`;
}

/**
 * Deserialize an XML string to a typed object.
 * Throws XmlParseError if the XML is invalid.
 */
export function deserialize<T = Record<string, unknown>>(xml: string): T {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new XmlParseError(
      `Invalid XML: ${validation.err.msg}`,
      xml,
    );
  }

  const parsed = parser.parse(xml) as Record<string, unknown>;

  // Skip the XML declaration key (?xml) and return the first real element
  const keys = Object.keys(parsed).filter((k) => k !== "?xml");
  if (keys.length === 0) {
    return {} as T;
  }

  const root = parsed[keys[0]];
  return (root ?? {}) as T;
}
