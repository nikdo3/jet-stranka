import fs from "node:fs";
import path from "node:path";

import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";

import { parseCustomStationsFromText } from "../src/maps/api/importers";
import { getVltavaBankPolygon } from "../src/maps/pid";

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
        expect(stops.features.length).toBe(286);

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

    it("preserves PID station metadata in parseCustomStationsFromText", () => {
        const raw = fs.readFileSync(
            path.join(pidDir, "pid_stops_p0b.geojson"),
            "utf8",
        );
        const stations = parseCustomStationsFromText(raw, "application/json");
        expect(stations.length).toBe(286);

        const metroStation = stations.find((s) => s.is_metro === true);
        expect(metroStation).toBeDefined();
        expect(Array.isArray(metroStation?.lines)).toBe(true);
        expect(metroStation?.lines?.length).toBeGreaterThan(0);
        expect(typeof metroStation?.zone).toBe("string");
    });
});
