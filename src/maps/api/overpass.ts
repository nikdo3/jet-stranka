import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    mapGeoLocation,
    overpassCustomHost,
    overpassHost,
    polyGeoJSON,
} from "@/lib/context";
import { safeUnion } from "@/maps/geo-utils";
import {
    fetchPidPois,
    fetchPidStopsGeoJSON,
    fetchPragueBorderGeoJSON,
} from "@/maps/pid";

import { cacheFetch, determineCache } from "./cache";
import { LOCATION_FIRST_TAG, OVERPASS_HOSTS } from "./constants";
import type {
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    QuestionSpecificLocation,
} from "./types";
import { CacheType } from "./types";

type TentacleLocationQuery = Pick<
    EncompassingTentacleQuestionSchema,
    "lat" | "lng" | "radius" | "unit" | "locationType"
>;

export const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    const encodedQuery = encodeURIComponent(query);
    const allHostUrls = Object.values(OVERPASS_HOSTS);
    const selectedHost = overpassHost.get();
    const customUrl = overpassCustomHost.get();

    const primaryBaseUrl =
        selectedHost === "custom"
            ? customUrl || allHostUrls[0]
            : selectedHost || allHostUrls[0];
    const fallbackBaseUrls = allHostUrls.filter((h) => h !== primaryBaseUrl);

    const primaryUrl = `${primaryBaseUrl}?data=${encodedQuery}`;
    let response: Response | null = null;
    try {
        response = await cacheFetch(primaryUrl, loadingText, cacheType);
    } catch {
        // Fall through to fallback hosts
    }

    if (!response || !response.ok) {
        for (const fallbackBase of fallbackBaseUrls) {
            try {
                const fallbackResponse = await cacheFetch(
                    `${fallbackBase}?data=${encodedQuery}`,
                    loadingText,
                    cacheType,
                );
                if (fallbackResponse.ok) {
                    const cache = await determineCache(cacheType);
                    await cache.put(primaryUrl, fallbackResponse.clone());
                    response = fallbackResponse;
                    break;
                }
            } catch {
                continue;
            }
        }
    }

    if (!response || !response.ok) {
        toast.error(
            `Could not load data from Overpass: ${response?.status ?? "Network Error"} ${response?.statusText ?? ""}`.trim(),
            { toastId: "overpass-error" },
        );
        return { elements: [] };
    }

    const data = await response.json();
    return data;
};

export const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
): Promise<any> => {
    if (osmId === "435514" && osmTypeLetter === "R") {
        try {
            return await fetchPragueBorderGeoJSON();
        } catch {
            // Fall back to Overpass
        }
    }
    const osmTypeMap: { [key: string]: string } = {
        W: "way",
        R: "relation",
        N: "node",
    };
    const osmType = osmTypeMap[osmTypeLetter];
    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(
        query,
        "Loading map data...",
        CacheType.PERMANENT_CACHE,
    );
    const geo = osmtogeojson(data);
    return {
        ...geo,
        features: geo.features.filter(
            (feature: any) => feature.geometry.type !== "Point",
        ),
    };
};

