import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customerAuth } from "@biasmarket/types";
import {
  deleteBuyerSession,
  readBuyerSession,
  writeBuyerSession,
} from "./session-storage";
import {
  isCurrentMobileAuthorization,
  setMobileBearerToken,
  setUnauthorizedHandler,
} from "./api-client";
import { registerBuyerPushToken, unregisterBuyerPushToken } from "./push-token";
import { useMobileI18n } from "../../i18n/mobile-i18n";

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
  const { t } = useMobileI18n();
  const queryClient = useQueryClient();
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

  const clearLocalSession = useCallback(async (authorization?: string) => {
    if (authorization && !isCurrentMobileAuthorization(authorization)) return;
    const generation = ++sessionGeneration.current;
    try {
      await runStorageOperation(deleteBuyerSession);
    } catch (cause) {
      if (
        generation === sessionGeneration.current &&
        (!authorization || isCurrentMobileAuthorization(authorization))
      ) {
        setError("auth.sessionDeleteFailed");
      }
      throw cause;
    }
    if (
      generation !== sessionGeneration.current ||
      (authorization && !isCurrentMobileAuthorization(authorization))
    ) return;
    queryClient.removeQueries({ queryKey: ["private-payment-proof"] });
    queryClient.removeQueries({ queryKey: ["buyer"] });
    queryClient.removeQueries({ queryKey: ["buyer-order"] });
    setMobileBearerToken(null);
    setStoreSlug(null);
    setStatus("unauthenticated");
  }, [queryClient, runStorageOperation, t]);

  useEffect(() => {
    const generation = ++sessionGeneration.current;
    let active = true;
    setUnauthorizedHandler((authorization) => clearLocalSession(authorization));
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
        setStatus("unauthenticated");
        setError("auth.sessionReadFailed");
      });

    return () => {
      active = false;
      setUnauthorizedHandler(undefined);
    };
  }, [clearLocalSession, runStorageOperation, t]);

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
        throw new Error(t("auth.missingSessionToken"));
      }

      if (generation !== sessionGeneration.current) {
        throw new Error(t("auth.sessionChanged"));
      }
      await runStorageOperation(() =>
        writeBuyerSession({ token, storeSlug: slug }),
      );
      if (generation !== sessionGeneration.current) {
        throw new Error(t("auth.sessionChanged"));
      }
      setMobileBearerToken(token);
      void registerBuyerPushToken(
        slug,
        t("notifications.defaultChannel"),
      ).catch(() => undefined);
      setStoreSlug(slug);
      setStatus("authenticated");
    },
    [runStorageOperation, t],
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
        throw new Error(t("auth.registrationSessionChanged"));
      }
      // The current registration endpoint sets the password but doesn't issue
      // a session token, so log in immediately to establish the mobile session.
      await signIn(slug, phone, password);
    },
    [signIn, t],
  );

  const signOut = useCallback(async () => {
    setError(null);
    if (storeSlug) {
      try {
        await unregisterBuyerPushToken(storeSlug);
      } catch {
        /* local logout must still complete */
      }
    }
    await clearLocalSession();
  }, [clearLocalSession, storeSlug]);

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
