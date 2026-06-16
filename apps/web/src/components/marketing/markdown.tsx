import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders a Markdown string as sanitized HTML. react-markdown does not render
 * raw HTML by default, so admin-authored content can't inject scripts. Styling
 * comes from the surrounding <Prose> wrapper's child selectors.
 */
export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
