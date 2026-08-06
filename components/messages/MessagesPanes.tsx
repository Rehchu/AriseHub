"use client";

import { useSelectedLayoutSegment } from "next/navigation";

// Responsive two-pane messaging.
//  * Phones/small tablets: one pane at a time — the channel list at /messages,
//    the conversation at /messages/[channelId] (with a Back link in Thread).
//  * lg and up: the list and the conversation side by side.
export function MessagesPanes({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment(); // null at /messages, id in a thread
  const inThread = segment !== null && segment !== "__PAGE__";

  return (
    <div className="flex h-full">
      <div className={`${inThread ? "hidden lg:flex" : "flex"} w-full shrink-0 lg:w-72`}>
        {list}
      </div>
      <div className={`${inThread ? "flex" : "hidden lg:flex"} min-w-0 flex-1`}>
        {children}
      </div>
    </div>
  );
}
