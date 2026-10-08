import type { components } from "./generated/api";
import type { SupabaseClient } from "@supabase/supabase-js";
// Pydantic fills defaults before serialization; responses always contain these fields.
export type Question = Required<components["schemas"]["Question"]>;
export type Criterion = Required<components["schemas"]["Criterion"]>;
export type Step = Required<
  Omit<components["schemas"]["Step"], "criteria" | "questions">
> & { criteria: Criterion[]; questions: Question[] };
export type Draft = Required<
  Omit<components["schemas"]["LessonDraft"], "steps" | "questions">
> & { steps: Step[]; questions: Question[] };
export type Observation = Required<components["schemas"]["Observation"]>;
export type Outcome = components["schemas"]["AssessmentOutput"]["outcome"];
export type Source = "camera" | "screen" | "phone";
export interface Config {
  local_login: boolean;
  ai_configured: boolean;
  free_tier_confirmed: boolean;
  storage_mode: string;
  supabase_url: string;
  supabase_anon_key: string;
  analysis_interval: number;
  daily_limit: number;
  physical_model: string;
  general_model: string;
  app_origin: string;
}
export interface User {
  id: string;
  role: "instructor" | "student";
}
export type Session = Required<components["schemas"]["SessionRecord"]>;
export type Lesson = Omit<components["schemas"]["LessonRecord"], "draft"> & {
  draft: Draft;
};
export interface LessonCard {
  id: string;
  title: string;
  summary: string;
  step_count: number;
  latest_version: number;
  owned: boolean;
}
export type Version = Omit<components["schemas"]["VersionRecord"], "draft"> & {
  draft: Draft;
};
export type Assessment = Required<components["schemas"]["AssessmentRecord"]>;
export type Job = Required<components["schemas"]["JobRecord"]>;

let token = sessionStorage.getItem("showonce-token") || "";
export function setToken(value: string) {
  token = value;
  if (value) sessionStorage.setItem("showonce-token", value);
  else sessionStorage.removeItem("showonce-token");
}
export function getToken() {
  return token;
}
let hostedClient: Promise<SupabaseClient> | null = null;
export function hostedAuth(config: Config) {
  if (!hostedClient)
    hostedClient = import("@supabase/supabase-js").then(({ createClient }) => {
      const client = createClient(
        config.supabase_url,
        config.supabase_anon_key,
      );
      client.auth.onAuthStateChange((_event, session) =>
        setToken(session?.access_token || ""),
      );
      return client;
    });
  return hostedClient;
}
export async function restoreHostedAuth(config: Config) {
  if (config.local_login) return;
  const client = await hostedAuth(config);
  const { data } = await client.auth.getSession();
  setToken(data.session?.access_token || "");
}
export async function logoutHostedAuth(config: Config) {
  if (!config.local_login && hostedClient)
    await (await hostedClient).auth.signOut();
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      const error = await response.json();
      message =
        typeof error.detail === "string"
          ? error.detail
          : JSON.stringify(error.detail);
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export async function download(path: string, name: string) {
  const r = await fetch("/api" + path, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!r.ok) throw new Error("Could not export this lesson");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function wsURL(id: string) {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/sessions/${id}/stream`;
}
export const outcomeLabels: Record<Outcome, string> = {
  met: "Visible checkpoint met",
  correction: "Correction needed",
  clearer_view: "Need a clearer view",
  unavailable: "Unable to assess",
};
