'use client';

import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { TextMatchTransformer } from '@lexical/markdown';

export type SerializedImageNode = Spread<
  { src: string; altText: string },
  SerializedLexicalNode
>;

/** Inline image rendered in the WYSIWYG; serializes to Markdown `![alt](src)`. */
export class ImageNode extends DecoratorNode<React.ReactElement> {
  __src: string;
  __altText: string;

  static override getType(): string {
    return 'image';
  }

  static override clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__key);
  }

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  static override importJSON(json: SerializedImageNode): ImageNode {
    return $createImageNode({ src: json.src, altText: json.altText });
  }

  override exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
    };
  }

  override exportDOM(): DOMExportOutput {
    const img = document.createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    return { element: img };
  }

  override createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'block my-2';
    return span;
  }

  override updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  override decorate(_editor: unknown, _config: EditorConfig): React.ReactElement {
    return (
      <img
        src={this.__src}
        alt={this.__altText}
        className="max-h-80 max-w-full rounded-md border"
      />
    );
  }
}

export function $createImageNode({
  src,
  altText,
}: {
  src: string;
  altText: string;
}): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, altText));
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}

/** Markdown bridge: `![alt](src)` ⇄ ImageNode (works for import + shortcut + export). */
export const IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) return null;
    return `![${node.getAltText()}](${node.getSrc()})`;
  },
  importRegExp: /!(?:\[([^[]*)\])(?:\(([^()\s]+)\))/,
  regExp: /!(?:\[([^[]*)\])(?:\(([^()\s]+)\))$/,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    textNode.replace($createImageNode({ src: src ?? '', altText: altText ?? '' }));
  },
  trigger: ')',
  type: 'text-match',
};
