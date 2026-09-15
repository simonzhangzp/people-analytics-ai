"use client";

import { useRouter, usePathname } from "next/navigation";
import { DEMO_IDENTITIES } from "@/lib/people/demo-identities";

export function RoleSwitcher({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="block text-[13px] text-body-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        Demo identity
      </span>
      <select
        className="mt-2 w-full rounded-[8px] border border-edge bg-white px-3 py-2 text-[13px] text-ink"
        data-testid="demo-identity"
        value={value}
        onChange={(event) => {
          router.push(`${pathname}?identity=${encodeURIComponent(event.target.value)}`);
        }}
      >
        {DEMO_IDENTITIES.map((item) => (
          <option key={item.identity_id} value={item.identity_id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
