import { RoomView } from "@/components/room/RoomView";

/**
 * A thin server wrapper: the room UI lives in <RoomView> so the practice
 * route can reuse it. `?local=1` selects the in-process dev harness.
 */
export default async function RoomPage({ params, searchParams }: PageProps<"/room/[code]">) {
  const { code } = await params;
  const query = await searchParams;
  return <RoomView code={code} mode={typeof query.local === "string" ? "local" : "network"} />;
}
