import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import {
    PASTEBIN_API_POST_URL,
    PASTEBIN_API_RAW_URL,
    PASTEBIN_API_RAW_URL_PROXIED,
} from "@/maps/api/constants";
import { PRAGUE_MAP_GEO_LOCATION } from "@/maps/pid";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const mapToObj = <T, K extends string, V>(
    arr: T[],
    fn: (item: T) => [K, V],
) => Object.fromEntries(arr.map(fn));

export const compress = async (
    str: string,
    encoding: CompressionFormat = "deflate",
): Promise<string> => {
    const byteArray = new TextEncoder().encode(str);
    const cs = new CompressionStream(encoding);
    const writer = cs.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    const arrayBuffer = await new Response(cs.readable).arrayBuffer();

    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
};

export const decompress = async (
    base64String: string,
    encoding: CompressionFormat = "deflate",
): Promise<string> => {
    const regularBase64 = base64String.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 =
        regularBase64 + "=".repeat((4 - (regularBase64.length % 4)) % 4);

    const binaryString = atob(paddedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const cs = new DecompressionStream(encoding);
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const arrayBuffer = await new Response(cs.readable).arrayBuffer();
    return new TextDecoder().decode(arrayBuffer);
};

export async function uploadToPastebin(
    apiKey: string,
    data: string,
): Promise<string> {
    const formData = new FormData();
    formData.append("api_option", "paste");
    formData.append("api_dev_key", apiKey);
    formData.append("api_paste_code", data);
    formData.append("api_paste_private", "1"); // 1 for unlisted
    formData.append("api_paste_expire_date", "N"); // N for never

    const response = await fetch(PASTEBIN_API_POST_URL, {
        method: "POST",
        body: formData,
    });

    const responseText = await response.text();
    if (!response.ok || responseText.startsWith("Bad API request,")) {
        throw new Error("Pastebin API error: " + responseText);
    }

    return responseText;
}

export async function fetchFromPastebin(pasteId: string): Promise<string> {
    let response;
    try {
        // prefer querying Pastebin directly since CORS proxy is unreliable
        response = await fetch(PASTEBIN_API_RAW_URL + pasteId);
    } catch {
        // CORS error; happens if the paste is not owned by a Pastebin Pro user
        const rawUrl = PASTEBIN_API_RAW_URL + pasteId;
        const targetUrl = PASTEBIN_API_RAW_URL_PROXIED.startsWith(
            "https://corsproxy.io/?url=",
        )
            ? "https://corsproxy.io/?url=" + encodeURIComponent(rawUrl)
            : PASTEBIN_API_RAW_URL_PROXIED + pasteId;
        response = await fetch(targetUrl);
    }

    if (!response.ok) {
        throw new Error(
            "Failed to fetch from Pastebin: " + response.statusText,
        );
    }

    return response.text();
}

/**
 * Strips heavy static preset fields (like ~800 KB Prague PID stations and overlays)
 * and empty arrays to keep share URLs well within reasonable limits.
 */
export function compactHidingZoneForShare(
    zone: any,
    pidStopModes?: string[],
    pidOverlayLayers?: string[],
): any {
    if (!zone || typeof zone !== "object") return zone;

    const compacted = { ...zone };

    if (
        compacted.properties?.osm_id === 435514 ||
        compacted.pidPreset === true
    ) {
        delete compacted.customStations;
        delete compacted.permanentOverlay;
        compacted.pidPreset = true;
        if (pidStopModes && pidStopModes.length > 0) {
            compacted.pidStopModes = pidStopModes;
        }
        if (pidOverlayLayers && pidOverlayLayers.length > 0) {
            compacted.pidOverlayLayers = pidOverlayLayers;
        }
    }

    if (Array.isArray(compacted.presets) && compacted.presets.length === 0) {
        delete compacted.presets;
    }
    if (
        compacted.properties &&
        Array.isArray(compacted.properties.presets) &&
        compacted.properties.presets.length === 0
    ) {
        compacted.properties = { ...compacted.properties };
        delete compacted.properties.presets;
    }
    if (
        Array.isArray(compacted.alternateLocations) &&
        compacted.alternateLocations.length === 0
    ) {
        delete compacted.alternateLocations;
    }

    return compacted;
}

/**
 * Open native share sheet or fallback to sending to clipboard
 * @param url URL to share
 * @param forceClipboard Whether to force usage of the clipboard (instead of share sheet)
 * @returns `true` for native success, `false` for both native and fallback failure and `"clipboard"` for clipboard success
 */
export async function shareOrFallback(
    url: string,
    forceClipboard = false,
): Promise<boolean | "clipboard"> {
    if (forceClipboard) {
        if (!navigator || !navigator.clipboard) {
            // Clipboard not supported
            return false;
        }

        navigator.clipboard.writeText(url);
        return "clipboard";
    }

    if (!navigator.share) return shareOrFallback(url, true); // Fallback to clipboard

    return await navigator
        .share({ url })
        .then(() => true)
        .catch(() => {
            // Try again with clipboard
            return shareOrFallback(url, true);
        });
}

export async function shortenShareUrl(
    longUrl: string,
): Promise<string | null> {
    if (!longUrl || longUrl.length > 4500) {
        return null;
    }

    const services = [
        `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`,
        `https://v.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`,
    ];

    for (const serviceUrl of services) {
        try {
            const signal =
                typeof AbortSignal !== "undefined" &&
                typeof (AbortSignal as any).timeout === "function"
                    ? (AbortSignal as any).timeout(3500)
                    : undefined;
            const res = await fetch(serviceUrl, { signal });
            if (res.ok) {
                const data = await res.json();
                if (
                    typeof data?.shorturl === "string" &&
                    data.shorturl.trim().startsWith("https://")
                ) {
                    return data.shorturl.trim();
                }
            }
        } catch {
            // Try next service
        }
    }

    return null;
}

const PID_DEFAULT_HIDING_ZONE_OPTIONS = [
    "[railway=station]",
    "[railway=halt]",
    "[railway=tram_stop]",
    "[highway=bus_stop]",
];
const PID_ALL_MODES = ["metro", "tram", "bus", "rail", "ferry"];
const PID_DEFAULT_OVERLAY_LAYERS = ["zones", "metro_tram", "stops"];

const generateUUID = (): string => {
    if (
        typeof crypto !== "undefined" &&
        typeof (crypto as any).randomUUID === "function"
    ) {
        return (crypto as any).randomUUID();
    }
    return String(Math.random());
};

export async function encodeShortSharePayload(
    zone: any,
    pidStopModes?: string[],
    pidOverlayLayers?: string[],
): Promise<string> {
    const isPrague =
        zone?.properties?.osm_id === 435514 &&
        zone?.properties?.isHidingZone === true;

    if (!isPrague) {
        const compacted = compactHidingZoneForShare(
            zone,
            pidStopModes,
            pidOverlayLayers,
        );
        const payload = {
            v: 2,
            z: compacted,
        };
        return compress(JSON.stringify(payload), "deflate-raw");
    }

    const payload: any = { v: 2, p: 1 };

    if (zone.hidingRadius !== undefined && zone.hidingRadius !== 0.5) {
        payload.r = zone.hidingRadius;
    }
    if (
        zone.hidingRadiusUnits &&
        zone.hidingRadiusUnits !== "kilometers"
    ) {
        payload.u = zone.hidingRadiusUnits;
    }
    if (
        zone.useCustomStations !== undefined &&
        zone.useCustomStations !== true
    ) {
        payload.ucs = zone.useCustomStations;
    }
    if (zone.includeDefaultStations === true) {
        payload.ids = true;
    }

    if (
        Array.isArray(zone.zoneOptions) &&
        (zone.zoneOptions.length !== PID_DEFAULT_HIDING_ZONE_OPTIONS.length ||
            !PID_DEFAULT_HIDING_ZONE_OPTIONS.every(
                (o, i) =>
                    zone.zoneOptions[i] === o || zone.zoneOptions.includes(o),
            ))
    ) {
        payload.zo = zone.zoneOptions;
    }

    const modes = pidStopModes ?? zone.pidStopModes;
    if (
        Array.isArray(modes) &&
        (modes.length !== 5 ||
            !PID_ALL_MODES.every((m) => modes.includes(m as any)))
    ) {
        payload.m = modes;
    }

    const layers = pidOverlayLayers ?? zone.pidOverlayLayers;
    if (
        Array.isArray(layers) &&
        (layers.length !== 3 ||
            !PID_DEFAULT_OVERLAY_LAYERS.every((l) => layers.includes(l)))
    ) {
        payload.o = layers;
    }

    if (
        Array.isArray(zone.disabledStations) &&
        zone.disabledStations.length > 0
    ) {
        payload.d = zone.disabledStations;
    }

    const rawPresets = zone.presets ?? zone.properties?.presets;
    if (Array.isArray(rawPresets) && rawPresets.length > 0) {
        payload.presets = rawPresets;
    }

    if (
        Array.isArray(zone.alternateLocations) &&
        zone.alternateLocations.length > 0
    ) {
        payload.alternateLocations = zone.alternateLocations;
    }

    const rawQuestions = zone.questions ?? zone.properties?.questions;
    if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
        const compactedQuestions = rawQuestions.map((item: any) => {
            const q: any = {};
            const type =
                item.type ??
                ([
                    "radius",
                    "radar",
                    "thermometer",
                    "tentacles",
                    "measuring",
                    "matching",
                ].includes(item.id)
                    ? item.id
                    : undefined);
            if (type) {
                q.type = type;
            }
            if (item.text) {
                q.text = item.text;
            }
            if (item.data && typeof item.data === "object") {
                const d: any = { ...item.data };
                if (d.drag === false) delete d.drag;
                if (d.collapsed === false) delete d.collapsed;
                q.data = d;
            }
            return q;
        });
        payload.q = compactedQuestions;
    }

    return compress(JSON.stringify(payload), "deflate-raw");
}

