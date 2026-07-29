import { useCallback, useEffect, useState } from "react";
import type { WritableDatabaseRepository } from "../repository/WritableDatabaseRepository.ts";
import { databaseRepository } from "../repository/PersistentDatabaseRepository.ts";

export interface UseDatabaseResult {
  loading: boolean;
  error: string | null;
  repository: WritableDatabaseRepository | null;
  reload: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка загрузки базы данных.";
}

export function useDatabase(): UseDatabaseResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repository, setRepository] = useState<WritableDatabaseRepository | null>(null);

  const load = useCallback(async (forceReload: boolean): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (forceReload) await databaseRepository.reload();
      else await databaseRepository.load();
      setRepository(databaseRepository);
    } catch (loadError: unknown) {
      setRepository(null);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(async (): Promise<void> => {
    await load(true);
  }, [load]);

  return { loading, error, repository, reload };
}