export const findTentacleLocations = async (
    question: TentacleLocationQuery,
    text: string = "Determining tentacle locations...",
) => {
    if (question.locationType === "metro_station") {
        const stops = await fetchPidStopsGeoJSON();
        const center = turf.point([question.lng, question.lat]);
        const maxMeters = turf.convertLength(
            question.radius,
            question.unit,
            "meters",
        );
        const seen = new Set<string>();
        const features = stops.features.filter((f) => {
            if (f.properties?.is_metro !== true) return false;
            const name = f.properties?.name;
            if (!name || seen.has(name)) return false;
            if (turf.distance(center, f, { units: "meters" }) > maxMeters) {
                return false;
            }
            seen.add(name);
            return true;
        });
        return turf.featureCollection(features);
    }

    const isPrague =
        mapGeoLocation.get()?.properties?.osm_id === 435514 ||
        (question.lat >= 49.90 &&
            question.lat <= 50.22 &&
            question.lng >= 14.18 &&
            question.lng <= 14.75);

    const firstTag = LOCATION_FIRST_TAG[question.locationType];
    if (isPrague && firstTag) {
        const pois = await fetchPidPois();
        const center = turf.point([question.lng, question.lat]);
        const maxMeters = turf.convertLength(
            question.radius,
            question.unit,
            "meters",
        );
        const seen = new Set<string>();
        const response = turf.points([]);
        for (const feature of pois.features) {
            const props = (feature.properties || {}) as any;
            if (props[firstTag] !== question.locationType) continue;
            const name = props.name_en ?? props.name;
            if (!name || seen.has(name)) continue;
            if (
                turf.distance(center, feature as any, { units: "meters" }) >
                maxMeters
            ) {
                continue;
            }
            seen.add(name);
            response.features.push(
                turf.point(
                    [
                        feature.geometry.coordinates[0],
                        feature.geometry.coordinates[1],
                    ],
                    { ...props, name },
                ),
            );
        }
        return response;
    }

    const query = `
[out:json][timeout:25];
nwr["${LOCATION_FIRST_TAG[question.locationType]}"="${question.locationType}"](around:${turf.convertLength(
        question.radius,
        question.unit,
        "meters",
    )}, ${question.lat}, ${question.lng});
out center;
    `;
    const data = await getOverpassData(query, text);
    const elements = data.elements;
    const response = turf.points([]);
    elements.forEach((element: any) => {
        if (!element.tags["name"] && !element.tags["name:en"]) return;
        if (element.lat && element.lon) {
            const name = element.tags["name:en"] ?? element.tags["name"];
            if (
                response.features.find(
                    (feature: any) => feature.properties.name === name,
                )
            )
                return;
            response.features.push(
                turf.point([element.lon, element.lat], { name }),
            );
        }
        if (!element.center || !element.center.lon || !element.center.lat)
            return;
        const name = element.tags["name:en"] ?? element.tags["name"];
        if (
            response.features.find(
                (feature: any) => feature.properties.name === name,
            )
        )
            return;
        response.features.push(
            turf.point([element.center.lon, element.center.lat], { name }),
        );
    });
    return response;
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
) => {
    const query = `
[out:json];
is_in(${latitude}, ${longitude})->.a;
rel(pivot.a)["admin_level"="${adminLevel}"];
out geom;
    `;
    const data = await getOverpassData(query, "Determining matching zone...");
    const geo = osmtogeojson(data);
    return geo.features?.[0];
};

export const fetchCoastline = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/coastline50.geojson",
        "Fetching coastline data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const trainLineNodeFinder = async (node: string): Promise<number[]> => {
    const nodeId = node.split("/")[1];
    const tagQuery = `
[out:json];
node(${nodeId});
wr(bn);
rel(bn)["route"~"^(subway|tram|train|light_rail|monorail|bus|trolleybus|ferry)$"];
out tags;
`;
    const tagData = await getOverpassData(tagQuery, "Finding train line...");
    const query = `
[out:json];
(
${tagData.elements
    .map((element: any) => {
        if (
            !element.tags.name &&
            !element.tags["name:en"] &&
            !element.tags.network
        )
            return "";
        let query = "";
        if (element.tags.name) query += `wr["name"="${element.tags.name}"];`;
        if (element.tags["name:en"])
            query += `wr["name:en"="${element.tags["name:en"]}"];`;
        if (element.tags["network"])
            query += `wr["network"="${element.tags["network"]}"];`;
        return query;
    })
    .join("\n")}
);
out geom;
`;
    const data = await getOverpassData(query, "Finding train lines...");
    const geoJSON = osmtogeojson(data);
    const nodes: number[] = [];
    geoJSON.features.forEach((feature: any) => {
        if (feature && feature.id && feature.id.startsWith("node")) {
            nodes.push(parseInt(feature.id.split("/")[1]));
        }
    });
    data.elements.forEach((element: any) => {
        if (element && element.type === "node") {
            nodes.push(element.id);
        } else if (element && element.type === "way") {
            nodes.push(...element.nodes);
        }
    });
    const uniqNodes = _.uniq(nodes);
    return uniqNodes;
};

