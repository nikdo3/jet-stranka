import { describe, expect, it } from "vitest";

import { compactHidingZoneForShare, compress, decompress } from "@/lib/utils";

describe("compactHidingZoneForShare", () => {
    it("strips customStations and permanentOverlay for Prague PID preset (osm_id: 435514)", () => {
        const dummyHeavyStations = Array.from({ length: 1397 }, (_, i) => ({
            id: `station-${i}`,
            name: `Zastavka ${i}`,
            lat: 50.0 + i * 0.0001,
            lng: 14.4 + i * 0.0001,
        }));

        const dummyHeavyOverlay = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: { name: "Praha border" },
                    geometry: {
                        type: "Polygon",
                        coordinates: [[[14.2, 50.0], [14.6, 50.0], [14.6, 50.2], [14.2, 50.2], [14.2, 50.0]]],
                    },
                },
            ],
        };

        const pragueZone = {
            type: "Feature",
            properties: {
                osm_id: 435514,
                name: "Praha",
                isHidingZone: true,
                questions: [{ id: "q1", text: "Are you near a metro station?" }],
            },
            questions: [{ id: "q1", text: "Are you near a metro station?" }],
            disabledStations: ["station-1", "station-2"],
            hidingRadius: 0.5,
            hidingRadiusUnits: "kilometers",
            customStations: dummyHeavyStations,
            permanentOverlay: dummyHeavyOverlay,
            presets: [],
            alternateLocations: [],
        };

        const compacted = compactHidingZoneForShare(
            pragueZone,
            ["metro", "tram"],
            ["metro-lines", "tram-lines"],
        );

        expect(compacted.pidPreset).toBe(true);
        expect(compacted.customStations).toBeUndefined();
        expect(compacted.permanentOverlay).toBeUndefined();
        expect(compacted.presets).toBeUndefined();
        expect(compacted.alternateLocations).toBeUndefined();

        // Preserves essential game data
        expect(compacted.questions).toEqual([{ id: "q1", text: "Are you near a metro station?" }]);
        expect(compacted.disabledStations).toEqual(["station-1", "station-2"]);
        expect(compacted.hidingRadius).toBe(0.5);
        expect(compacted.pidStopModes).toEqual(["metro", "tram"]);
        expect(compacted.pidOverlayLayers).toEqual(["metro-lines", "tram-lines"]);
    });

    it("leaves non-Prague custom stations and overlays intact", () => {
        const customStations = [
            { id: "custom-1", name: "My Special Spot", lat: 48.14, lng: 17.1 },
        ];
        const nonPragueZone = {
            type: "Feature",
            properties: {
                osm_id: 123456,
                name: "Bratislava",
                isHidingZone: true,
            },
            questions: [{ id: "q2", text: "Within 1 km?" }],
            disabledStations: [],
            customStations,
            permanentOverlay: { type: "FeatureCollection", features: [] },
            presets: [],
            alternateLocations: [],
        };

        const compacted = compactHidingZoneForShare(nonPragueZone);

        expect(compacted.pidPreset).toBeUndefined();
        expect(compacted.customStations).toEqual(customStations);
        expect(compacted.permanentOverlay).toBeDefined();
        expect(compacted.questions).toEqual([{ id: "q2", text: "Within 1 km?" }]);
        // Empty presets & alternateLocations are stripped to save space
        expect(compacted.presets).toBeUndefined();
        expect(compacted.alternateLocations).toBeUndefined();
    });

    it("produces compact compressed strings well under URL limit for Prague", async () => {
        const pragueZone = {
            type: "Feature",
            properties: {
                osm_id: 435514,
                name: "Praha",
                isHidingZone: true,
            },
            questions: [{ id: "q1", text: "Are you in Prague 1?" }],
            disabledStations: ["pid-1", "pid-2"],
            hidingRadius: 0.5,
            hidingRadiusUnits: "kilometers",
            customStations: Array.from({ length: 1400 }, (_, i) => ({ id: `${i}`, name: `S${i}`, lat: 50, lng: 14 })),
            permanentOverlay: { type: "FeatureCollection", features: [] },
            presets: [],
            alternateLocations: [],
        };

        const compacted = compactHidingZoneForShare(pragueZone, ["metro"], ["border"]);
        const json = JSON.stringify(compacted);
        const compressed = await compress(json);

        // Should easily be under 500 chars (normally ~200-350 chars)
        expect(compressed.length).toBeLessThan(500);

        const decompressed = await decompress(compressed);
        const parsed = JSON.parse(decompressed);
        expect(parsed.pidPreset).toBe(true);
        expect(parsed.disabledStations).toEqual(["pid-1", "pid-2"]);
    });
});
