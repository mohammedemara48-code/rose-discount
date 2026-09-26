import { createFileRoute } from "@tanstack/react-router";
import { RoseApp } from "@/components/rose-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RoseApp />;
}
