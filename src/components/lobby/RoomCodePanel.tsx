"use client";

import { Button } from "@/components/ui/Button";

interface RoomCodePanelProps {
  code: string;
  copied: "code" | "link" | null;
  onCopy: (kind: "code" | "link") => void;
}

/** Room code plus the share actions: one button on mobile, two on desktop. */
export function RoomCodePanel({ code, copied, onCopy }: RoomCodePanelProps) {
  return (
    <section className="rounded-panel bg-raised p-4 md:p-6">
      <p className="text-label text-glaze">Room code</p>
      <p className="mt-2 text-code-room text-tile md:mt-3">{code}</p>

      <div className="mt-0 flex gap-3 md:mt-1">
        <Button
          variant="secondary"
          fullWidth
          onClick={() => onCopy("link")}
          className="md:hidden"
        >
          {copied === "link" ? "Copied" : "Copy invite link"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onCopy("code")}
          className="max-md:hidden md:flex-1"
        >
          {copied === "code" ? "Copied" : "Copy code"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onCopy("link")}
          className="max-md:hidden md:flex-1"
        >
          {copied === "link" ? "Copied" : "Copy invite link"}
        </Button>
      </div>
    </section>
  );
}
