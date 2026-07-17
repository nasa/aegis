/**
 * FollowModeProvider — context for dashboard "follow mode" settings.
 *
 * Owns the `followMode` on/off toggle and the per-item `followModeOptions`
 * (stations, traverses, and each running-REX pos type). Provides values AND
 * setters so both the headless `FollowMode` behavior (which computes the
 * auto-pan/zoom extent) and the `MapFollowMenu` overlay (the "Auto Pan/Zoom
 * Map" toggle + "Select Items to Follow" dropdown) can share this state
 * without prop drilling.
 *
 * Dashboard only — wrap `<AegisMapDashboard>`'s map with this provider.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

export interface FollowModeSettings {
  followMode: boolean;
  followModeOptions: MapFollowOptions;
}

export interface FollowModeSetters {
  setFollowMode: Dispatch<SetStateAction<boolean>>;
  setFollowModeOptions: Dispatch<SetStateAction<MapFollowOptions>>;
}

const FollowModeContext = createContext<FollowModeSettings | null>(null);
const FollowModeSettersContext = createContext<FollowModeSetters | null>(null);

export function useFollowModeContext(): FollowModeSettings {
  const ctx = useContext(FollowModeContext);
  if (!ctx) throw new Error("useFollowModeContext must be used inside <FollowModeProvider>");
  return ctx;
}

export function useFollowModeSetters(): FollowModeSetters {
  const ctx = useContext(FollowModeSettersContext);
  if (!ctx) throw new Error("useFollowModeSetters must be used inside <FollowModeProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface FollowModeProviderProps {
  children: ReactNode;
}

export function FollowModeProvider({ children }: FollowModeProviderProps): JSX.Element {
  const [followMode, setFollowMode] = useState<boolean>(true);

  // Default follow options — stations and traverses are always present.
  const defaultFollowOptions = useMemo<MapFollowOptions>(
    () => ({
      stations: { follow: true, name: "Stations" },
      traverses: { follow: true, name: "Traverses" },
    }),
    []
  );
  const [followModeOptions, setFollowModeOptions] =
    useState<MapFollowOptions>(defaultFollowOptions);

  const posTypes = useMissionDocSelector((m) => {
    const rex = Object.values(m.rexes ?? {}).find((r) => r.isRunning);
    return rex?.posTypes ?? [];
  }, deepEqual);

  // Rebuild pos-type follow options when the running REX's pos types change,
  // preserving any existing follow state the user has toggled.
  useEffect(() => {
    if (!posTypes.length) return;
    const followPosOptions: MapFollowOptions = {};
    for (const pt of posTypes) {
      followPosOptions[pt.uuid] = {
        follow: pt.name === "EV1" || pt.name === "EV2",
        name: pt.name,
      };
    }
    setFollowModeOptions((prev) => ({
      ...defaultFollowOptions,
      ...followPosOptions,
      // Preserve any existing follow state for pos types that haven't changed
      ...Object.keys(prev).reduce((preserved, key) => {
        if (key !== "stations" && key !== "traverses" && followPosOptions[key]) {
          preserved[key] = {
            ...followPosOptions[key],
            follow: prev[key]?.follow ?? followPosOptions[key].follow,
          };
        }
        return preserved;
      }, {} as MapFollowOptions),
    }));
  }, [posTypes, defaultFollowOptions]);

  const settings = useMemo<FollowModeSettings>(
    () => ({ followMode, followModeOptions }),
    [followMode, followModeOptions]
  );

  const setters = useMemo<FollowModeSetters>(() => ({ setFollowMode, setFollowModeOptions }), []);

  return (
    <FollowModeContext.Provider value={settings}>
      <FollowModeSettersContext.Provider value={setters}>
        {children}
      </FollowModeSettersContext.Provider>
    </FollowModeContext.Provider>
  );
}
