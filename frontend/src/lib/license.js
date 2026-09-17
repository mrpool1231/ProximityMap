const LICENSE_KEY = "geopulse_license";
const RESUME_KEY = "geopulse_resume_state";

export const getLicense = () => localStorage.getItem(LICENSE_KEY);
export const setLicense = (sessionId) => localStorage.setItem(LICENSE_KEY, sessionId);
export const clearLicense = () => localStorage.removeItem(LICENSE_KEY);

export const stashResumeState = (state) => localStorage.setItem(RESUME_KEY, JSON.stringify(state));
export function popResumeState() {
  const raw = localStorage.getItem(RESUME_KEY);
  if (!raw) return null;
  localStorage.removeItem(RESUME_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