export async function decodeShortSharePayload(
    encoded: string,
): Promise<any> {
    let jsonStr: string;
    try {
        jsonStr = await decompress(encoded, "deflate-raw");
    } catch {
        jsonStr = await decompress(encoded, "deflate");
    }
    const payload = JSON.parse(jsonStr);

    if (payload.p !== 1 && payload.v === 2 && payload.z) {
        return payload.z;
    }

    if (payload.p !== 1 && !payload.z) {
        return payload;
    }

    // Reconstruct Prague preset
    const decodedQuestions = (payload.q ?? []).map((item: any) => {
        const id = generateUUID();
        const d = item.data ? { ...item.data } : {};
        if (d.drag === undefined) d.drag = false;
        if (d.collapsed === undefined) d.collapsed = false;

        const res: any = {
            id,
            ...item,
            data: d,
        };
        return res;
    });

    const reconstructed: any = {
        ...structuredClone(PRAGUE_MAP_GEO_LOCATION),
        osm_id: 435514,
        properties: {
            ...structuredClone(PRAGUE_MAP_GEO_LOCATION.properties),
            osm_id: 435514,
            isHidingZone: true,
            questions: decodedQuestions,
        },
        isHidingZone: true,
        questions: decodedQuestions,
        pidPreset: true,
        hidingRadius: payload.r ?? 0.5,
        hidingRadiusUnits: payload.u ?? "kilometers",
        useCustomStations: payload.ucs ?? true,
        includeDefaultStations: payload.ids ?? false,
        zoneOptions: payload.zo ?? [
            "[railway=station]",
            "[railway=halt]",
            "[railway=tram_stop]",
            "[highway=bus_stop]",
        ],
        disabledStations: payload.d ?? [],
        pidStopModes: payload.m ?? ["metro", "tram", "bus", "rail", "ferry"],
        pidOverlayLayers: payload.o ?? ["zones", "metro_tram", "stops"],
        alternateLocations: payload.alternateLocations ?? [],
        presets: payload.presets ?? [],
    };

    return reconstructed;
}
