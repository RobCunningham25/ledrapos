import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Link as LinkIcon, Undo, Redo, Quote } from 'lucide-react';
import { useEffect } from 'react';

interface BroadcastEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function BroadcastEditor({ value, onChange }: BroadcastEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none p-4 min-h-[280px] focus:outline-none',
      },
    },
  });

  // Keep external value in sync if the parent resets it (e.g. after send).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-input bg-background overflow-hidden">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const promptForLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Link URL', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-input bg-muted/40 px-2 py-1.5">
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        label="Heading 1"
      >
        <Heading1 size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading 2"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bulleted list"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Quote"
      >
        <Quote size={16} />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        active={editor.isActive('link')}
        onClick={promptForLink}
        label="Link"
      >
        <LinkIcon size={16} />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        label="Undo"
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        label="Redo"
      >
        <Redo size={16} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}
