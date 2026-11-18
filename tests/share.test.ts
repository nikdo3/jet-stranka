import { afterEach, describe, expect, it, vi } from "vitest";

import {
    compactHidingZoneForShare,
    compress,
    decodeShortSharePayload,
    decompress,
    encodeShortSharePayload,
    shortenShareUrl,
} from "@/lib/utils";

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

describe("encodeShortSharePayload and decodeShortSharePayload", () => {
    it("encodes empty Prague game to < 40 chars (total URL < 85 chars) and decodes with restored defaults", async () => {
        const emptyPrague = {
            type: "Feature",
            properties: {
                osm_id: 435514,
                name: "Praha",
                isHidingZone: true,
                questions: [],
            },
            hidingRadius: 0.5,
            hidingRadiusUnits: "kilometers",
            useCustomStations: true,
            includeDefaultStations: false,
            zoneOptions: [
                "[railway=station]",
                "[railway=halt]",
                "[railway=tram_stop]",
                "[highway=bus_stop]",
            ],
            disabledStations: [],
            customStations: Array.from({ length: 1400 }, (_, i) => ({
                id: `${i}`,
                name: `S${i}`,
                lat: 50,
                lng: 14,
            })),
            permanentOverlay: { type: "FeatureCollection", features: [] },
            presets: [],
            alternateLocations: [],
        };

        const encoded = await encodeShortSharePayload(
            emptyPrague,
            ["metro", "tram", "bus", "rail", "ferry"],
            ["zones", "metro_tram", "stops"],
        );

        expect(encoded.length).toBeLessThan(40);

        const baseUrl = "https://jetlag.example/app";
        const shareUrl = `${baseUrl}?s=${encoded}`;
        expect(shareUrl.length).toBeLessThan(85);

        const decoded = await decodeShortSharePayload(encoded);
        expect(decoded.properties.osm_id).toBe(435514);
        expect(decoded.osm_id).toBe(435514);
        expect(decoded.properties.isHidingZone).toBe(true);
        expect(decoded.hidingRadius).toBe(0.5);
        expect(decoded.hidingRadiusUnits).toBe("kilometers");
        expect(decoded.useCustomStations).toBe(true);
        expect(decoded.includeDefaultStations).toBe(false);
        expect(decoded.disabledStations).toEqual([]);
        expect(decoded.questions).toEqual([]);
    });

    it("encodes Prague game with 3-5 mixed questions compactly (< 350 chars) and preserves exact coordinates without rounding", async () => {
        const originalQuestions = [
            {
                id: "q-orig-1",
                type: "radar",
                data: {
                    lat: 50.08751234,
                    lng: 14.42109876,
                    radius: 1.5,
                    unit: "kilometers",
                    drag: false,
                    collapsed: false,
                },
            },
            {
                id: "q-orig-2",
                type: "thermometer",
                data: {
                    latA: 50.08123456,
                    lngA: 14.41567891,
                    latB: 50.10987654,
                    lngB: 14.43210987,
                    warmer: true,
                    drag: false,
                    collapsed: false,
                },
            },
            {
                id: "q-orig-3",
                type: "matching",
                data: {
                    lat: 50.0754321,
                    lng: 14.4312345,
                    type: "pid-zone",
                    drag: false,
                    collapsed: false,
                },
            },
            {
                id: "q-orig-4",
                type: "radar",
                data: {
                    lat: 50.05123456,
                    lng: 14.40987654,
                    radius: 2,
                    drag: false,
                    collapsed: false,
                },
            },
        ];

        const pragueWithQuestions = {
            type: "Feature",
            properties: {
                osm_id: 435514,
                name: "Praha",
                isHidingZone: true,
            },
            questions: originalQuestions,
            hidingRadius: 0.5,
            hidingRadiusUnits: "kilometers",
            customStations: Array.from({ length: 1400 }, (_, i) => ({
                id: `${i}`,
                name: `S${i}`,
                lat: 50,
                lng: 14,
            })),
            permanentOverlay: { type: "FeatureCollection", features: [] },
        };

        const encoded = await encodeShortSharePayload(pragueWithQuestions);
        expect(encoded.length).toBeLessThan(350);

        const decoded = await decodeShortSharePayload(encoded);
        expect(decoded.properties.osm_id).toBe(435514);
        expect(decoded.osm_id).toBe(435514);
        expect(decoded.hidingRadius).toBe(0.5);
        expect(decoded.questions.length).toBe(4);

        // Check radar question 1: ID regenerated, exact coordinates preserved without rounding, defaults restored
        const q0 = decoded.questions[0];
        expect(q0.id).toBeDefined();
        expect(q0.id).not.toBe("q-orig-1");
        expect(q0.type).toBe("radar");
        expect(q0.data.lat).toBe(50.08751234);
        expect(q0.data.lng).toBe(14.42109876);
        expect(q0.data.drag).toBe(false);
        expect(q0.data.collapsed).toBe(false);

        // Check thermometer question: exact coordinates preserved
        const q1 = decoded.questions[1];
        expect(q1.id).toBeDefined();
        expect(q1.id).not.toBe("q-orig-2");
        expect(q1.type).toBe("thermometer");
        expect(q1.data.latA).toBe(50.08123456);
        expect(q1.data.lngA).toBe(14.41567891);
        expect(q1.data.latB).toBe(50.10987654);
        expect(q1.data.lngB).toBe(14.43210987);
        expect(q1.data.warmer).toBe(true);
        expect(q1.data.drag).toBe(false);
        expect(q1.data.collapsed).toBe(false);

        // Check matching question
        const q2 = decoded.questions[2];
        expect(q2.id).toBeDefined();
        expect(q2.id).not.toBe("q-orig-3");
        expect(q2.type).toBe("matching");
        expect(q2.data.lat).toBe(50.0754321);
        expect(q2.data.lng).toBe(14.4312345);
        expect(q2.data.type).toBe("pid-zone");

        // Check radar question 2
        const q3 = decoded.questions[3];
        expect(q3.id).toBeDefined();
        expect(q3.id).not.toBe("q-orig-4");
        expect(q3.type).toBe("radar");
        expect(q3.data.lat).toBe(50.05123456);
        expect(q3.data.lng).toBe(14.40987654);
    });

    it("round-trips non-Prague custom zones cleanly", async () => {
        const nonPragueZone = {
            type: "Feature",
            properties: {
                osm_id: 123456,
                name: "Brno",
                isHidingZone: true,
            },
            questions: [{ id: "b1", text: "Are you in Brno?" }],
            customStations: [
                { id: "c1", name: "Hlavní nádraží", lat: 49.19, lng: 16.61 },
            ],
            permanentOverlay: { type: "FeatureCollection", features: [] },
            presets: [],
            alternateLocations: [],
        };

        const encoded = await encodeShortSharePayload(nonPragueZone);
        const decoded = await decodeShortSharePayload(encoded);

        expect(decoded.properties.osm_id).toBe(123456);
        expect(decoded.properties.name).toBe("Brno");
        expect(decoded.customStations).toHaveLength(1);
        expect(decoded.customStations[0].name).toBe("Hlavní nádraží");
        expect(decoded.questions).toEqual([
            { id: "b1", text: "Are you in Brno?" },
        ]);
    });
});

describe("shortenShareUrl", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null immediately if url is empty or exceeds 4500 characters", async () => {
        expect(await shortenShareUrl("")).toBeNull();
        const tooLong = "https://example.com/?" + "a".repeat(4501);
        expect(await shortenShareUrl(tooLong)).toBeNull();
    });

    it("returns https://is.gd/... when is.gd succeeds", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ shorturl: "https://is.gd/abc123" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await shortenShareUrl("https://example.com/share?s=xyz");
        expect(result).toBe("https://is.gd/abc123");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain("https://is.gd/create.php");
    });

    it("falls back to https://v.gd/... when is.gd fails", async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("is.gd")) {
                return { ok: false, status: 500 };
            }
            if (url.includes("v.gd")) {
                return {
                    ok: true,
                    json: async () => ({ shorturl: "https://v.gd/fallback456" }),
                };
            }
            return { ok: false, status: 404 };
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await shortenShareUrl("https://example.com/share?s=xyz");
        expect(result).toBe("https://v.gd/fallback456");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns null when both is.gd and v.gd fail", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
        vi.stubGlobal("fetch", fetchMock);

        const result = await shortenShareUrl("https://example.com/share?s=xyz");
        expect(result).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
