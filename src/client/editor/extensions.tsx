// Nós estruturados do editor: citações ligadas à biblioteca (inline e em bloco) e referências cruzadas por ID.
// O texto da citação nunca é guardado no documento: é renderizado pelo motor APA a partir da biblioteca.
import { createContext, useContext } from "react";
import { Node } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

export interface RenderedCitation {
  text: string;
  html: string;
  warnings: string[];
}
export interface EditorCtx {
  citations: Record<string, RenderedCitation>;
  openCitation: (attrs: Record<string, any>, pos: number, block: boolean) => void;
  xrefLabel: (targetId: string) => string | null;
}
export const EditorContext = createContext<EditorCtx>({ citations: {}, openCitation: () => {}, xrefLabel: () => null });

const citationAttrs = {
  id: { default: null, rendered: false },
  mode: { default: "parenthetical", rendered: false },
  items: { default: [], rendered: false },
  quote: { default: null, rendered: false },
  secondaryAuthor: { default: null, rendered: false },
  secondaryYear: { default: null, rendered: false },
  narrative: { default: false, rendered: false },
  excerptId: { default: null, rendered: false },
};

function CitationView({ node, getPos }: NodeViewProps) {
  const ctx = useContext(EditorContext);
  const c = ctx.citations[node.attrs.id];
  const warn = !c || c.warnings.length > 0;
  const label = c?.text ?? "[citação por resolver — gravar para atualizar]";
  const content = node.attrs.mode === "quote_short" && node.attrs.quote ? `“${node.attrs.quote}” ${label}` : label;
  return (
    <NodeViewWrapper as="span">
      <span
        className={`cite-chip ${warn ? "warn" : ""}`}
        role="button"
        tabIndex={0}
        title={c?.warnings.join(" ") || "Clique para ver ou editar a citação"}
        onClick={() => ctx.openCitation(node.attrs, (getPos as () => number)(), false)}
        onKeyDown={(e) => e.key === "Enter" && ctx.openCitation(node.attrs, (getPos as () => number)(), false)}
      >
        {content}
      </span>
    </NodeViewWrapper>
  );
}

export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => citationAttrs,
  parseHTML: () => [
    {
      tag: "span[data-vrban-citation]",
      getAttrs: (el) => {
        try {
          return JSON.parse((el as HTMLElement).getAttribute("data-vrban-citation") ?? "{}");
        } catch {
          return false;
        }
      },
    },
  ],
  renderHTML: ({ node }) => ["span", { "data-vrban-citation": JSON.stringify(node.attrs) }, `[citação]`],
  addNodeView: () => ReactNodeViewRenderer(CitationView),
});

function CitationBlockView({ node, getPos }: NodeViewProps) {
  const ctx = useContext(EditorContext);
  const c = ctx.citations[node.attrs.id];
  return (
    <NodeViewWrapper className="block-quote-node" data-block-quote="">
      <NodeViewContent />
      <span
        contentEditable={false}
        className={`cite-chip bq-cite ${!c || c.warnings.length ? "warn" : ""}`}
        role="button"
        tabIndex={0}
        title={c?.warnings.join(" ") || "Citação em bloco (40 palavras ou mais)"}
        onClick={() => ctx.openCitation(node.attrs, (getPos as () => number)(), true)}
      >
        {c?.text ?? "[citação por resolver]"}
      </span>
    </NodeViewWrapper>
  );
}

export const CitationBlock = Node.create({
  name: "citationBlock",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes: () => citationAttrs,
  parseHTML: () => [
    {
      tag: "blockquote[data-vrban-citation]",
      getAttrs: (el) => {
        try {
          return JSON.parse((el as HTMLElement).getAttribute("data-vrban-citation") ?? "{}");
        } catch {
          return false;
        }
      },
    },
  ],
  renderHTML: ({ node }) => ["blockquote", { "data-vrban-citation": JSON.stringify(node.attrs) }, 0],
  addNodeView: () => ReactNodeViewRenderer(CitationBlockView),
});

function XrefView({ node }: NodeViewProps) {
  const ctx = useContext(EditorContext);
  const label = ctx.xrefLabel(node.attrs.targetId);
  return (
    <NodeViewWrapper as="span">
      <span className="xref-chip" title="Referência cruzada (atualiza com a numeração)">
        {label ?? "[referência cruzada por resolver]"}
      </span>
    </NodeViewWrapper>
  );
}

export const Xref = Node.create({
  name: "xref",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    id: { default: null, rendered: false },
    targetType: { default: "section", rendered: false },
    targetId: { default: null, rendered: false },
  }),
  parseHTML: () => [
    {
      tag: "span[data-vrban-xref]",
      getAttrs: (el) => {
        try {
          return JSON.parse((el as HTMLElement).getAttribute("data-vrban-xref") ?? "{}");
        } catch {
          return false;
        }
      },
    },
  ],
  renderHTML: ({ node }) => ["span", { "data-vrban-xref": JSON.stringify(node.attrs) }, "[ref]"],
  addNodeView: () => ReactNodeViewRenderer(XrefView),
});
