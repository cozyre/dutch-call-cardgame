import { HomeScreen } from "@/components/home/HomeScreen";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const room = typeof params.room === "string" ? params.room : "";
  return <HomeScreen initialRoomCode={room} />;
}
