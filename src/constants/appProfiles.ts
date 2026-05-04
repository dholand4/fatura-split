import type { Pessoa } from "@/lib/divisao";
import { CORES_PESSOA } from "@/lib/divisao";

export type ProfileMode = "antonia" | "guest";

export interface LocalProfileConfig {
  mode: ProfileMode;
  label: string;
  description: string;
  storageKey: string;
  initialPeople: Pessoa[];
  negativeOwnerId?: string;
  username?: string;
  password?: string;
}

export const ACTIVE_PROFILE_STORAGE_KEY = "dividefatura-active-profile-v1";
export const REMEMBER_ACCESS_STORAGE_KEY = "dividefatura-remember-access-v1";
export const SAVED_USERNAME_STORAGE_KEY = "dividefatura-saved-username-v1";
export const SAVED_PASSWORD_STORAGE_KEY = "dividefatura-saved-password-v1";
export const DANIEL_ID = "pessoa-daniel";
export const ANTONIA_ID = "pessoa-antonia";

const ANTONIA_INITIAL_PEOPLE: Pessoa[] = [
  { id: DANIEL_ID, nome: "Daniel", cor: CORES_PESSOA[0] },
  { id: "pessoa-josefa", nome: "Josefa", cor: CORES_PESSOA[1] },
  { id: ANTONIA_ID, nome: "Antonia", cor: CORES_PESSOA[2] },
  { id: "pessoa-jacira", nome: "Jacira", cor: CORES_PESSOA[3] },
  { id: "pessoa-flavio", nome: "Flavio", cor: CORES_PESSOA[4] },
  { id: "pessoa-bola", nome: "Bola", cor: CORES_PESSOA[5] },
  { id: "pessoa-fatima", nome: "Fatima", cor: CORES_PESSOA[6] },
  { id: "pessoa-eulalia", nome: "Eulalia", cor: CORES_PESSOA[7] },
  { id: "pessoa-joana", nome: "Joana", cor: CORES_PESSOA[0] },
  { id: "pessoa-henrique", nome: "Henrique", cor: CORES_PESSOA[1] },
  { id: "pessoa-leila", nome: "Leila", cor: CORES_PESSOA[2] },
  { id: "pessoa-rakelly", nome: "Rakelly", cor: CORES_PESSOA[3] },
];

export const PROFILE_CONFIGS: Record<ProfileMode, LocalProfileConfig> = {
  antonia: {
    mode: "antonia",
    label: "Antonia",
    description: "Carrega os nomes predefinidos e mantem Daniel como responsavel pelos valores negativos.",
    storageKey: "fatura-split-state-antonia-v1",
    initialPeople: ANTONIA_INITIAL_PEOPLE,
    negativeOwnerId: DANIEL_ID,
    username: "antonia",
    password: "antonia",
  },
  guest: {
    mode: "guest",
    label: "Visitante",
    description: "Entra sem nomes predefinidos e usa um armazenamento local separado.",
    storageKey: "fatura-split-state-guest-v1",
    initialPeople: [],
  },
};

export const PROFILE_ORDER: ProfileMode[] = ["antonia", "guest"];

export function isProfileMode(value: string | null): value is ProfileMode {
  return value === "antonia" || value === "guest";
}

export function getStoredProfileMode(): ProfileMode | null {
  const persistentValue = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  if (isProfileMode(persistentValue)) return persistentValue;

  const sessionValue = sessionStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  return isProfileMode(sessionValue) ? sessionValue : null;
}

export function persistProfileMode(mode: ProfileMode, rememberAccess: boolean) {
  if (rememberAccess) {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, mode);
    localStorage.setItem(REMEMBER_ACCESS_STORAGE_KEY, "true");
    sessionStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    return;
  }

  sessionStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, mode);
  localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
  localStorage.removeItem(REMEMBER_ACCESS_STORAGE_KEY);
}

export function clearStoredProfileMode() {
  localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
  sessionStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
}

export function getRememberAccessPreference() {
  return localStorage.getItem(REMEMBER_ACCESS_STORAGE_KEY) === "true";
}

export function getSavedCredentials() {
  return {
    username: localStorage.getItem(SAVED_USERNAME_STORAGE_KEY) ?? "",
    password: localStorage.getItem(SAVED_PASSWORD_STORAGE_KEY) ?? "",
  };
}

export function persistSavedCredentials(username: string, password: string, rememberAccess: boolean) {
  if (!rememberAccess) {
    localStorage.removeItem(SAVED_USERNAME_STORAGE_KEY);
    localStorage.removeItem(SAVED_PASSWORD_STORAGE_KEY);
    return;
  }

  localStorage.setItem(SAVED_USERNAME_STORAGE_KEY, username);
  localStorage.setItem(SAVED_PASSWORD_STORAGE_KEY, password);
}
