'use client';

import { useCallback, useRef, useState } from 'react';
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type EditorState,
  type LexicalEditor as LexicalEditorType,
} from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { CodeNode } from '@lexical/code';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import { $createImageNode, IMAGE_TRANSFORMER, ImageNode } from '@/components/lexical-image-node';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/** Image bridge first so `![alt](url)` wins over the plain-link text match. */
const MARKDOWN_TRANSFORMERS = [IMAGE_TRANSFORMER, ...TRANSFORMERS];

/** Maps node types to Tailwind classes so the WYSIWYG renders structure inline. */
const theme = {
  paragraph: 'mb-2 leading-relaxed',
  heading: {
    h1: 'text-2xl font-bold mt-4 mb-2',
    h2: 'text-xl font-semibold mt-4 mb-2',
    h3: 'text-lg font-semibold mt-3 mb-1',
  },
  list: {
    ul: 'list-disc ml-6 mb-2',
    ol: 'list-decimal ml-6 mb-2',
    listitem: 'mb-1',
  },
  quote: 'border-l-4 border-muted pl-4 italic text-muted-foreground my-2',
  link: 'text-primary underline',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    code: 'rounded bg-muted px-1 py-0.5 font-mono text-sm',
  },
  code: 'block rounded bg-muted p-3 font-mono text-sm my-2 whitespace-pre-wrap',
};

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPickImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileRef.current) fileRef.current.value = '';
      if (!file) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`${API_BASE}/uploads`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!res.ok) throw new Error('upload failed');
        const { url } = (await res.json()) as { url: string };
        editor.update(() => {
          $insertNodes([$createImageNode({ src: url, altText: file.name })]);
        });
      } catch {
        // Surface nothing here — keep the editor responsive; ops re-tries the pick.
      } finally {
        setUploading(false);
      }
    },
    [editor],
  );

  const setBlock = useCallback(
    (creator: () => HeadingNode | QuoteNode | ReturnType<typeof $createParagraphNode>) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $setBlocksType(selection, creator);
      });
    },
    [editor],
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1">
      <ToolbarButton title="ตัวหนา" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="ตัวเอียง" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton title="ข้อความปกติ" onClick={() => setBlock(() => $createParagraphNode())}>
        <Pilcrow className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="หัวข้อใหญ่" onClick={() => setBlock(() => $createHeadingNode('h2'))}>
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="หัวข้อย่อย" onClick={() => setBlock(() => $createHeadingNode('h3'))}>
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="คำพูด/อ้างอิง" onClick={() => setBlock(() => $createQuoteNode())}>
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        title="รายการ"
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="รายการลำดับเลข"
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickImage}
      />
      <ToolbarButton
        title={uploading ? 'กำลังอัปโหลด…' : 'แทรกรูปภาพ'}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        <ImagePlus className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton title="ย้อนกลับ" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="ทำซ้ำ" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export interface LexicalEditorProps {
  /** Initial Markdown — read once on mount; the editor is uncontrolled thereafter. */
  value?: string;
  /** Called with serialized Markdown on every change. */
  onChange: (markdown: string) => void;
  placeholder?: string;
}

/**
 * WYSIWYG editor that reads/writes Markdown via @lexical/markdown so `body`
 * stays a Markdown string (the web blog renders it with react-markdown).
 */
export function LexicalEditor({ value, onChange, placeholder }: LexicalEditorProps) {
  // Hold the latest onChange without re-initializing the editor.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialConfig = {
    namespace: 'blog-body',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, ImageNode],
    onError: (error: Error) => {
      throw error;
    },
    // Convert the incoming Markdown into the initial editor state (runs once).
    editorState: () => $convertFromMarkdownString(value ?? '', MARKDOWN_TRANSFORMERS),
  };

  const handleChange = useCallback((editorState: EditorState, _editor: LexicalEditorType) => {
    editorState.read(() => {
      onChangeRef.current($convertToMarkdownString(MARKDOWN_TRANSFORMERS));
    });
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rounded-md border bg-background">
        <Toolbar />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="min-h-[320px] px-3 py-2 text-sm outline-none [&_a]:cursor-pointer" />
            }
            placeholder={
              <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
                {placeholder ?? 'เขียนเนื้อหาบทความ…'}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ListPlugin />
          <LinkPlugin />
          <HistoryPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
          <OnChangePlugin onChange={handleChange} />
        </div>
      </div>
    </LexicalComposer>
  );
}
