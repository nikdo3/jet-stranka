import { useStore } from "@nanostores/react";
import React, { useState } from "react";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
    isLoading,
    permanentOverlay,
    pidOverlayLayers,
} from "@/lib/context";
import { buildPidOverlay, loadPidPraguePreset } from "@/maps/pid";

const PID_LAYER_OPTIONS = [
    { id: "zones", label: "Tarifní pásma PID (P, 0, B)" },
    { id: "metro_tram", label: "Linky metra (A, B, C) a tramvají (1–26)" },
    {
        id: "stops",
        label: "Zastávky PID (1 397 zastávek vč. busů a vlaků)",
    },
    { id: "background", label: "Železnice (linky S) a autobusové koridory" },
    {
        id: "districts",
        label: "Městské části Prahy (57 MČ / Praha 1–22)",
    },
    {
        id: "cadastral",
        label: "Katastrální území / čtvrti (Karlín, Žižkov…)",
    },
    { id: "vltava", label: "Řeka Vltava a vltavské ostrovy" },
] as const;

const PHOTO_TASKS = [
    "Strom / park",
    "Obloha kolmo vzhůru",
    "Selfie tebe",
    "Nejširší ulice v dohledu",
    "Nejvyšší stavba v dohledu",
    "Budova ze stanice",
    "Nejvyšší budova ze stanice",
    "Trasa nejbližší ulice",
    "Dvě budovy",
    "Interiér restaurace",
    "Nástupiště vlaku / metra",
    "Ulička v potravinách",
    "Kostel / modlitebna",
] as const;

const PHOTOS_STORAGE_KEY = "pidPhotoChecklist";

function loadCheckedPhotos(): string[] {
    try {
        const raw = localStorage.getItem(PHOTOS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export const PidRulesDialog = ({
    trigger,
}: {
    trigger?: React.ReactNode;
}) => {
    const $layers = useStore(pidOverlayLayers);
    const $isLoading = useStore(isLoading);
    const [updating, setUpdating] = useState(false);
    const [checkedPhotos, setCheckedPhotos] =
        useState<string[]>(loadCheckedPhotos);

    const toggleLayer = async (layerId: string, checked: boolean) => {
        const next = checked
            ? Array.from(new Set([...$layers, layerId]))
            : $layers.filter((l) => l !== layerId);
        pidOverlayLayers.set(next);
        setUpdating(true);
        try {
            permanentOverlay.set(await buildPidOverlay(next));
        } catch (err) {
            console.error("Failed to rebuild PID overlay:", err);
            toast.error("Nepodařilo se aktualizovat vrstvy mapy PID");
        } finally {
            setUpdating(false);
        }
    };

    const togglePhoto = (task: string, checked: boolean) => {
        const next = checked
            ? Array.from(new Set([...checkedPhotos, task]))
            : checkedPhotos.filter((t) => t !== task);
        setCheckedPhotos(next);
        try {
            localStorage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(next));
        } catch {
            // Ignore storage errors (e.g. private browsing)
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="secondary" disabled={$isLoading}>
                        PID Praha: Vrstvy &amp; Fotky
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-poppins">
                        PID Praha — Vrstvy &amp; Fotky
                    </DialogTitle>
                    <DialogDescription>
                        Nastavení vrstev pražské mapy a checklist foto úkolů pro
                        střední hru.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 mt-2">
                    <h3 className="font-semibold font-poppins text-sm">
                        PID Vrstvy mapy
                    </h3>
                    <div className="flex flex-col gap-2">
                        {PID_LAYER_OPTIONS.map((layer) => (
                            <div
                                key={layer.id}
                                className="flex items-center gap-2"
                            >
                                <Checkbox
                                    id={`pid-layer-${layer.id}`}
                                    checked={$layers.includes(layer.id)}
                                    disabled={updating || $isLoading}
                                    onCheckedChange={(v) =>
                                        toggleLayer(layer.id, !!v)
                                    }
                                />
                                <Label
                                    htmlFor={`pid-layer-${layer.id}`}
                                    className="cursor-pointer text-sm"
                                >
                                    {layer.label}
                                </Label>
                            </div>
                        ))}
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={updating || $isLoading}
                        onClick={async () => {
                            setUpdating(true);
                            try {
                                await loadPidPraguePreset();
                                toast.success(
                                    "Výchozí PID Praha hra obnovena",
                                );
                            } catch (err) {
                                console.error(err);
                                toast.error(
                                    "Nepodařilo se obnovit PID Praha hru",
                                );
                            } finally {
                                setUpdating(false);
                            }
                        }}
                    >
                        Obnovit výchozí PID Praha hru
                    </Button>
                </div>

                <Separator className="my-2" />

                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold font-poppins text-sm">
                            6. PHOTOS (Lízni 1 • limit 10 min)
                        </h3>
                        {checkedPhotos.length > 0 && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                    setCheckedPhotos([]);
                                    try {
                                        localStorage.removeItem(
                                            PHOTOS_STORAGE_KEY,
                                        );
                                    } catch {
                                        // Ignore
                                    }
                                }}
                            >
                                Vymazat ({checkedPhotos.length}/
                                {PHOTO_TASKS.length})
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PHOTO_TASKS.map((task) => {
                            const isChecked = checkedPhotos.includes(task);
                            return (
                                <div
                                    key={task}
                                    className="flex items-center gap-2"
                                >
                                    <Checkbox
                                        id={`pid-photo-${task}`}
                                        checked={isChecked}
                                        onCheckedChange={(v) =>
                                            togglePhoto(task, !!v)
                                        }
                                    />
                                    <Label
                                        htmlFor={`pid-photo-${task}`}
                                        className={`cursor-pointer text-sm ${
                                            isChecked
                                                ? "line-through opacity-60"
                                                : ""
                                        }`}
                                    >
                                        {task}
                                    </Label>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
