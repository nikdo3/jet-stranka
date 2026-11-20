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

export const fetchPidPois = memoizedFetch<FeatureCollection<Point>>(
    "/pid/pid_pois.geojson",
);

export const fetchPidAdminZones = memoizedFetch<
    FeatureCollection<Polygon | MultiPolygon>
>("/pid/pid_admin_zones.geojson");

/** Returns the real Prague municipal district polygon (admin_level 9, or 8 fallback) containing [lng, lat]. */
export async function getPidDistrictPolygon(
    lng: number,
    lat: number,
): Promise<Feature<Polygon | MultiPolygon> | null> {
    const adminZones = await fetchPidAdminZones();
    const pt = turf.point([lng, lat]);
    return (
        adminZones.features.find(
            (f) =>
                String(f.properties?.admin_level) === "9" &&
                turf.booleanPointInPolygon(pt, f as any),
        ) ??
        adminZones.features.find(
            (f) =>
                String(f.properties?.admin_level) === "8" &&
                turf.booleanPointInPolygon(pt, f as any),
        ) ??
        null
    );
}

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

export const VLTAVA_ISLANDS: Feature<Polygon>[] = [
    turf.polygon(
        [
            [
                [14.39382, 50.118],
                [14.39418, 50.11642],
                [14.39448, 50.11645],
                [14.39492, 50.11503],
                [14.39587, 50.11384],
                [14.39764, 50.11277],
                [14.39965, 50.11221],
                [14.404, 50.11165],
                [14.41245, 50.11115],
                [14.42968, 50.11116],
                [14.42741, 50.11124],
                [14.42743, 50.11136],
                [14.42781, 50.11137],
                [14.42747, 50.11144],
                [14.42702, 50.11143],
                [14.42706, 50.11127],
                [14.42446, 50.11181],
                [14.42276, 50.11239],
                [14.41939, 50.11385],
                [14.41744, 50.11419],
                [14.41012, 50.1143],
                [14.4084, 50.1132],
                [14.40651, 50.11317],
                [14.40404, 50.11337],
                [14.40402, 50.11324],
                [14.40345, 50.11374],
                [14.40115, 50.11466],
                [14.39934, 50.11568],
                [14.39733, 50.11724],
                [14.39593, 50.11926],
                [14.39554, 50.12002],
                [14.3952, 50.1213],
                [14.3948, 50.12104],
                [14.39494, 50.12072],
                [14.39387, 50.11881],
                [14.39396, 50.11803],
                [14.39382, 50.118],
            ],
        ],
        { name: "Císařský ostrov" },
    ),
    turf.polygon(
        [
            [
                [14.43178, 50.09437],
                [14.43255, 50.09434],
                [14.43499, 50.09479],
                [14.44053, 50.09526],
                [14.44142, 50.09519],
                [14.44328, 50.09548],
                [14.44666, 50.09626],
                [14.44883, 50.09702],
                [14.44558, 50.09676],
                [14.4419, 50.09703],
                [14.43916, 50.09682],
                [14.43512, 50.09595],
                [14.43396, 50.09548],
                [14.43332, 50.09486],
                [14.43305, 50.09498],
                [14.43277, 50.09472],
                [14.43178, 50.09437],
            ],
        ],
        { name: "Štvanice" },
    ),
    turf.polygon(
        [
            [
                [14.40939, 50.08146],
                [14.40993, 50.07973],
                [14.41017, 50.0792],
                [14.41043, 50.07907],
                [14.41058, 50.07921],
                [14.4107, 50.0807],
                [14.41003, 50.08337],
                [14.40983, 50.08331],
                [14.40958, 50.08268],
                [14.40939, 50.08146],
            ],
        ],
        { name: "Střelecký ostrov" },
    ),
    turf.polygon(
        [
            [
                [14.4085, 50.08046],
                [14.4087, 50.07853],
                [14.40963, 50.07613],
                [14.40939, 50.07723],
                [14.4094, 50.07862],
                [14.40873, 50.08048],
                [14.4085, 50.08046],
            ],
        ],
        { name: "Dětský ostrov" },
    ),
    turf.polygon(
        [
            [
                [14.41217, 50.07968],
                [14.41233, 50.07883],
                [14.41296, 50.0776],
                [14.41318, 50.07663],
                [14.41334, 50.07653],
                [14.41351, 50.07717],
                [14.41327, 50.07764],
                [14.41354, 50.07857],
                [14.41353, 50.07931],
                [14.41253, 50.08042],
                [14.41225, 50.08035],
                [14.41217, 50.07968],
            ],
        ],
        { name: "Slovanský ostrov" },
    ),
    turf.polygon(
        [
            [
                [14.41439, 50.05142],
                [14.41455, 50.05138],
                [14.41507, 50.05183],
                [14.41635, 50.05324],
                [14.41691, 50.05413],
                [14.41784, 50.0567],
                [14.41801, 50.05827],
                [14.41675, 50.05556],
                [14.41654, 50.05548],
                [14.41439, 50.05142],
            ],
        ],
        { name: "Veslařský ostrov" },
    ),
    turf.polygon(
        [
            [
                [14.41151, 50.05206],
                [14.41183, 50.05124],
                [14.41421, 50.05641],
                [14.41503, 50.05958],
                [14.41498, 50.06053],
                [14.41475, 50.06124],
                [14.41286, 50.0648],
                [14.41276, 50.06394],
                [14.41325, 50.06087],
                [14.41319, 50.05863],
                [14.4126, 50.0554],
                [14.41165, 50.05293],
                [14.41151, 50.05206],
            ],
        ],
        { name: "Císařská louka" },
    ),
    turf.polygon(
        [
            [
                [14.4069, 50.08297],
                [14.40704, 50.0826],
                [14.40761, 50.08224],
                [14.40786, 50.08225],
                [14.40802, 50.08283],
                [14.40787, 50.08284],
                [14.40777, 50.0831],
                [14.40797, 50.08367],
                [14.40829, 50.08406],
                [14.40882, 50.08402],
                [14.40906, 50.08513],
                [14.40865, 50.08518],
                [14.40873, 50.08532],
                [14.4085, 50.08549],
                [14.40831, 50.08545],
                [14.40821, 50.08519],
                [14.40768, 50.08525],
                [14.40755, 50.08453],
                [14.4069, 50.08297],
            ],
        ],
        { name: "Kampa" },
    ),
];

