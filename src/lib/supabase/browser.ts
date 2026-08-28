import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type WorkbenchSupabaseClient = SupabaseClient<Database>;

let browserClient: WorkbenchSupabaseClient | null | undefined;
let signInPromise: Promise<Session> | null = null;

function publicConfiguration(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseBrowserConfigured(): boolean {
  return publicConfiguration() !== null;
}

export function getSupabaseBrowserClient(): WorkbenchSupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (browserClient !== undefined) return browserClient;

  const configuration = publicConfiguration();
  if (!configuration) {
    browserClient = null;
    return null;
  }

  browserClient = createClient<Database>(
    configuration.url,
    configuration.anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  return browserClient;
}

export async function ensureAnonymousSession(
  client: WorkbenchSupabaseClient,
): Promise<Session> {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw new Error("Supabase session could not be read.");
  }
  if (session) return session;
  if (signInPromise) return signInPromise;

  signInPromise = (async () => {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session) {
      throw new Error(
        "Supabase anonymous sign-in is unavailable. Enable anonymous auth for persistence.",
      );
    }
    return data.session;
  })();

  try {
    return await signInPromise;
  } finally {
    signInPromise = null;
  }
}
