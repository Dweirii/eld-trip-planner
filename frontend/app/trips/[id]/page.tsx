import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/features/workspace/Workspace";
import { fetchTrip } from "@/lib/api/server";
import { cityOf } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/trips/[id]">): Promise<Metadata> {
  const { id } = await params;
  const trip = await fetchTrip(id);
  if (!trip) return { title: "Trip not found" };
  const { current_location, pickup_location, dropoff_location } = trip.inputs;
  return {
    title: [current_location, pickup_location, dropoff_location].map((place) => cityOf(place.label)).join(" → "),
  };
}

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const trip = await fetchTrip(id);
  if (!trip) notFound();
  return <Workspace initialTrip={trip} />;
}
