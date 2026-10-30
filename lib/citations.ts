export type Segment = { type: "text"; text: string } | { type: "cite"; source: number };

/**
 * Split an answer into plain text and [n] citation markers so the UI can render
 * markers as clickable chips. Markers that point outside 1..sourceCount stay as text.
 */
export function parseCitations(answer: string, sourceCount: number): Segment[] {
  const segments: Segment[] = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  for (let m = re.exec(answer); m; m = re.exec(answer)) {
    const n = Number(m[1]);
    if (n < 1 || n > sourceCount) continue;
    if (m.index > last) segments.push({ type: "text", text: answer.slice(last, m.index) });
    segments.push({ type: "cite", source: n });
    last = m.index + m[0].length;
  }
  if (last < answer.length) segments.push({ type: "text", text: answer.slice(last) });
  return segments;
}
