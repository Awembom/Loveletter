import Link from "next/link";

export default function NotFound() {
  return (
    <main className="desk theme-friend">
      <section className="card notice">
        <h1>This letter can't be found</h1>
        <p>The link may be incomplete. Check that you copied all of it, or ask the sender to send it again.</p>
        <Link href="/" className="button">Write a letter of your own</Link>
      </section>
    </main>
  );
}
