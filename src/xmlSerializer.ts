import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

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

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false,
  suppressEmptyNode: false,
});

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
  const typeName = (request["_type"] as string | undefined) ?? "request";
  const payload = { ...request };
  delete payload["_type"];

  const doc = {
    [typeName]: {
      "@_xmlns": NS,
      ...payload,
    },
  };

  return `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`;
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