async function getPragueOfflinePlaces(
    filter: string,
): Promise<{ elements: any[] } | null> {
    if (filter.includes("place=city")) {
        return {
            elements: [
                {
                    type: "node",
                    id: 435514,
                    lat: 50.0875,
                    lon: 14.421,
                    tags: {
                        place: "city",
                        name: "Praha",
                        "name:en": "Prague",
                        population: "1350000",
                    },
                },
            ],
        };
    }

    const poiToElement = (f: any) => {
        const p = f.properties || {};
        const tags: Record<string, string> = { ...p };
        delete (tags as any).id;
        if (p.name_en && !tags["name:en"]) {
            tags["name:en"] = p.name_en;
        }
        return {
            type: "node",
            id: p.id ?? 0,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            tags,
        };
    };

    if (filter.includes("aeroway") && filter.includes("iata")) {
        const pois = await fetchPidPois();
        const elements = pois.features
            .filter(
                (f) =>
                    f.properties?.aeroway === "aerodrome" && f.properties?.iata,
            )
            .map(poiToElement);
        return { elements };
    }

    if (filter.includes("brand:wikidata") || filter.includes("Q38076")) {
        const pois = await fetchPidPois();
        const elements = pois.features
            .filter((f) => f.properties?.["brand:wikidata"] === "Q38076")
            .map(poiToElement);
        return { elements };
    }

    if (
        filter.includes("natural=peak") ||
        filter.includes('"natural"="peak"')
    ) {
        const pois = await fetchPidPois();
        const elements = pois.features
            .filter((f) => f.properties?.natural === "peak")
            .map(poiToElement);
        return { elements };
    }

    if (
        filter.includes("diplomatic=consulate") ||
        filter.includes('"diplomatic"="consulate"')
    ) {
        const pois = await fetchPidPois();
        const elements = pois.features
            .filter((f) => f.properties?.diplomatic === "consulate")
            .map(poiToElement);
        return { elements };
    }

    const amenityMatch = filter.match(/\["?amenity"?="?([a-zA-Z0-9_]+)"?\]/);
    if (amenityMatch) {
        const val = amenityMatch[1];
        if (["cinema", "hospital", "library"].includes(val)) {
            const pois = await fetchPidPois();
            const elements = pois.features
                .filter((f) => f.properties?.amenity === val)
                .map(poiToElement);
            return { elements };
        }
    }

    const tourismMatch = filter.match(/\["?tourism"?="?([a-zA-Z0-9_]+)"?\]/);
    if (tourismMatch) {
        const val = tourismMatch[1];
        if (["museum", "zoo", "aquarium", "theme_park"].includes(val)) {
            const pois = await fetchPidPois();
            const elements = pois.features
                .filter((f) => f.properties?.tourism === val)
                .map(poiToElement);
            return { elements };
        }
    }

    const leisureMatch = filter.match(/\["?leisure"?="?([a-zA-Z0-9_]+)"?\]/);
    if (leisureMatch) {
        const val = leisureMatch[1];
        if (["park", "golf_course"].includes(val)) {
            const pois = await fetchPidPois();
            const elements = pois.features
                .filter((f) => f.properties?.leisure === val)
                .map(poiToElement);
            return { elements };
        }
    }

    return null;
}

