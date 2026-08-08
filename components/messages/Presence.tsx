"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Present {
  profileId: string;
  name: string;
  typing: boolean;
}

/**
 * Who else is in this channel right now, and who is typing.
 *
 * Supabase Realtime presence rather than Durable Objects: the Realtime
 * connection is already open for messages, so this rides along at no extra
 * cost. Presence state lives only in the connection — nothing is written to the
 * database, so there is no history of who was watching what.
 */
export function usePresence(channelId: string, me: { id: string; name: string } | null) {
  const [present, setPresent] = useState<Present[]>([]);
  // A ref, not state.
  //
  // This kept the typing callback in useState and set it from inside the
  // effect, while the effect's dependency array included `me` — the object.
  // A caller passing an inline `{ id, name }` (the obvious way to call this)
  // hands over a new reference every render, so: effect runs -> setState ->
  // render -> new `me` -> effect runs. An infinite loop, which is why nothing
  // has imported this hook yet. Deps are now the primitive fields, and the
  // callback lives in a ref so publishing it never causes a render.
  const typingRef = useRef<((t: boolean) => void) | null>(null);

  useEffect(() => {
    if (!channelId || !me) return;
    const supabase = createClient();
    const room = supabase.channel(`presence:${channelId}`, {
      config: { presence: { key: me.id } },
    });

    const sync = () => {
      const state = room.presenceState<{ profileId: string; name: string; typing: boolean }>();
      const people: Present[] = [];
      for (const entries of Object.values(state)) {
        const latest = entries[entries.length - 1];
        if (latest && latest.profileId !== me.id) {
          people.push({ profileId: latest.profileId, name: latest.name, typing: !!latest.typing });
        }
      }
      setPresent(people);
    };

    room
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void room.track({ profileId: me.id, name: me.name, typing: false });
        }
      });

    let idle: ReturnType<typeof setTimeout> | null = null;
    typingRef.current = (typing: boolean) => {
      void room.track({ profileId: me.id, name: me.name, typing });
      if (idle) clearTimeout(idle);
      // Stop advertising if they walk away mid-sentence.
      if (typing) idle = setTimeout(() => void room.track({ profileId: me.id, name: me.name, typing: false }), 6000);
    };

    return () => {
      if (idle) clearTimeout(idle);
      typingRef.current = null;
      void supabase.removeChannel(room);
    };
    // Primitives only — see the note above. `me` itself must not be in here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, me?.id, me?.name]);

  // Stable identity, so callers can put it in their own dependency arrays
  // without reintroducing the loop this hook just escaped.
  const setTyping = useCallback((typing: boolean) => typingRef.current?.(typing), []);

  return { present, setTyping };
}

/** "Kristina is typing…" / "Kristina and 2 others are here" */
export function PresenceLine({ present }: { present: Present[] }) {
  const typing = present.filter((p) => p.typing);
  const first = (n: string) => n.split(" ")[0];

  if (typing.length > 0) {
    const label =
      typing.length === 1
        ? `${first(typing[0].name)} is typing`
        : typing.length === 2
          ? `${first(typing[0].name)} and ${first(typing[1].name)} are typing`
          : `${typing.length} people are typing`;
    return (
      <p className="flex items-center gap-1.5 px-4 pb-1 text-xs text-ink-400">
        <span className="flex gap-0.5">
          <Dot delay="0ms" />
          <Dot delay="150ms" />
          <Dot delay="300ms" />
        </span>
        {label}
      </p>
    );
  }

  if (present.length === 0) return null;
  const label =
    present.length === 1
      ? `${first(present[0].name)} is here`
      : `${first(present[0].name)} and ${present.length - 1} other${present.length > 2 ? "s" : ""} here`;
  return (
    <p className="flex items-center gap-1.5 px-4 pb-1 text-xs text-ink-400">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {label}
    </p>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1 w-1 animate-bounce rounded-full bg-ink-400"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}
