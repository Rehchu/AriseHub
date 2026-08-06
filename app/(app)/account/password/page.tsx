import { SetPassword } from "@/components/account/SetPassword";

export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Set your password</h1>
      <p className="mt-1 mb-6 text-ink-500">
        Choose a password for your AriseHub account. This is the only login you
        need — it covers IT too.
      </p>
      <SetPassword />
    </div>
  );
}
