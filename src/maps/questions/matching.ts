import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    customStations,
    disabledStations,
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    pidStopModes,
    polyGeoJSON,
    useCustomStations,
} from "@/lib/context";
import {
    findAdminBoundary,
    findAdminZonesInPrague,
    findPlacesInZone,
    LOCATION_FIRST_TAG,
    nearestToQuestion,
    normalizeToStationFeatures,
    prettifyLocation,
    trainLineNodeFinder,
} from "@/maps/api";
import { holedMask, modifyMapData, safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils";
import {
    fetchPidCityDistricts,
    fetchPidStopsGeoJSON,
    fetchPidZones,
    filterPidStationsByModes,
    getVltavaBankPolygon,
} from "@/maps/pid";
import type {
    APILocations,
    HomeGameMatchingQuestions,
    MatchingQuestion,
} from "@/maps/schema";

export const findMatchingPlaces = async (question: MatchingQuestion) => {
    switch (question.type) {
        case "airport": {
            return _.uniqBy(
                (
                    await findPlacesInZone(
                        '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                        "Finding airports...",
                    )
                ).elements,
                (feature: any) => feature.tags.iata,
            ).map((x) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
        case "major-city": {
            return (
                await findPlacesInZone(
                    '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                    "Finding cities...",
                )
            ).elements.map((x: any) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
        case "custom-points": {
            return question.geo!;
        }
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full": {
            const location = question.type.split("-full")[0] as APILocations;

            const data = await findPlacesInZone(
                `[${LOCATION_FIRST_TAG[location]}=${location}]`,
                `Finding ${prettifyLocation(location, true).toLowerCase()}...`,
                "nwr",
                "center",
                [],
                60,
            );

            if (data.remark && data.remark.startsWith("runtime error")) {
                toast.error(
                    `Error finding ${prettifyLocation(
                        location,
                        true,
                    ).toLowerCase()}. Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [];
            }

            if (data.elements.length >= 1000) {
                toast.error(
                    `Too many ${prettifyLocation(
                        location,
                        true,
                    ).toLowerCase()} found (${data.elements.length}). Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [];
            }

            return data.elements.map((x: any) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
    }
};

export const determineMatchingBoundary = _.memoize(
    async (question: MatchingQuestion) => {
        let boundary;

        switch (question.type) {
            case "aquarium":
            case "zoo":
            case "theme_park":
            case "peak":
            case "museum":
            case "hospital":
            case "cinema":
            case "library":
            case "golf_course":
            case "consulate":
            case "park":
            case "same-first-letter-station":
            case "same-length-station":
            case "same-train-line": {
                return false;
            }
            case "custom-zone": {
                if (!question.geo) return false;
                const flattened = turf.flatten(question.geo as any);
                if (!flattened.features || flattened.features.length === 0) return false;
                const pt = turf.point([question.lng, question.lat]);
                boundary =
                    flattened.features.find(
                        (f) =>
                            ((f.geometry.type as string) === "Polygon" ||
                                (f.geometry.type as string) === "MultiPolygon") &&
                            turf.booleanPointInPolygon(pt, f as any),
                    ) ?? question.geo;
                break;
            }
            case "pid-zone": {
                const zones = await fetchPidZones();
                const pt = turf.point([question.lng, question.lat]);
                const zP = zones.features.find(
                    (f) => f.properties?.zone === "P",
                );
                const z0 = zones.features.find(
                    (f) => f.properties?.zone === "0",
                );
                const zB = zones.features.find(
                    (f) => f.properties?.zone === "B",
                );
                if (zP && turf.booleanPointInPolygon(pt, zP)) {
                    boundary = zP;
                } else if (z0 && turf.booleanPointInPolygon(pt, z0)) {
                    boundary = zP
                        ? turf.difference(turf.featureCollection([z0, zP]))!
                        : z0;
                } else if (zB && turf.booleanPointInPolygon(pt, zB)) {
                    boundary = z0
                        ? turf.difference(turf.featureCollection([zB, z0]))!
                        : zB;
                } else {
                    boundary = holedMask(zones)!;
                }
                break;
            }
            case "pid-district": {
                const districts = await fetchPidCityDistricts();
                const voronoi = geoSpatialVoronoi(districts);
                const pt = turf.point([question.lng, question.lat]);
                boundary = voronoi.features.find((f) =>
                    turf.booleanPointInPolygon(pt, f),
                );
                if (!boundary) {
                    toast.error("No PID district found at this location");
                    throw new Error("No PID district found");
                }
                break;
            }
            case "pid-line": {
                const stops = await fetchPidStopsGeoJSON();
                const pt = turf.point([question.lng, question.lat]);
                const nearest = turf.nearestPoint(pt, stops);
                const targetLines: string[] = nearest.properties?.lines ?? [];
                const voronoi = geoSpatialVoronoi(stops);
                const matchingCells = voronoi.features.filter((cell: any) => {
                    const cellLines: string[] =
                        cell.properties?.site?.properties?.lines ?? [];
                    return cellLines.some((l) => targetLines.includes(l));
                });
                if (matchingCells.length === 0) {
                    toast.error("No PID line found at this location");
                    throw new Error("No PID line found");
                }
                boundary = safeUnion(turf.featureCollection(matchingCells));
                break;
            }
            case "vltava-bank": {
                boundary = getVltavaBankPolygon(question.lng, question.lat);
                break;
            }
            case "zone": {
                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!boundary) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }
                break;
            }
            case "letter-zone": {
                const zone = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!zone) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }

                const rawName = (
                    (zone.properties?.["name:en"] as string | undefined) ||
                    (zone.properties?.name as string | undefined) ||
                    ""
                ).trim();

                const ascii = rawName
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                if (!ascii || !/^[a-zA-Z]/.test(ascii)) {
                    toast.error("No valid name found for this zone");
                    throw new Error("No valid name");
                }

                const letter = ascii[0].toUpperCase();

                let offlineFeatures: Feature<Polygon | MultiPolygon>[] | null =
                    null;
                if (
                    mapGeoLocation.get()?.properties?.osm_id === 435514 &&
                    !polyGeoJSON.get()
                ) {
                    offlineFeatures = await findAdminZonesInPrague(
                        question.cat.adminLevel,
                        letter,
                    );
                }

                if (offlineFeatures && offlineFeatures.length > 0) {
                    boundary = turf.featureCollection(offlineFeatures);
                } else {
                    boundary = turf.featureCollection(
                        osmtogeojson(
                            await findPlacesInZone(
                                `[admin_level=${question.cat.adminLevel}]["name:en"~"^${letter}.+"]`, // Regex is faster than filtering afterward
                                `Finding zones that start with the same letter (${letter})...`,
                                "relation",
                                "geom",
                                [
                                    `[admin_level=${question.cat.adminLevel}]["name"~"^${letter}.+"]`,
                                ], // Regex is faster than filtering afterward
                            ),
                        ).features.filter(
                            (x): x is Feature<Polygon | MultiPolygon> =>
                                x.geometry &&
                                (x.geometry.type === "Polygon" ||
                                    x.geometry.type === "MultiPolygon"),
                        ),
                    );
                }

                if (boundary.features.length === 0) {
                    toast.error("No matching zones found");
                    throw new Error("No matching zones found");
                }

                // It's either simplify or crash. Technically this could be bad if someone's hiding zone was inside multiple zones, but that's unlikely.
                boundary = safeUnion(
                    turf.simplify(boundary, {
                        tolerance: 0.001,
                        highQuality: true,
                        mutate: true,
                    }),
                );

                break;
            }
            case "airport":
            case "major-city":
            case "aquarium-full":
            case "zoo-full":
            case "theme_park-full":
            case "peak-full":
            case "museum-full":
            case "hospital-full":
            case "cinema-full":
            case "library-full":
            case "golf_course-full":
            case "consulate-full":
            case "park-full":
            case "custom-points": {
                const data = await findMatchingPlaces(question);
                if (!data || (Array.isArray(data) && data.length < 2)) {
                    return false;
                }

                const voronoi = geoSpatialVoronoi(data);
                const point = turf.point([question.lng, question.lat]);

                for (const feature of voronoi.features) {
                    if (turf.booleanPointInPolygon(point, feature)) {
                        boundary = feature;
                        break;
                    }
                }
                break;
            }
        }

        return boundary;
    },
    (question: MatchingQuestion & { geo?: unknown; cat?: unknown }) =>
        JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            cat: question.cat,
            geo: question.geo,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
        }),
);

export const adjustPerMatching = async (
    question: MatchingQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const boundary = await determineMatchingBoundary(question);

    if (boundary === false) {
        return mapData;
    }

    return modifyMapData(mapData, boundary, question.same);
};

export const hiderifyMatching = async (question: MatchingQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (
        [
            "aquarium",
            "zoo",
            "theme_park",
            "peak",
            "museum",
            "hospital",
            "cinema",
            "library",
            "golf_course",
            "consulate",
            "park",
        ].includes(question.type)
    ) {
        const questionNearest = await nearestToQuestion(
            question as HomeGameMatchingQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            same: true,
            type: (question as HomeGameMatchingQuestions).type,
            drag: false,
            color: "black",
            collapsed: false,
            hidden: false,
        });

        question.same =
            questionNearest.properties.name === hiderNearest.properties.name;

        return question;
    }

    if (
        question.type === "same-first-letter-station" ||
        question.type === "same-length-station" ||
        question.type === "same-train-line"
    ) {
        const hiderPoint = turf.point([
            $hiderMode.longitude,
            $hiderMode.latitude,
        ]);
        const seekerPoint = turf.point([question.lng, question.lat]);

        let places: FeatureCollection<Point> | null = null;
        if (useCustomStations.get() && customStations.get().length > 0) {
            const disabledSet = new Set(disabledStations.get());
            const filtered = filterPidStationsByModes(
                customStations.get(),
                pidStopModes.get(),
            ).filter((s) => !disabledSet.has(s.id));
            if (filtered.length > 0) {
                places = normalizeToStationFeatures(
                    filtered,
                ) as FeatureCollection<Point>;
            }
        }

        if (!places) {
            places = osmtogeojson(
                await findPlacesInZone(
                    "[railway=station]",
                    "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                    "node",
                ),
            ) as FeatureCollection<Point>;
        }

        if (!places || places.features.length === 0) {
            return question;
        }

        const nearestHiderTrainStation = turf.nearestPoint(hiderPoint, places);
        const nearestSeekerTrainStation = turf.nearestPoint(
            seekerPoint,
            places,
        );

        if (question.type === "same-train-line") {
            const seekerLines = nearestSeekerTrainStation.properties?.lines;
            const hiderLines = nearestHiderTrainStation.properties?.lines;
            if (Array.isArray(seekerLines) && Array.isArray(hiderLines)) {
                question.same = seekerLines.some((l: string) =>
                    hiderLines.includes(l),
                );
            } else if (
                String(nearestSeekerTrainStation.properties?.id || "").includes(
                    "/",
                ) &&
                String(nearestHiderTrainStation.properties?.id || "").includes(
                    "/",
                )
            ) {
                const nodes = await trainLineNodeFinder(
                    nearestSeekerTrainStation.properties.id,
                );

                const hiderId = parseInt(
                    nearestHiderTrainStation.properties.id.split("/")[1],
                );

                question.same = nodes.includes(hiderId);
            } else {
                question.same = false;
            }
        }

        const hiderEnglishName =
            nearestHiderTrainStation.properties["name:en"] ||
            nearestHiderTrainStation.properties.name;
        const seekerEnglishName =
            nearestSeekerTrainStation.properties["name:en"] ||
            nearestSeekerTrainStation.properties.name;

        if (!hiderEnglishName || !seekerEnglishName) {
            return question;
        }

        if (question.type === "same-first-letter-station") {
            const hiderAscii = hiderEnglishName
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const seekerAscii = seekerEnglishName
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            question.same =
                hiderAscii[0]?.toUpperCase() === seekerAscii[0]?.toUpperCase();
        } else if (question.type === "same-length-station") {
            if (hiderEnglishName.length === seekerEnglishName.length) {
                question.lengthComparison = "same";
            } else if (hiderEnglishName.length < seekerEnglishName.length) {
                question.lengthComparison = "shorter";
            } else {
                question.lengthComparison = "longer";
            }
        }

        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask((await adjustPerMatching(question, $mapGeoJSON))!);
    } catch {
        try {
            feature = await adjustPerMatching(question, {
                type: "FeatureCollection",
                features: [holedMask($mapGeoJSON)],
            });
        } catch {
            return question;
        }
    }

    if (feature === null || feature === undefined) return question;

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.same = !question.same;
    }

    return question;
};

export const matchingPlanningPolygon = async (question: MatchingQuestion) => {
    try {
        const boundary = await determineMatchingBoundary(question);

        if (boundary === false) {
            return false;
        }

        return turf.polygonToLine(boundary);
    } catch {
        return false;
    }
};
