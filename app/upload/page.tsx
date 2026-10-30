import type { Metadata } from "next";
import { Library } from "@/components/Library";

export const metadata: Metadata = { title: "Library · RAG Study Assistant" };

export default function UploadPage() {
  return <Library />;
}
