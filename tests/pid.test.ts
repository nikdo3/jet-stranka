import fs from "node:fs";
import path from "node:path";

import * as turf from "@turf/turf";
// @ts-expect-error d3-geo-voronoi has no bundled TypeScript declarations
import { geoVoronoi } from "d3-geo-voronoi";
import { describe, expect, it } from "vitest";

import { parseCustomStationsFromText } from "../src/maps/api/importers";
import {
    VLTAVA_LINE,
    filterPidStationsByModes,
    getVltavaBankPolygon,
} from "../src/maps/pid";

const pidDir = path.resolve(__dirname, "../public/pid");

describe("PID Prague data & helpers", () => {
    it("parses PID GeoJSON assets with expected counts and numeric stroke-width", () => {
        const lines = JSON.parse(
            fs.readFileSync(path.join(pidDir, "pid_metro_tram_lines.geojson"), "utf8"),
        );
        expect(lines.type).toBe("FeatureCollection");
        expect(lines.features.length).toBe(27);
        for (const f of lines.features) {
            expect(typeof f.properties["stroke-width"]).toBe("number");
        }

        const stops = JSON.parse(
            fs.readFileSync(path.join(pidDir, "pid_stops_p0b.geojson"), "utf8"),
        );
        expect(stops.type).toBe("FeatureCollection");
        expect(stops.features.length).toBeGreaterThan(1300);
        expect(
            stops.features.some((f: any) => f.properties?.is_metro === true),
        ).toBe(true);
        expect(
            stops.features.some((f: any) => f.properties?.is_tram === true),
        ).toBe(true);
        expect(
            stops.features.some((f: any) => f.properties?.is_bus === true),
        ).toBe(true);
        expect(
            stops.features.some((f: any) => f.properties?.is_rail === true),
        ).toBe(true);

        const zones = JSON.parse(
            fs.readFileSync(path.join(pidDir, "pid_zones_p0b.geojson"), "utf8"),
        );
        expect(zones.type).toBe("FeatureCollection");
        expect(zones.features.map((f: any) => f.properties.zone).sort()).toEqual([
            "0",
            "B",
            "P",
        ]);
    });

    it("splits Vltava banks cleanly between west (Smíchov) and east (Žižkov)", () => {
        const smichov = turf.point([14.403, 50.07]);
        const zizkov = turf.point([14.455, 50.085]);

        const westPoly = getVltavaBankPolygon(14.403, 50.07);
        const eastPoly = getVltavaBankPolygon(14.455, 50.085);

        expect(turf.booleanPointInPolygon(smichov, westPoly)).toBe(true);
        expect(turf.booleanPointInPolygon(zizkov, westPoly)).toBe(false);
        expect(turf.booleanPointInPolygon(zizkov, eastPoly)).toBe(true);
        expect(turf.booleanPointInPolygon(smichov, eastPoly)).toBe(false);
    });

    it("accurately classifies key Prague landmarks on West vs East bank of Vltava with 112-point centerline", () => {
        expect(VLTAVA_LINE.geometry.coordinates).toHaveLength(112);

        const westLandmarks: [string, [number, number]][] = [
            ["Anděl", [14.4038, 50.07]],
            ["Malostranská", [14.4092, 50.0908]],
            ["Vltavská / Holešovice meander", [14.4384, 50.0994]],
            ["Nádraží Holešovice", [14.4397, 50.1088]],
            ["Smíchov", [14.4085, 50.056]],
            ["Lahovice", [14.391, 49.992]],
            ["Sedlec", [14.391, 50.133]],
        ];

        const eastLandmarks: [string, [number, number]][] = [
            ["Staroměstská", [14.4176, 50.0883]],
            ["Karlín", [14.4516, 50.0933]],
            ["Palmovka", [14.475, 50.1038]],
            ["Troja / Zoo", [14.4055, 50.1165]],
            ["Podolí / Vyšehrad", [14.4168, 50.0604]],
            ["Modřany", [14.403, 50.007]],
        ];

        const westPoly = getVltavaBankPolygon(14.4038, 50.07);
        const eastPoly = getVltavaBankPolygon(14.4176, 50.0883);

        for (const [name, [lng, lat]] of westLandmarks) {
            const pt = turf.point([lng, lat]);
            expect(turf.booleanPointInPolygon(pt, westPoly), `${name} should be on west bank`).toBe(true);
            expect(turf.booleanPointInPolygon(pt, eastPoly), `${name} should NOT be on east bank`).toBe(false);
            expect(getVltavaBankPolygon(lng, lat)).toBe(westPoly);
        }

        for (const [name, [lng, lat]] of eastLandmarks) {
            const pt = turf.point([lng, lat]);
            expect(turf.booleanPointInPolygon(pt, eastPoly), `${name} should be on east bank`).toBe(true);
            expect(turf.booleanPointInPolygon(pt, westPoly), `${name} should NOT be on west bank`).toBe(false);
            expect(getVltavaBankPolygon(lng, lat)).toBe(eastPoly);
        }
    });

    it("preserves PID station metadata in parseCustomStationsFromText", () => {
        const raw = fs.readFileSync(
            path.join(pidDir, "pid_stops_p0b.geojson"),
            "utf8",
        );
        const stations = parseCustomStationsFromText(raw, "application/json");
        expect(stations.length).toBeGreaterThan(1300);

        const metroStation = stations.find((s) => s.is_metro === true);
        expect(metroStation).toBeDefined();
        expect(Array.isArray(metroStation?.lines)).toBe(true);
        expect(metroStation?.lines?.length).toBeGreaterThan(0);
        expect(typeof metroStation?.zone).toBe("string");
        expect(typeof metroStation?.category).toBe("string");
        expect(typeof metroStation?.is_bus).toBe("boolean");
        expect(typeof metroStation?.is_rail).toBe("boolean");
        expect(typeof metroStation?.is_ferry).toBe("boolean");

        const csv = [
            "id,name,lat,lng,zone,category,lines,is_metro,is_tram,is_bus,is_rail,is_ferry",
            '1,Muzeum,50.0799,14.4307,P,metro_station,"A;C",true,false,false,false,false',
        ].join("\n");
        const csvStations = parseCustomStationsFromText(csv, "text/csv");
        expect(csvStations).toHaveLength(1);
        expect(csvStations[0]).toMatchObject({
            id: "1",
            name: "Muzeum",
            zone: "P",
            category: "metro_station",
            lines: ["A", "C"],
            is_metro: true,
            is_tram: false,
            is_bus: false,
            is_rail: false,
            is_ferry: false,
        });
    });

    it("filterPidStationsByModes filters bus vs metro/tram while preserving custom stations without flags", () => {
        const raw = fs.readFileSync(
            path.join(pidDir, "pid_stops_p0b.geojson"),
            "utf8",
        );
        const pidStations = parseCustomStationsFromText(raw, "application/json");
        const customNoFlags = {
            id: "custom-1",
            name: "Custom Stop",
            lat: 50.08,
            lng: 14.42,
        };
        const all = [...pidStations, customNoFlags];

        const metroTramOnly = filterPidStationsByModes(all, ["metro", "tram"]);
        expect(metroTramOnly.some((s) => s.id === "custom-1")).toBe(true);
        expect(
            metroTramOnly.every(
                (s) =>
                    s.id === "custom-1" ||
                    s.is_metro === true ||
                    s.is_tram === true,
            ),
        ).toBe(true);
        expect(
            metroTramOnly.some(
                (s) => s.is_bus === true && !s.is_metro && !s.is_tram,
            ),
        ).toBe(false);

        const busOnly = filterPidStationsByModes(all, ["bus"]);
        expect(busOnly.some((s) => s.id === "custom-1")).toBe(true);
        expect(
            busOnly.every((s) => s.id === "custom-1" || s.is_bus === true),
        ).toBe(true);
        expect(busOnly.length).toBeGreaterThan(500);
    });

    it("computes d3-geo-voronoi over all Prague stops without errors", () => {
        const stops = JSON.parse(
            fs.readFileSync(path.join(pidDir, "pid_stops_p0b.geojson"), "utf8"),
        );
        const voronoi = geoVoronoi(stops);
        const polygons = voronoi.polygons();
        expect(polygons.type).toBe("FeatureCollection");
        expect(polygons.features.length).toBe(stops.features.length);
    });
});
