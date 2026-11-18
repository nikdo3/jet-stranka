import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    LineString,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import osmtogeojson from "osmtogeojson";

import {
    customStations,
    defaultUnit,
    hidingRadius,
    hidingRadiusUnits,
    includeDefaultStations,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    permanentOverlay,
    pidOverlayLayers,
    polyGeoJSON,
    useCustomStations,
} from "@/lib/context";
import type { CustomStation, OpenStreetMap } from "@/maps/api/types";

export const PRAGUE_MAP_GEO_LOCATION: OpenStreetMap = {
    type: "Feature",
    properties: {
        osm_type: "R",
        osm_id: 435514,
        osm_key: "place",
        osm_value: "city",
        type: "city",
        name: "Praha",
        state: "Hlavní město Praha",
        country: "Česko",
        countrycode: "CZ",
        extent: [50.1774, 14.2244, 49.9419, 14.7068],
    },
    geometry: {
        type: "Point",
        coordinates: [50.0875, 14.421],
    },
};

export function withBase(path: string): string {
    const base = ((import.meta as any).env?.BASE_URL ?? "/").replace(
        /\/+$/,
        "",
    );
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `${base}${clean}`;
}

function memoizedFetch<T>(path: string, transform?: (data: any) => T) {
    let promise: Promise<T> | null = null;
    return (): Promise<T> => {
        if (!promise) {
            promise = fetch(withBase(path))
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(`Failed to fetch ${path}: ${res.status}`);
                    }
                    return res.json();
                })
                .then((data) => (transform ? transform(data) : data))
                .catch((err) => {
                    promise = null;
                    throw err;
                });
        }
        return promise;
    };
}

export const fetchPidZones = memoizedFetch<
    FeatureCollection<Polygon | MultiPolygon>
>("/pid/pid_zones_p0b.geojson");

export const fetchPidMetroTramLines = memoizedFetch<FeatureCollection>(
    "/pid/pid_metro_tram_lines.geojson",
);

export const fetchPidBackgroundLines = memoizedFetch<FeatureCollection>(
    "/pid/pid_background_buses_trains.geojson",
);

export const fetchPidStopsGeoJSON = memoizedFetch<FeatureCollection<Point>>(
    "/pid/pid_stops_p0b.geojson",
);

export const fetchPidCityDistricts = memoizedFetch<FeatureCollection<Point>>(
    "/pid/pid_city_districts.geojson",
);

export const fetchPragueBorderGeoJSON = memoizedFetch<
    FeatureCollection<Polygon | MultiPolygon>
>("/pid/praha_border.json", (data) => {
    const geo = osmtogeojson(data);
    return {
        ...geo,
        features: geo.features.filter(
            (f: any) => f.geometry?.type !== "Point",
        ) as Feature<Polygon | MultiPolygon>[],
    };
});

export const VLTAVA_LINE: Feature<LineString> = turf.lineString(
    [
        [14.392, 49.97],
        [14.402, 50.04],
        [14.414, 50.066],
        [14.411, 50.086],
        [14.442, 50.105],
        [14.395, 50.125],
        [14.395, 50.16],
    ],
    { name: "Řeka Vltava" },
);

const VLTAVA_EXTENDED_COORDS: [number, number][] = [
    [14.392, -90],
    ...(VLTAVA_LINE.geometry.coordinates as [number, number][]),
    [14.395, 90],
];

const VLTAVA_WEST_BANK: Feature<Polygon> = turf.polygon([
    [[-180, -90], ...VLTAVA_EXTENDED_COORDS, [-180, 90], [-180, -90]],
]);

const VLTAVA_EAST_BANK: Feature<Polygon> = turf.polygon([
    [[180, -90], [180, 90], ...[...VLTAVA_EXTENDED_COORDS].reverse(), [180, -90]],
]);

/** Returns a polygon covering the Vltava bank (West/Left or East/Right) containing [lng, lat]. */
export function getVltavaBankPolygon(
    lng: number,
    lat: number,
): Feature<Polygon> {
    const pt = turf.point([lng, lat]);
    return turf.booleanPointInPolygon(pt, VLTAVA_WEST_BANK)
        ? VLTAVA_WEST_BANK
        : VLTAVA_EAST_BANK;
}

export async function buildPidOverlay(
    layers: string[],
): Promise<FeatureCollection> {
    const layerFetchers: Record<string, () => Promise<FeatureCollection>> = {
        zones: async () => {
            const fc = await fetchPidZones();
            return {
                ...fc,
                features: fc.features.map((f) => ({
                    ...f,
                    properties: {
                        ...f.properties,
                        "fill-opacity": 0.14,
                        "stroke-width": 2,
                    },
                })),
            };
        },
        metro_tram: fetchPidMetroTramLines,
        background: fetchPidBackgroundLines,
        stops: fetchPidStopsGeoJSON,
    };

    const selected = layers.filter((l) => l in layerFetchers);
    const collections = await Promise.all(
        selected.map((l) => layerFetchers[l]()),
    );

    return {
        type: "FeatureCollection",
        features: collections.flatMap((c) => c.features),
    };
}

export async function loadPidPraguePreset(): Promise<void> {
    defaultUnit.set("kilometers");
    hidingRadius.set(0.5);
    hidingRadiusUnits.set("kilometers");

    const stopsFC = await fetchPidStopsGeoJSON();
    const stations: CustomStation[] = stopsFC.features
        .filter((f) => f.geometry?.type === "Point")
        .map((f) => {
            const [lng, lat] = f.geometry.coordinates;
            const props: any = f.properties || {};
            const id = String(props.node_id ?? props.id ?? `${lat},${lng}`);
            const station: CustomStation = {
                id,
                name: props.name,
                lat,
                lng,
            };
            if (Array.isArray(props.lines)) station.lines = props.lines;
            if (typeof props.zone === "string") station.zone = props.zone;
            if (typeof props.is_metro === "boolean")
                station.is_metro = props.is_metro;
            if (typeof props.is_tram === "boolean")
                station.is_tram = props.is_tram;
            return station;
        });

    customStations.set(stations);
    useCustomStations.set(true);
    includeDefaultStations.set(false);

    const overlay = await buildPidOverlay(pidOverlayLayers.get());
    permanentOverlay.set(overlay);

    mapGeoLocation.set(PRAGUE_MAP_GEO_LOCATION);
    polyGeoJSON.set(null);
    mapGeoJSON.set(null);

    const map = leafletMapContext.get();
    if (map) {
        map.fitBounds([
            [49.9419, 14.2244],
            [50.1774, 14.7068],
        ]);
    }
}
