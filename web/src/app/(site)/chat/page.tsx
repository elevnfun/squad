import type { Metadata } from "next";
import ChatRoom from "@/components/ChatRoom";

export const metadata: Metadata = { title: "Chat | elevn" };

// The community chat: one room for every player (components/ChatRoom.tsx).
export default function Chat() {
  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em]">Chat</h1>
      <p className="mt-2 max-w-[60ch] text-muted">Talk fixtures, captains and transfers with other players before the deadline.</p>
      <ChatRoom />
    </div>
  );
}
