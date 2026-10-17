import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { customerAuth } from "@biasmarket/types";
import {
  deleteBuyerSession,
  readBuyerSession,
  writeBuyerSession,
} from "./session-storage";
import { setMobileBearerToken, setUnauthorizedHandler } from "./api-client";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface BuyerSessionContextValue {
  status: SessionStatus;
  storeSlug: string | null;
  error: string | null;
  signIn: (storeSlug: string, phone: string, password: string) => Promise<void>;
  register: (
    storeSlug: string,
    token: string,
    phone: string,
    password: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const BuyerSessionContext = createContext<BuyerSessionContextValue | null>(
  null,
);

export function BuyerSessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearLocalSession = useCallback(async () => {
    setMobileBearerToken(null);
    setStoreSlug(null);
    setStatus("unauthenticated");
    try {
      await deleteBuyerSession();
    } catch {
      setError("No se pudo borrar la sesión segura del dispositivo.");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearLocalSession);
    void readBuyerSession()
      .then((session) => {
        if (session) {
          setMobileBearerToken(session.token);
          setStoreSlug(session.storeSlug);
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        setStatus("unauthenticated");
        setError("No se pudo leer la sesión segura del dispositivo.");
      });

    return () => setUnauthorizedHandler(undefined);
  }, [clearLocalSession]);

  const signIn = useCallback(
    async (slug: string, phone: string, password: string) => {
      setError(null);
      const response = await customerAuth.login(
        slug,
        { phone, password },
        { headers: { "X-Client": "mobile" } },
      );
      const token = response.sessionToken;
      if (!token) {
        throw new Error("El servidor no devolvió el token de sesión móvil.");
      }

      await writeBuyerSession({ token, storeSlug: slug });
      setMobileBearerToken(token);
      setStoreSlug(slug);
      setStatus("authenticated");
    },
    [],
  );

  const register = useCallback(
    async (slug: string, token: string, phone: string, password: string) => {
      setError(null);
      await customerAuth.register(
        slug,
        { token, password },
        { headers: { "X-Client": "mobile" } },
      );
      // The current registration endpoint sets the password but doesn't issue
      // a session token, so log in immediately to establish the mobile session.
      await signIn(slug, phone, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    setError(null);
    await clearLocalSession();
  }, [clearLocalSession]);

  const value = useMemo(
    () => ({
      status,
      storeSlug,
      error,
      signIn,
      register,
      signOut,
      clearError: () => setError(null),
    }),
    [status, storeSlug, error, signIn, register, signOut],
  );

  return (
    <BuyerSessionContext.Provider value={value}>
      {children}
    </BuyerSessionContext.Provider>
  );
}

export function useBuyerSession(): BuyerSessionContextValue {
  const value = useContext(BuyerSessionContext);
  if (!value) {
    throw new Error("useBuyerSession must be used inside BuyerSessionProvider");
  }
  return value;
}
