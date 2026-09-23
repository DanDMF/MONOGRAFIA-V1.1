import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { get, post } from "./api";

export interface Me {
  user: { id: string; email: string; display_name: string } | null;
  projects: { id: string; slug: string; name: string; academic_title: string | null; is_demo: boolean; role: "author" | "reviewer" }[];
}

interface SessionCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  projectId: string | null;
  setProjectId: (id: string) => void;
  role: "author" | "reviewer" | null;
  canWrite: boolean;
  project: Me["projects"][number] | null;
}

const Ctx = createContext<SessionCtx | null>(null);
const KEY = "vrban.project";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectId, setPid] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await get<Me>("/api/auth/me"));
    } catch {
      setMe({ user: null, projects: [] });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const setProjectId = (id: string) => {
    setPid(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* só nesta sessão */
    }
  };
  const project = me?.projects.find((p) => p.id === projectId) ?? me?.projects[0] ?? null;
  const logout = async () => {
    await post("/api/auth/logout");
    await refresh();
  };
  return (
    <Ctx.Provider
      value={{
        me,
        loading,
        refresh,
        logout,
        projectId: project?.id ?? null,
        setProjectId,
        role: project?.role ?? null,
        canWrite: project?.role === "author",
        project,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SessionProvider em falta");
  return c;
}

/** Prefixo da API do projeto ativo. */
export function useProjectApi() {
  const { projectId } = useSession();
  return `/api/projects/${projectId}`;
}
