import { useState } from "react";
import { BookOpen, ExternalLink, X } from "lucide-react";
import { useStore } from "../store";
import { PAGE_HELP, askGuideFor, closeNote, docsUrl, noteFor } from "../help";
import type { Page } from "../types";

/**
 * The note at the top of a new page: where to start, with the Guide and the online guide a tap away.
 * It counts a visit each time the page opens and stops after a few, or when it's closed.
 * Keyed by page in App, so it's worked out once per visit.
 */
export function PageNote({ page }: { page: Page }) {
  const [note, setNote] = useState(() => noteFor(page));
  const go = useStore((s) => s.go);
  if (!note) return null;
  const help = PAGE_HELP.find((h) => h.page === page);
  const close = () => { closeNote(page); setNote(null); };
  return (
    <div className="page-note" role="note">
      <span className="pill accent">New</span>
      <p className="grow">{note.text}</p>
      <div className="row gap-sm wrap">
        {help?.guide && <button className="btn sm" onClick={() => { askGuideFor(help.guide!); go("guide"); }}><BookOpen size={14} /> Show me how</button>}
        {help && <a className="btn sm ghost" href={docsUrl(help.docs)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Online guide</a>}
      </div>
      <button className="icon-btn" aria-label="Close this note" title="Close this note" onClick={close}><X size={16} /></button>
    </div>
  );
}