function subtractIslands(
    bank: Feature<Polygon>,
): Feature<Polygon | MultiPolygon> {
    return (
        turf.difference(turf.featureCollection([bank, ...VLTAVA_ISLANDS])) ??
        bank
    );
}

const VLTAVA_WEST_BANK_NO_ISLANDS = subtractIslands(VLTAVA_WEST_BANK);
const VLTAVA_EAST_BANK_NO_ISLANDS = subtractIslands(VLTAVA_EAST_BANK);

/** Returns a polygon covering the Vltava bank (West/Left or East/Right) or island containing [lng, lat]. */
export function getVltavaBankPolygon(
    lng: number,
    lat: number,
): Feature<Polygon | MultiPolygon> {
    const pt = turf.point([lng, lat]);
    for (const island of VLTAVA_ISLANDS) {
        if (turf.booleanPointInPolygon(pt, island)) {
            return island;
        }
    }
    return turf.booleanPointInPolygon(pt, VLTAVA_WEST_BANK)
        ? VLTAVA_WEST_BANK_NO_ISLANDS
        : VLTAVA_EAST_BANK_NO_ISLANDS;
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
        districts: async () => {
            const fc = await fetchPidAdminZones();
            return {
                type: "FeatureCollection",
                features: fc.features
                    .filter((f) => String(f.properties?.admin_level) === "9")
                    .map((f) => ({
                        ...f,
                        properties: {
                            ...f.properties,
                            color: "#475569",
                            weight: 2,
                            dashArray: "6,5",
                            "fill-opacity": 0.04,
                        },
                    })),
            };
        },
        cadastral: async () => {
            const fc = await fetchPidAdminZones();
            return {
                type: "FeatureCollection",
                features: fc.features
                    .filter((f) => String(f.properties?.admin_level) === "10")
                    .map((f) => ({
                        ...f,
                        properties: {
                            ...f.properties,
                            color: "#7C3AED",
                            weight: 1.2,
                            dashArray: "2,4",
                            "fill-opacity": 0.02,
                        },
                    })),
            };
        },
        vltava: async () => ({
            type: "FeatureCollection",
            features: [VLTAVA_LINE, ...VLTAVA_ISLANDS].map((f) => ({
                ...f,
                properties: {
                    ...f.properties,
                    color: "#0284C7",
                    weight: 2.5,
                    "fill-opacity": 0.18,
                },
            })),
        }),
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
