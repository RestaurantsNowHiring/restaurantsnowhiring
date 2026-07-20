import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

type DefaultNode = DefaultTreeAdapterMap["node"];
type DefaultElement = DefaultTreeAdapterMap["element"];
type DefaultTextNode = DefaultTreeAdapterMap["textNode"];

export type CandidateLink = {
  url: string;
  text: string;
  source: "anchor";
};

function isElementNode(node: DefaultNode): node is DefaultElement {
  return "tagName" in node;
}

function isTextNode(node: DefaultNode): node is DefaultTextNode {
  return node.nodeName === "#text";
}

function getAttribute(node: DefaultElement, name: string): string | null {
  const attribute = node.attrs.find((attr) => attr.name.toLowerCase() === name);

  return attribute?.value ?? null;
}

function normalizeAnchorText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function getVisibleText(node: DefaultNode): string {
  if (isTextNode(node)) {
    return node.value;
  }

  if (!isElementNode(node) || node.tagName === "script" || node.tagName === "style") {
    return "";
  }

  return node.childNodes.map((childNode) => getVisibleText(childNode)).join(" ");
}

function resolveHttpUrl(href: string, baseUrl: string): string | null {
  if (href.trim().startsWith("#")) {
    return null;
  }

  try {
    const url = new URL(href, baseUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function collectAnchorLinks(
  node: DefaultNode,
  baseUrl: string,
  seenUrls: Set<string>,
  candidateLinks: CandidateLink[],
): void {
  if (isElementNode(node) && node.tagName === "a") {
    const href = getAttribute(node, "href");
    const url = href ? resolveHttpUrl(href, baseUrl) : null;

    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      candidateLinks.push({
        url,
        text: normalizeAnchorText(getVisibleText(node)),
        source: "anchor",
      });
    }
  }

  if ("childNodes" in node) {
    node.childNodes.forEach((childNode) =>
      collectAnchorLinks(childNode, baseUrl, seenUrls, candidateLinks),
    );
  }
}

export function extractCandidateLinks(html: string, baseUrl: string): CandidateLink[] {
  const documentFragment = parseFragment(html);
  const candidateLinks: CandidateLink[] = [];

  collectAnchorLinks(documentFragment, baseUrl, new Set<string>(), candidateLinks);

  return candidateLinks;
}
