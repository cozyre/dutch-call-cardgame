import { RoomView } from "@/components/room/RoomView";

/**
 * Practice mode (the plan §13 exception): the same room view as
 * `/room/CODE`, but driven by the in-process practice client — you plus
 * three bots, no network room behind it.
 */
export default function PracticePage() {
  return <RoomView code="" mode="practice" />;
}
