import type { Feature, FeatureCollection, GeoJSON, Point } from "geojson";
import Papa from "papaparse";

import type {
    CustomStation,
    StationPlace,
    StationPlaceProperties,
} from "./types";

const PID_BOOLEAN_FIELDS = [
    "is_metro",
    "is_tram",
    "is_bus",
    "is_rail",
    "is_ferry",
] as const;

const STATION_META_FIELDS = [
    "lines",
    "zone",
    "category",
    ...PID_BOOLEAN_FIELDS,
] as const;

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes")
        return true;
    if (normalized === "false" || normalized === "0" || normalized === "no")
        return false;
    return undefined;
}

function parseOptionalLines(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.map((v) => String(v));
            }
        } catch {
            // Fall through to delimiter split
        }
    }
    const parts = trimmed
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
}

function parseCSV(text: string): CustomStation[] {
    const { data, errors } = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.toLowerCase().trim(),
    });

    if (errors.length > 0) {
        throw new Error(`CSV parse error: ${errors[0].message}`);
    }

    const firstRow = data[0] ?? {};
    const headers = Object.keys(firstRow);

    const latKey = headers.find((h) => ["lat", "latitude"].includes(h));
    const lngKey = headers.find((h) =>
        ["lng", "lon", "long", "longitude"].includes(h),
    );
    const nameKey = headers.find((h) =>
        ["name", "title", "station", "label"].includes(h),
    );
    const idKey = headers.find((h) =>
        ["id", "station_id", "osm_id"].includes(h),
    );

    if (!latKey)
        throw new Error("CSV missing required 'lat' or 'latitude' column");
    if (!lngKey)
        throw new Error(
            "CSV missing required 'lng', 'lon', 'long', or 'longitude' column",
        );
    if (!nameKey)
        throw new Error(
            "CSV missing required 'name', 'title', 'station', or 'label' column",
        );

    const stations: CustomStation[] = [];
    for (const row of data) {
        const lat = parseFloat(row[latKey]);
        const lng = parseFloat(row[lngKey]);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const name = row[nameKey];
        if (!name) continue;
        const id = idKey && row[idKey] ? row[idKey] : `${lat},${lng}`;
        const station: CustomStation = { id, name, lat, lng };
        const lines = parseOptionalLines(row.lines);
        if (lines) station.lines = lines;
        if (row.zone?.trim()) station.zone = row.zone.trim();
        if (row.category?.trim()) station.category = row.category.trim();
        for (const field of PID_BOOLEAN_FIELDS) {
            const parsed = parseOptionalBoolean(row[field]);
            if (parsed !== undefined) station[field] = parsed;
        }
        stations.push(station);
    }
    return stations;
}

function parseGeoJSON(obj: any): CustomStation[] {
    const stations: CustomStation[] = [];
    const pushFromFeature = (f: Feature<Point>) => {
        if (!f.geometry || f.geometry.type !== "Point") return;
        const [lng, lat] = f.geometry.coordinates;
        if (!isFinite(lat) || !isFinite(lng)) return;
        const props: any = f.properties || {};
        const name = props["name:en"] || props.name || props.title;
        const id =
            props.id ||
            props.node_id ||
            props.osm_id ||
            props["@id"] ||
            `${lat},${lng}`;
        const station: CustomStation = { id: String(id), name, lat, lng };
        if (Array.isArray(props.lines)) station.lines = props.lines;
        if (typeof props.zone === "string") station.zone = props.zone;
        if (typeof props.category === "string")
            station.category = props.category;
        for (const field of PID_BOOLEAN_FIELDS) {
            if (typeof props[field] === "boolean") {
                station[field] = props[field];
            }
        }
        stations.push(station);
    };
    if (obj.type === "FeatureCollection") {
        (obj as FeatureCollection).features.forEach((f) =>
            pushFromFeature(f as Feature<Point>),
        );
    } else if (obj.type === "Feature") {
        pushFromFeature(obj as Feature<Point>);
    } else if (obj.type === "Point") {
        const [lng, lat] = (obj as GeoJSON & Point).coordinates as [
            number,
            number,
        ];
        stations.push({ id: `${lat},${lng}`, lat, lng });
    }
    return stations;
}

function parseKML(text: string): CustomStation[] {
    // Really light-weight parser for Point Placemarks; works for Google MyMaps export
    const stations: CustomStation[] = [];
    const placemarks = text.split(/<Placemark[\s>]/i).slice(1);
    for (const pm of placemarks) {
        const nameMatch = pm.match(/<name>([\s\S]*?)<\/name>/i);
        const coordsMatch = pm.match(
            /<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i,
        );
        if (!coordsMatch) continue;
        // coordinates are lng,lat[,alt]
        const coordStr = coordsMatch[1].trim().split(/\s+/)[0];
        const parts = coordStr.split(",");
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const name = nameMatch ? nameMatch[1].trim() : undefined;
        const id = `${lat},${lng}`;
        stations.push({ id, name, lat, lng });
    }
    return stations;
}

export function parseCustomStationsFromText(
    text: string,
    contentTypeHint?: string,
): CustomStation[] {
    // Try by hint
    const hint = (contentTypeHint || "").toLowerCase();
    try {
        if (hint.includes("json")) {
            return parseGeoJSON(JSON.parse(text));
        }
        if (
            hint.includes("kml") ||
            text.includes("<kml") ||
            text.includes("<Placemark")
        ) {
            return parseKML(text);
        }
        if (
            hint.includes("csv") ||
            text.includes(",lat") ||
            text.match(/lat[,;\t ]+lon|latitude/i)
        ) {
            return parseCSV(text);
        }
    } catch {
        // Fall through
    }

    // Try generic detection
    try {
        const obj = JSON.parse(text);
        return parseGeoJSON(obj);
    } catch {
        // Not JSON
    }
    if (text.includes("<kml")) {
        return parseKML(text);
    }
    return parseCSV(text);
}

export function normalizeToStationFeatures(
    stations: CustomStation[],
): FeatureCollection<Point, StationPlaceProperties> {
    // Return GeoJSON FeatureCollection of Points carrying properties { id, name }
    const features: StationPlace[] = stations.map((s) => {
        const properties: StationPlaceProperties = { id: s.id, name: s.name };
        for (const field of STATION_META_FIELDS) {
            if (s[field] !== undefined) properties[field] = s[field];
        }
        return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            properties,
        };
    });
    return { type: "FeatureCollection", features };
}
