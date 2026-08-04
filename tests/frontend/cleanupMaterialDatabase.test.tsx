import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMaterialDatabase,
  LEGACY_MATERIAL_DATABASE_NAME,
  MATERIAL_DATABASE_CLEANUP_MARKER,
  MATERIAL_DATABASE_CLEANUP_MARKER_VALUE,
} from "../../src/legacy/cleanupMaterialDatabase.ts";

type DeleteRequestHandler = ((event: Event) => void) | null;

interface DeleteRequestStub {
  onsuccess: DeleteRequestHandler;
  onerror: DeleteRequestHandler;
  onblocked: DeleteRequestHandler;
}

function installIndexedDbStub(): {
  deleteDatabase: ReturnType<typeof vi.fn>;
  request: DeleteRequestStub;
} {
  const request: DeleteRequestStub = {
    onsuccess: null,
    onerror: null,
    onblocked: null,
  };
  const deleteDatabase = vi.fn(() => request);
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: { deleteDatabase },
  });
  return { deleteDatabase, request };
}

function dispatch(handler: DeleteRequestHandler): void {
  handler?.(new Event("test"));
}

const originalIndexedDb = window.indexedDB;
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: originalIndexedDb,
  });
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
  window.localStorage.clear();
});

describe("legacy material IndexedDB cleanup", () => {
  it("deletes the exact legacy database, stores the marker and skips later runs", async () => {
    const { deleteDatabase, request } = installIndexedDbStub();

    const firstRun = cleanupMaterialDatabase();
    expect(deleteDatabase).toHaveBeenCalledOnce();
    expect(deleteDatabase).toHaveBeenCalledWith(LEGACY_MATERIAL_DATABASE_NAME);
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBeNull();

    dispatch(request.onsuccess);
    await expect(firstRun).resolves.toBe("completed");
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBe(
      MATERIAL_DATABASE_CLEANUP_MARKER_VALUE,
    );

    await expect(cleanupMaterialDatabase()).resolves.toBe("already-completed");
    expect(deleteDatabase).toHaveBeenCalledOnce();
  });

  it("treats an absent database as a successful deletion", async () => {
    const { request } = installIndexedDbStub();
    const cleanup = cleanupMaterialDatabase();

    dispatch(request.onsuccess);

    await expect(cleanup).resolves.toBe("completed");
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBe(
      MATERIAL_DATABASE_CLEANUP_MARKER_VALUE,
    );
  });

  it("handles blocked deletion without writing the marker and permits retry", async () => {
    const { deleteDatabase, request } = installIndexedDbStub();
    const firstRun = cleanupMaterialDatabase();

    dispatch(request.onblocked);
    await expect(firstRun).resolves.toBe("blocked");
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBeNull();

    dispatch(request.onsuccess);
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBeNull();

    void cleanupMaterialDatabase();
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
  });

  it("handles deletion errors without writing the marker", async () => {
    const { request } = installIndexedDbStub();
    const cleanup = cleanupMaterialDatabase();

    dispatch(request.onerror);

    await expect(cleanup).resolves.toBe("error");
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBeNull();
  });

  it("does not throw when IndexedDB is unavailable", async () => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });

    await expect(cleanupMaterialDatabase()).resolves.toBe("unavailable");
    expect(window.localStorage.getItem(MATERIAL_DATABASE_CLEANUP_MARKER)).toBeNull();
  });

  it("does not start deletion when localStorage is unavailable", async () => {
    const { deleteDatabase } = installIndexedDbStub();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage unavailable");
      },
    });

    await expect(cleanupMaterialDatabase()).resolves.toBe("unavailable");
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it("handles a marker write failure without an unhandled rejection", async () => {
    const { request } = installIndexedDbStub();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write unavailable");
    });
    const cleanup = cleanupMaterialDatabase();

    dispatch(request.onsuccess);

    await expect(cleanup).resolves.toBe("error");
  });

  it("does not clear storage, delete other databases or call CAD APIs", async () => {
    const existingSetting = "profigym:interface:setting";
    window.localStorage.setItem(existingSetting, "preserved");
    const clear = vi.spyOn(Storage.prototype, "clear");
    const fetch = vi.spyOn(globalThis, "fetch");
    const { deleteDatabase, request } = installIndexedDbStub();
    const cleanup = cleanupMaterialDatabase();

    dispatch(request.onsuccess);
    await cleanup;

    expect(deleteDatabase.mock.calls).toEqual([[LEGACY_MATERIAL_DATABASE_NAME]]);
    expect(clear).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(existingSetting)).toBe("preserved");
    expect(window.localStorage.length).toBe(2);
  });
});
