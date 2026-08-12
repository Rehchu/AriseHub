import { BibleReader } from "@/components/bible/BibleReader";

export const metadata = { title: "Bible" };

// Auth + the app shell come from app/(app)/layout.tsx; the reader does all its
// fetching client-side against /api/bible/*.
export default function BiblePage() {
  return <BibleReader />;
}