export const findPlacesInZone = async (
    filter: string,
    loadingText?: string,
    searchType:
        | "node"
        | "way"
        | "relation"
        | "nwr"
        | "nw"
        | "wr"
        | "nr"
        | "area" = "nwr",
    outType: "center" | "geom" = "center",
    alternatives: string[] = [],
    timeoutDuration: number = 0,
) => {
    let data: any = null;

    const $polyGeoJSON = polyGeoJSON.get();
    const primaryLocation = mapGeoLocation.get();
    const isPragueOnly =
        !$polyGeoJSON &&
        primaryLocation?.properties?.osm_id === 435514 &&
        additionalMapGeoLocations.get().filter((e) => e.added).length === 0;

    if (isPragueOnly) {
        data = await getPragueOfflinePlaces(filter);
    }

    if (!data) {
        let query = "";
        if ($polyGeoJSON) {
            query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
(
${searchType}${filter}(poly:"${turf
                .getCoords($polyGeoJSON.features)
                .flatMap((polygon) => polygon.geometry.coordinates)
                .flat()
                .map((coord) => [coord[1], coord[0]].join(" "))
                .join(" ")}");
${
    alternatives.length > 0
        ? alternatives
              .map(
                  (alternative) =>
                      `${searchType}${alternative}(poly:"${turf
                          .getCoords($polyGeoJSON.features)
                          .flatMap((polygon) => polygon.geometry.coordinates)
                          .flat()
                          .map((coord) => [coord[1], coord[0]].join(" "))
                          .join(" ")}");`,
              )
              .join("\n")
        : ""
}
);
out ${outType};
`;
        } else {
            const additionalLocations = additionalMapGeoLocations
                .get()
                .filter((entry) => entry.added)
                .map((entry) => entry.location);
            const allLocations = [primaryLocation, ...additionalLocations];
            const relationToAreaBlocks = allLocations
                .map((loc, idx) => {
                    const regionVar = `.region${idx}`;
                    return `relation(${loc.properties.osm_id});map_to_area->${regionVar};`;
                })
                .join("\n");
            const searchBlocks = allLocations
                .map((_, idx) => {
                    const regionVar = `area.region${idx}`;
                    const altQueries =
                        alternatives.length > 0
                            ? alternatives
                                  .map(
                                      (alt) => `${searchType}${alt}(${regionVar});`,
                                  )
                                  .join("\n")
                            : "";
                    return `
                ${searchType}${filter}(${regionVar});
                ${altQueries}
              `;
                })
                .join("\n");
            query = `
            [out:json]${timeoutDuration !== 0 ? `[timeout:${timeoutDuration}]` : ""};
            ${relationToAreaBlocks}
            (
            ${searchBlocks}
            );
            out ${outType};
            `;
        }
        data = await getOverpassData(
            query,
            loadingText,
            CacheType.ZONE_CACHE,
        );
        if (data && Array.isArray(data.elements)) {
            data.elements = data.elements.filter(
                (el: any) =>
                    !(
                        el.tags?.proposed ||
                        el.tags?.construction ||
                        el.tags?.disused === "yes" ||
                        el.tags?.abandoned === "yes" ||
                        el.tags?.["disused:railway"] ||
                        el.tags?.["proposed:railway"] ||
                        el.tags?.["construction:railway"] ||
                        el.tags?.["abandoned:railway"]
                    ),
            );
        }
    }
    const subtractedEntries = additionalMapGeoLocations
        .get()
        .filter((e) => !e.added);
    const subtractedPolygons = subtractedEntries.map((entry) => entry.location);
    if (subtractedPolygons.length > 0 && data && data.elements) {
        const turfPolys = await Promise.all(
            subtractedPolygons.map(
                async (location) =>
                    turf.combine(
                        await determineGeoJSON(
                            location.properties.osm_id.toString(),
                            location.properties.osm_type,
                        ),
                    ).features[0],
            ),
        );
        data.elements = data.elements.filter((el: any) => {
            const lon = el.center ? el.center.lon : el.lon;
            const lat = el.center ? el.center.lat : el.lat;
            if (typeof lon !== "number" || typeof lat !== "number")
                return false;
            const pt = turf.point([lon, lat]);
            return !turfPolys.some((poly) =>
                turf.booleanPointInPolygon(pt, poly as any),
            );
        });
    }
    return data;
};

export const findPlacesSpecificInZone = async (
    location: `${QuestionSpecificLocation}`,
) => {
    const locations = (
        await findPlacesInZone(
            location,
            `Finding ${
                location === '["brand:wikidata"="Q38076"]'
                    ? "McDonald's"
                    : "7-Elevens"
            }...`,
        )
    ).elements;
    return turf.featureCollection(
        locations.map((x: any) =>
            turf.point([
                x.center ? x.center.lon : x.lon,
                x.center ? x.center.lat : x.lat,
            ]),
        ),
    );
};

export const nearestToQuestion = async (
    question: HomeGameMatchingQuestions | HomeGameMeasuringQuestions,
) => {
    let radius = 30;
    let instances: any = { features: [] };
    while (instances.features.length === 0 && radius <= 120) {
        instances = await findTentacleLocations(
            {
                lat: question.lat,
                lng: question.lng,
                radius: radius,
                unit: "miles",
                locationType: question.type,
            },
            "Finding matching locations...",
        );
        radius += 30;
    }
    if (instances.features.length === 0) {
        throw new Error(
            `No matching ${question.type} locations found within 120 miles.`,
        );
    }
    const questionPoint = turf.point([question.lng, question.lat]);
    return turf.nearestPoint(questionPoint, instances as any);
};

export const determineMapBoundaries = async () => {
    const mapGeoDatum = await Promise.all(
        [
            {
                location: mapGeoLocation.get(),
                added: true,
                base: true,
            },
            ...additionalMapGeoLocations.get(),
        ].map(async (location) => ({
            added: location.added,
            data: await determineGeoJSON(
                location.location.properties.osm_id.toString(),
                location.location.properties.osm_type,
            ),
        })),
    );

    let mapGeoData = turf.featureCollection([
        safeUnion(
            turf.featureCollection(
                mapGeoDatum
                    .filter((x) => x.added)
                    .flatMap((x) => x.data.features),
            ) as any,
        ),
    ]);

    const differences = mapGeoDatum.filter((x) => !x.added).map((x) => x.data);

    if (differences.length > 0) {
        mapGeoData = turf.featureCollection([
            turf.difference(
                turf.featureCollection([
                    mapGeoData.features[0],
                    ...differences.flatMap((x) => x.features),
                ]),
            )!,
        ]);
    }

    if (turf.coordAll(mapGeoData).length > 10000) {
        turf.simplify(mapGeoData, {
            tolerance: 0.0005,
            highQuality: true,
            mutate: true,
        });
    }

    return turf.combine(mapGeoData) as FeatureCollection<MultiPolygon>;
};
