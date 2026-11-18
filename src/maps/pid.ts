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
    displayHidingZonesOptions,
    hidingRadius,
    hidingRadiusUnits,
    includeDefaultStations,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    permanentOverlay,
    pidOverlayLayers,
    pidPresetVersion,
    pidStopModes,
    polyGeoJSON,
    useCustomStations,
} from "@/lib/context";
import type {
    CustomStation,
    OpenStreetMap,
    PidStopMode,
} from "@/maps/api/types";

export const PID_PRESET_VERSION = 2;

const PID_ALL_MODES: PidStopMode[] = ["metro", "tram", "bus", "rail", "ferry"];
const PID_DEFAULT_HIDING_ZONE_OPTIONS = [
    "[railway=station]",
    "[railway=halt]",
    "[railway=tram_stop]",
    "[highway=bus_stop]",
];

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
        [14.36954, 49.93117],
        [14.36956, 49.93372],
        [14.37084, 49.9354],
        [14.37353, 49.93748],
        [14.37958, 49.94139],
        [14.38406, 49.94205],
        [14.38972, 49.94165],
        [14.39305, 49.94174],
        [14.39507, 49.94241],
        [14.39614, 49.94379],
        [14.39599, 49.94551],
        [14.39327, 49.9491],
        [14.3928, 49.95021],
        [14.39263, 49.95276],
        [14.39378, 49.95767],
        [14.39585, 49.96092],
        [14.39777, 49.96509],
        [14.39827, 49.96885],
        [14.39786, 49.97155],
        [14.39766, 49.97739],
        [14.39803, 49.98193],
        [14.40043, 49.98707],
        [14.40049, 49.99234],
        [14.40245, 49.99907],
        [14.40226, 50.00193],
        [14.40146, 50.00425],
        [14.39804, 50.0097],
        [14.39696, 50.01329],
        [14.39601, 50.01874],
        [14.39611, 50.02154],
        [14.39781, 50.0271],
        [14.39992, 50.03006],
        [14.40453, 50.03548],
        [14.40861, 50.04139],
        [14.4163, 50.05794],
        [14.41557, 50.06251],
        [14.41252, 50.07021],
        [14.41108, 50.0773],
        [14.41113, 50.08344],
        [14.41079, 50.08497],
        [14.4131, 50.08986],
        [14.41489, 50.09193],
        [14.41772, 50.0933],
        [14.42148, 50.09387],
        [14.42854, 50.09435],
        [14.43923, 50.09737],
        [14.44199, 50.09764],
        [14.44647, 50.09746],
        [14.45108, 50.09803],
        [14.45463, 50.09919],
        [14.45727, 50.10045],
        [14.45987, 50.10293],
        [14.4605, 50.10535],
        [14.46022, 50.10725],
        [14.45915, 50.10903],
        [14.45724, 50.11078],
        [14.45546, 50.11191],
        [14.45291, 50.11291],
        [14.44388, 50.11328],
        [14.43403, 50.1118],
        [14.43055, 50.11162],
        [14.42421, 50.11243],
        [14.42056, 50.11377],
        [14.41749, 50.11439],
        [14.4086, 50.11352],
        [14.40556, 50.11355],
        [14.40221, 50.1147],
        [14.39928, 50.1168],
        [14.39702, 50.11917],
        [14.39677, 50.12263],
        [14.39757, 50.12387],
        [14.39955, 50.12551],
        [14.40095, 50.12726],
        [14.40129, 50.12885],
        [14.40059, 50.13035],
        [14.39908, 50.1316],
        [14.39459, 50.13374],
        [14.3928, 50.13516],
        [14.39246, 50.13615],
        [14.39292, 50.13732],
        [14.39381, 50.13827],
        [14.39654, 50.14035],
        [14.39819, 50.14354],
        [14.40014, 50.15389],
        [14.4021, 50.15917],
        [14.40366, 50.16559],
        [14.40317, 50.16756],
        [14.40169, 50.17],
        [14.40028, 50.17139],
        [14.39849, 50.17231],
        [14.39634, 50.17271],
        [14.38973, 50.17261],
        [14.38044, 50.17147],
        [14.37525, 50.17183],
        [14.37106, 50.17128],
        [14.35959, 50.16828],
        [14.35582, 50.16865],
        [14.35372, 50.16986],
        [14.35279, 50.17118],
        [14.35222, 50.17399],
        [14.35241, 50.17536],
        [14.35332, 50.17675],
        [14.35733, 50.17937],
        [14.36375, 50.18095],
        [14.36842, 50.1828],
        [14.37199, 50.1846],
        [14.37578, 50.19018],
        [14.37632, 50.19135],
        [14.37657, 50.19332],
        [14.37556, 50.19539],
        [14.37369, 50.19725],
        [14.36873, 50.19996],
    ],
    { name: "Řeka Vltava" },
);

const VLTAVA_EXTENDED_COORDS: [number, number][] = [
    [14.36954, -90],
    ...(VLTAVA_LINE.geometry.coordinates as [number, number][]),
    [14.36873, 90],
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

export function filterPidStationsByModes(
    stations: CustomStation[],
    modes: PidStopMode[],
): CustomStation[] {
    const modeSet = new Set(modes);
    return stations.filter((s) => {
        const hasModeFlags =
            typeof s.is_metro === "boolean" ||
            typeof s.is_tram === "boolean" ||
            typeof s.is_bus === "boolean" ||
            typeof s.is_rail === "boolean" ||
            typeof s.is_ferry === "boolean";
        if (!hasModeFlags) return true;
        return (
            (s.is_metro === true && modeSet.has("metro")) ||
            (s.is_tram === true && modeSet.has("tram")) ||
            (s.is_bus === true && modeSet.has("bus")) ||
            (s.is_rail === true && modeSet.has("rail")) ||
            (s.is_ferry === true && modeSet.has("ferry"))
        );
    });
}

export async function refreshPidStationsAndOverlay(): Promise<void> {
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
            if (typeof props.category === "string")
                station.category = props.category;
            if (typeof props.is_metro === "boolean")
                station.is_metro = props.is_metro;
            if (typeof props.is_tram === "boolean")
                station.is_tram = props.is_tram;
            if (typeof props.is_bus === "boolean")
                station.is_bus = props.is_bus;
            if (typeof props.is_rail === "boolean")
                station.is_rail = props.is_rail;
            if (typeof props.is_ferry === "boolean")
                station.is_ferry = props.is_ferry;
            return station;
        });

    customStations.set(stations);
    useCustomStations.set(true);
    includeDefaultStations.set(false);
    pidStopModes.set([...PID_ALL_MODES]);
    displayHidingZonesOptions.set([...PID_DEFAULT_HIDING_ZONE_OPTIONS]);
    pidPresetVersion.set(PID_PRESET_VERSION);

    const overlay = await buildPidOverlay(pidOverlayLayers.get());
    permanentOverlay.set(overlay);
}

export async function loadPidPraguePreset(): Promise<void> {
    defaultUnit.set("kilometers");
    hidingRadius.set(0.5);
    hidingRadiusUnits.set("kilometers");

    await refreshPidStationsAndOverlay();

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
