import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/lib/api";
import { getLicense, clearLicense } from "@/lib/license";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anonymous

  const refresh = useCallback(async () => {
    try {
      const u = await authApi.me();
      setUser(u);
      return u;
    } catch {
      setUser(false);
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A Pro pass bought on this device follows the account once signed in
  const adopt = useCallback(async (u) => {
    const license = getLicense();
    if (license && !u.is_pro) {
      try {
        await authApi.claimLicense(license);
        u = { ...u, is_pro: true };
      } catch (e) {
        if (e?.response?.status === 400) clearLicense();
      }
    }
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      refresh,
      login: async (email, password) => adopt(await authApi.login(email, password)),
      register: async (email, password, name) => adopt(await authApi.register(email, password, name)),
      logout: async () => {
        await authApi.logout().catch(() => {});
        setUser(false);
      },
      setBranding: (branding) => setUser((u) => (u ? { ...u, branding } : u)),
    }),
    [user, refresh, adopt]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
