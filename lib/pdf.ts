import { extractText, getDocumentProxy } from "unpdf";
import type { PageText } from "./chunker";

export async function extractPages(bytes: Uint8Array): Promise<PageText[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
}
