"use client";

import { useEffect, useState } from "react";

type Country = { code: string; name: string };

/**
 * Loads countries/states via TrustLayer API routes (server fetch + offline fallback).
 * Avoids browser CORS "Failed to fetch" against restcountries.com.
 */
export default function CountryRegionSelect({
  country,
  region,
  onCountry,
  onRegion,
}: {
  country: string;
  region: string;
  onCountry: (code: string) => void;
  onRegion: (value: string) => void;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingStates, setLoadingStates] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingCountries(true);
        const r = await fetch("/api/geo/countries");
        const body = await r.json();
        if (!cancelled) {
          setCountries(body.countries || []);
          if (body.source === "fallback") {

          }
        }
      } catch {
        if (!cancelled) setHint("Could not load countries.");
      } finally {
        if (!cancelled) setLoadingCountries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!country) {
      setStates([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingStates(true);
        const r = await fetch(
          `/api/geo/states?country=${encodeURIComponent(country)}`
        );
        const body = await r.json();
        if (!cancelled) setStates(body.states || []);
      } catch {
        if (!cancelled) setStates([]);
      } finally {
        if (!cancelled) setLoadingStates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">
        Country
        <select
          value={country}
          onChange={(e) => {
            onCountry(e.target.value);
            onRegion("");
          }}
          disabled={loadingCountries}
          className="mt-2 w-full rounded-xl border border-[var(--tl-line)] bg-white px-4 py-3"
        >
          <option value="">
            {loadingCountries ? "Loading countries…" : "Select country"}
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">
        State / region
        {states.length > 0 ? (
          <select
            value={region}
            onChange={(e) => onRegion(e.target.value)}
            disabled={loadingStates}
            className="mt-2 w-full rounded-xl border border-[var(--tl-line)] bg-white px-4 py-3"
          >
            <option value="">
              {loadingStates ? "Loading…" : "Select state / region"}
            </option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={region}
            onChange={(e) => onRegion(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--tl-line)] px-4 py-3"
            placeholder={
              loadingStates
                ? "Loading regions…"
                : "Type region if list unavailable"
            }
          />
        )}
      </label>
      {hint ? (
        <p className="text-xs text-[var(--tl-muted)] sm:col-span-2">{hint}</p>
      ) : null}
    </div>
  );
}
