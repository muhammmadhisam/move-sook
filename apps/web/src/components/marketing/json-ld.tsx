// Server component that injects a JSON-LD structured-data block. Next.js
// allows dangerouslySetInnerHTML for <script type="application/ld+json">.
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
