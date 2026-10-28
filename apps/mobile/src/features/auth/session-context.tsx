import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { customerAuth } from "@biasmarket/types";
import {
  deleteBuyerSession,
  readBuyerSession,
  writeBuyerSession,
} from "./session-storage.js";
import {
  isCurrentMobileAuthorization,
  setMobileBearerToken,
  setSessionRefreshHandler,
  setUnauthorizedHandler,
} from "./api-client.js";

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
  const sessionGeneration = useRef(0);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runStorageOperation = useCallback(<T,>(operation: () => Promise<T>) => {
    const result = storageQueue.current.then(operation, operation);
    storageQueue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const clearLocalSession = useCallback(
    async (authorization?: string) => {
      if (authorization && !isCurrentMobileAuthorization(authorization)) {
        return;
      }
      const generation = ++sessionGeneration.current;
      try {
        await runStorageOperation(deleteBuyerSession);
      } catch (cause) {
        if (generation === sessionGeneration.current) {
          setError("auth.sessionDeleteFailed");
        }
        throw cause;
      }
      if (
        generation !== sessionGeneration.current ||
        (authorization && !isCurrentMobileAuthorization(authorization))
      ) {
        return;
      }
      setMobileBearerToken(null);
      setStoreSlug(null);
      setStatus("unauthenticated");
    },
    [runStorageOperation],
  );

  const refreshSessionToken = useCallback(
    async (authorization: string, token: string) => {
      if (!isCurrentMobileAuthorization(authorization)) return;
      const generation = sessionGeneration.current;
      const refreshed = await runStorageOperation(async () => {
        if (
          generation !== sessionGeneration.current ||
          !isCurrentMobileAuthorization(authorization)
        ) {
          return false;
        }
        const session = await readBuyerSession();
        if (!session) return false;
        await writeBuyerSession({ ...session, token });
        return true;
      });
      if (
        refreshed &&
        generation === sessionGeneration.current &&
        isCurrentMobileAuthorization(authorization)
      ) {
        setMobileBearerToken(token);
      }
    },
    [runStorageOperation],
  );

  useEffect(() => {
    const generation = ++sessionGeneration.current;
    let active = true;
    setUnauthorizedHandler((authorization) => clearLocalSession(authorization));
    setSessionRefreshHandler(refreshSessionToken);
    void runStorageOperation(readBuyerSession)
      .then((session) => {
        if (!active || generation !== sessionGeneration.current) return;
        if (session) {
          setMobileBearerToken(session.token);
          setStoreSlug(session.storeSlug);
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        if (!active || generation !== sessionGeneration.current) return;
        setError("auth.sessionReadFailed");
        setStatus("unauthenticated");
      });

    return () => {
      active = false;
      setUnauthorizedHandler(undefined);
      setSessionRefreshHandler(undefined);
    };
  }, [clearLocalSession, refreshSessionToken, runStorageOperation]);

  const signIn = useCallback(
    async (slug: string, phone: string, password: string) => {
      const generation = ++sessionGeneration.current;
      setError(null);
      const response = await customerAuth.login(
        slug,
        { phone, password },
        { headers: { "X-Client": "mobile" } },
      );
      const token = response.sessionToken;
      if (!token) {
        throw new Error("auth.missingSessionToken");
      }

      if (generation !== sessionGeneration.current) {
        throw new Error("auth.sessionChanged");
      }
      await runStorageOperation(() =>
        writeBuyerSession({ token, storeSlug: slug }),
      );
      if (generation !== sessionGeneration.current) {
        throw new Error("auth.sessionChanged");
      }
      setMobileBearerToken(token);
      setStoreSlug(slug);
      setStatus("authenticated");
    },
    [runStorageOperation],
  );

  const register = useCallback(
    async (slug: string, token: string, phone: string, password: string) => {
      const generation = ++sessionGeneration.current;
      setError(null);
      await customerAuth.register(
        slug,
        { token, password },
        { headers: { "X-Client": "mobile" } },
      );
      if (generation !== sessionGeneration.current) {
        throw new Error("auth.registrationSessionChanged");
      }
      // The current registration endpoint sets the password but doesn't issue
      // a session token, so log in immediately to establish the mobile session.
      try {
        await signIn(slug, phone, password);
      } catch (cause) {
        throw new Error("auth.registrationCompleteSignInFailed", { cause });
      }
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
