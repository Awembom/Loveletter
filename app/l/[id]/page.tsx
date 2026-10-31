import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getLetter, isValidId } from "@/lib/letters";
import LetterViewer from "@/components/LetterViewer";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// Shared by generateMetadata and the page so the letter is fetched once.
const loadLetter = cache(async (id: string) => (isValidId(id) ? getLetter(id) : null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const letter = await loadLetter(id);
  // Never put the message itself in link previews.
  const title = letter?.sender ? `A letter from ${letter.sender}` : "A letter for you";
  const description = "Someone wrote you a letter. Open the envelope to read it.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

/** The date the letter was written, e.g. "28 October 2026". */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(iso));
}

export default async function LetterPage({ params }: Props) {
  const { id } = await params;
  const letter = await loadLetter(id);
  if (!letter) notFound();

  return (
    <main className={`desk theme-${letter.theme}`}>
      <LetterViewer
        letter={{
          id: letter.id,
          recipient: letter.recipient,
          sender: letter.sender,
          body: letter.body,
          style: letter.style,
          theme: letter.theme,
          date: formatDate(letter.created_at),
        }}
      />
    </main>
  );
}
