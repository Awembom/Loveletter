import { NextResponse } from "next/server";
import { createLetter, validateLetter } from "@/lib/letters";

// POST /api/letters  { recipient?, sender?, body, style }  ->  201 { id }
export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "The letter could not be read. Please try again." }, { status: 400 });
  }

  const result = validateLetter(input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  try {
    const id = await createLetter(result.letter);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Your letter couldn't be saved just now. Please try again in a moment." },
      { status: 500 },
    );
  }
}
