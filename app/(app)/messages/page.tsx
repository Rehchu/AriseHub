import { Icon } from "@/components/shell/Icon";

export default function MessagesIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        <Icon name="chat" size={28} />
      </span>
      <h2 className="font-display text-lg font-semibold text-ink-800">
        Your conversations
      </h2>
      <p className="mt-1 max-w-xs text-sm text-ink-500">
        Pick a department chat or direct message on the left, or start a new one.
      </p>
    </div>
  );
}
