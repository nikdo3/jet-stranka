import * as turf from "@turf/turf";

import { hiderMode } from "@/lib/context";
import { safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils/voronoi";
import type { ThermometerQuestion } from "@/maps/schema";

const getThermometerPoints = (question: ThermometerQuestion) => {
    const latB =
        Math.abs(question.latB - question.latA) < 1e-5
            ? question.latB + 1e-5
            : question.latB;
    return [
        turf.point([question.lngA, question.latA]),
        turf.point([question.lngB, latB]),
    ];
};

export const adjustPerThermometer = (
    question: ThermometerQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const voronoi = geoSpatialVoronoi(
        turf.featureCollection(getThermometerPoints(question)),
    );

    if (question.warmer) {
        return turf.intersect(
            turf.featureCollection([safeUnion(mapData), voronoi.features[1]]),
        );
    } else {
        return turf.intersect(
            turf.featureCollection([safeUnion(mapData), voronoi.features[0]]),
        );
    }
};

export const hiderifyThermometer = (question: ThermometerQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const voronoi = geoSpatialVoronoi(
        turf.featureCollection(getThermometerPoints(question)),
    );

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
    const hiderRegion = turf.booleanPointInPolygon(
        hiderPoint,
        voronoi.features[1],
    )
        ? 1
        : 0;

    if (hiderRegion === 1) {
        question.warmer = true;
    } else {
        question.warmer = false;
    }

    return question;
};

export const thermometerPlanningPolygon = (question: ThermometerQuestion) => {
    const voronoi = geoSpatialVoronoi(
        turf.featureCollection(getThermometerPoints(question)),
    );

    return turf.featureCollection(
        voronoi.features
            .map((x: any) => turf.polygonToLine(x))
            .flatMap((line) =>
                line.type === "FeatureCollection" ? line.features : [line],
            ),
    );
};
