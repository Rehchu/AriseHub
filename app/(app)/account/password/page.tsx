import { SetPassword } from "@/components/account/SetPassword";

export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
      <div className="border-b border-ink-100 pb-4">
        <h1 className="font-display text-2xl font-bold text-ink-900">Set your password</h1>
        <p className="mt-1 text-sm text-ink-500">
          Choose a password for your AriseHub account. This is the only login
          you need — it covers IT too.
        </p>
      </div>
      <div className="mt-6">
        <SetPassword />
      </div>
    </div>
  );
}
