import { DictionaryBrowser } from "@/components/bible/DictionaryBrowser";

export const metadata = { title: "Bible dictionary" };

// Auth + the app shell come from app/(app)/layout.tsx; the browser does all its
// fetching client-side against /api/bible/dictionary.
export default function DictionaryPage() {
  return <DictionaryBrowser />;
}
