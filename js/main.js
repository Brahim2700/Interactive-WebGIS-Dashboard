import {
    dmsToDecimal,
    estimateLinearDistortion,
    formatResult,
    getEpsgFromCC,
    getRecommendedCC,
    getZoneLimits,
    isInMetropolitanFranceBounds,
    isZoneBoundary
} from "./crs.js";

const elements = {
    tabs: [...document.querySelectorAll(".tab")],
    tabPanels: [...document.querySelectorAll(".tab-panel")],
    addressForm: document.getElementById("address-form"),
    addressInput: document.getElementById("address-input"),
    addressSuggestions: document.getElementById("address-suggestions"),
    locateButtons: [...document.querySelectorAll("[data-locate]")],
    locationStatuses: [...document.querySelectorAll(".location-status")],
    coordinatesForm: document.getElementById("coordinates-form"),
    latitudeInput: document.getElementById("latitude-input"),
    longitudeInput: document.getElementById("longitude-input"),
    emptyResult: document.getElementById("empty-result"),
    resultContent: document.getElementById("result-content"),
    recommendedCc: document.getElementById("recommended-cc"),
    epsgCode: document.getElementById("epsg-code"),
    crsName: document.getElementById("crs-name"),
    latitude: document.getElementById("result-latitude"),
    longitude: document.getElementById("result-longitude"),
    parallelOrigin: document.getElementById("parallel-origin"),
    zoneLimits: document.getElementById("zone-limits"),
    distortionValue: document.getElementById("distortion-value"),
    distortionInterpretation: document.getElementById("distortion-interpretation"),
    explanation: document.getElementById("recommendation-explanation"),
    boundaryNotice: document.getElementById("boundary-notice"),
    comparePanel: document.getElementById("compare-panel"),
    compareButton: document.getElementById("compare-button"),
    copyButton: document.getElementById("copy-button"),
    exportJson: document.getElementById("export-json"),
    exportCsv: document.getElementById("export-csv"),
    mapMessage: document.getElementById("map-message"),
    toast: document.getElementById("toast")
};

const OUTSIDE_FRANCE_MESSAGE = "CC9 projections apply to metropolitan France. For Corsica, use CC42. For French overseas territories, use the appropriate local projected coordinate systems.";
const IGN_NOTE = "Simplified estimate. For official calculations, use IGN algorithms.";
let currentResult = null;
let requestId = 0;
let toastTimer;
let map;
let marker;

function showMapMessage(message) {
    elements.mapMessage.textContent = message;
    elements.mapMessage.hidden = false;
}

function setLocationStatus(message, state = "") {
    for (const status of elements.locationStatuses) {
        status.textContent = message;
        if (state) status.dataset.state = state;
        else delete status.dataset.state;
    }
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        elements.toast.hidden = true;
    }, 2800);
}

function setActiveTab(tabName, focus = false) {
    for (const tab of elements.tabs) {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive && focus) tab.focus();
    }

    for (const panel of elements.tabPanels) {
        panel.hidden = panel.id !== `${tabName}-panel`;
    }
}

function clearResult() {
    currentResult = null;
    elements.emptyResult.hidden = false;
    elements.resultContent.hidden = true;
    elements.boundaryNotice.hidden = true;
    elements.comparePanel.hidden = true;
    elements.compareButton.setAttribute("aria-expanded", "false");
}

function formatDegrees(value, directionPositive, directionNegative) {
    return `${Math.abs(value).toFixed(6)}° ${value < 0 ? directionNegative : directionPositive}`;
}

function getDistortionLabel(distortion) {
    if (distortion < 1) return "Very low distortion";
    if (distortion < 2) return "Low distortion";
    if (distortion < 4) return "Moderate distortion";
    return "Distortion should be checked for long linear projects";
}

function zoneCardHtml(zone, latitude, recommendedZone) {
    const distortion = estimateLinearDistortion(latitude, zone);
    const supported = zone >= 42 && zone <= 50;
    const limits = supported ? getZoneLimits(zone) : null;
    return `<article class="compare-zone${zone === recommendedZone ? " recommended" : ""}">
        <h3>CC${zone}${zone === recommendedZone ? " · recommended" : ""}</h3>
        <p>Latitude difference: ${(latitude - zone).toFixed(3)}°</p>
        <p>Estimated distortion: ${distortion.toFixed(2)} cm/km</p>
        <p>${supported ? `EPSG:${getEpsgFromCC(zone)} · ${limits.south.toFixed(1)}°–${limits.north.toFixed(1)}° N` : "Outside the defined CC42–CC50 zones"}</p>
    </article>`;
}

function buildComparePanel(result, lowerZone, upperZone) {
    elements.comparePanel.innerHTML = `${zoneCardHtml(lowerZone, result.latitude, result.ccNumber)}
        ${zoneCardHtml(upperZone, result.latitude, result.ccNumber)}
        <p class="compare-conclusion">Final recommendation: ${result.crs_name} (EPSG:${result.epsg}), based on the nearest parallel of origin.</p>`;
}

function renderResult(result) {
    currentResult = result;
    elements.emptyResult.hidden = true;
    elements.resultContent.hidden = false;
    elements.recommendedCc.textContent = result.cc_name;
    elements.epsgCode.textContent = `EPSG:${result.epsg}`;
    elements.crsName.textContent = result.crs_name;
    elements.latitude.textContent = formatDegrees(result.latitude, "N", "S");
    elements.longitude.textContent = formatDegrees(result.longitude, "E", "W");
    elements.parallelOrigin.textContent = `${result.parallel_origin}° N`;
    elements.zoneLimits.textContent = `${result.zone_limits.south.toFixed(1)}°–${result.zone_limits.north.toFixed(1)}° N`;
    elements.distortionValue.textContent = result.linear_distortion_cm_per_km.toFixed(2);
    elements.distortionInterpretation.textContent = getDistortionLabel(result.linear_distortion_cm_per_km);
    const lowerBoundaryZone = Math.floor(result.latitude);
    const upperBoundaryZone = lowerBoundaryZone + 1;
    const onBoundary = isZoneBoundary(result.latitude);
    const nearerNeighbor = result.latitude >= result.ccNumber ? result.ccNumber + 1 : result.ccNumber - 1;
    elements.explanation.textContent = onBoundary
        ? `The point is equally distant from the ${lowerBoundaryZone}° N and ${upperBoundaryZone}° N parallels of origin.`
        : `The point is closer to the ${result.parallel_origin}° N parallel of origin than to the ${nearerNeighbor}° N parallel of origin.`;
    const nearBoundary = Math.abs(result.latitude - (result.ccNumber - 0.5)) <= 0.05
        || Math.abs(result.latitude - (result.ccNumber + 0.5)) <= 0.05;

    if (onBoundary) {
        elements.boundaryNotice.textContent = `The point lies on the boundary between CC${lowerBoundaryZone} and CC${upperBoundaryZone}. Both systems are possible; choose the one that best covers the full project extent.`;
        elements.boundaryNotice.hidden = false;
    } else if (nearBoundary) {
        elements.boundaryNotice.textContent = "Point is close to a zone boundary. Check the estimated linear distortion for both candidate CC zones.";
        elements.boundaryNotice.hidden = false;
    } else {
        elements.boundaryNotice.hidden = true;
    }

    buildComparePanel(result, lowerBoundaryZone, upperBoundaryZone);
    elements.comparePanel.hidden = !(onBoundary || nearBoundary);
    elements.compareButton.setAttribute("aria-expanded", String(!elements.comparePanel.hidden));
}

function showOutsideCoverage(latitude, address = "", accuracy = null) {
    clearResult();
    const message = `Latitude ${latitude.toFixed(5)}° is outside the nominal coverage of the CC42–CC50 zones (41.5°–50.5° N).`;
    showMapMessage(message);
    if (accuracy !== null) {
        setLocationStatus(`Location found (±${Math.round(accuracy)} m), but it is outside CC9 coverage. ${message}`, "error");
    }
    if (address) elements.addressInput.value = address;
}

function selectLocation({ latitude, longitude, inputType, address = "", accuracy = null }) {
    requestId += 1;
    elements.mapMessage.hidden = true;
    elements.addressSuggestions.hidden = true;

    if (map) {
        const point = [latitude, longitude];
        map.setView(point, Math.max(map.getZoom(), 8));
        if (marker) marker.setLatLng(point);
        else {
            marker = L.circleMarker(point, {
                radius: 7,
                color: "#ffffff",
                weight: 3,
                fillColor: "#2675a8",
                fillOpacity: 1
            }).addTo(map);
        }
        marker.bindPopup(`${latitude.toFixed(6)}°, ${longitude.toFixed(6)}°`);
    }

    if (!isInMetropolitanFranceBounds(latitude, longitude)) {
        clearResult();
        showMapMessage(OUTSIDE_FRANCE_MESSAGE);
        if (inputType === "gps") {
            setLocationStatus(`Your device location is ${formatDegrees(latitude, "N", "S")}, ${formatDegrees(longitude, "E", "W")}${accuracy !== null ? ` (±${Math.round(accuracy)} m)` : ""}. ${OUTSIDE_FRANCE_MESSAGE}`, "error");
        }
        return;
    }

    const ccNumber = getRecommendedCC(latitude);
    if (ccNumber === null) {
        showOutsideCoverage(latitude, address, accuracy);
        return;
    }

    const zoneLimits = getZoneLimits(ccNumber);
    const result = {
        input_type: inputType,
        ...(address ? { address } : {}),
        latitude,
        longitude,
        ccNumber,
        cc_name: `CC${ccNumber}`,
        recommended_cc: `CC${ccNumber}`,
        epsg: getEpsgFromCC(ccNumber),
        crs_name: `RGF93 / CC${ccNumber}`,
        parallel_origin: ccNumber,
        zone_limits: zoneLimits,
        linear_distortion_cm_per_km: estimateLinearDistortion(latitude, ccNumber),
        method: "Nearest integer latitude / nearest parallel of origin",
        note: IGN_NOTE
    };

    if (address) elements.addressInput.value = address;
    renderResult(result);
    if (inputType === "gps") {
        elements.latitudeInput.value = latitude.toFixed(6);
        elements.longitudeInput.value = longitude.toFixed(6);
        setLocationStatus(`Location found (±${Math.round(accuracy ?? 0)} m). Recommended projection: CC${ccNumber}, EPSG:${result.epsg}.`, "success");
    }
}

function showSuggestions(features, queryId) {
    elements.addressSuggestions.replaceChildren();
    for (const feature of features) {
        const label = feature.properties?.label;
        const [longitude, latitude] = feature.geometry?.coordinates || [];
        if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

        const option = document.createElement("button");
        option.className = "suggestion";
        option.type = "button";
        option.setAttribute("role", "option");
        option.innerHTML = "<span></span><small></small>";
        option.querySelector("span").textContent = label;
        option.querySelector("small").textContent = feature.properties?.context || "France";
        option.addEventListener("click", () => {
            if (queryId !== requestId) return;
            selectLocation({ latitude, longitude, inputType: "address", address: label });
        });
        elements.addressSuggestions.append(option);
    }
    elements.addressSuggestions.hidden = elements.addressSuggestions.childElementCount === 0;
}

async function searchAddress(event) {
    event.preventDefault();
    const query = elements.addressInput.value.trim();
    if (!query) return;
    const queryId = ++requestId;
    elements.addressSuggestions.hidden = true;
    elements.mapMessage.hidden = true;
    const button = elements.addressForm.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
        const url = new URL("https://data.geopf.fr/geocodage/search");
        url.search = new URLSearchParams({ q: query, limit: "5", index: "address" });
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Address search failed with HTTP ${response.status}.`);
        }
        const data = await response.json();
        if (queryId !== requestId) return;
        const features = (data.features || []).filter((feature) => {
            const coordinates = feature.geometry?.coordinates;
            return coordinates?.length === 2 && coordinates.every(Number.isFinite);
        });
        if (features.length === 0) {
            showMapMessage("No address was found. Check the spelling and try a more complete French address.");
        } else if (features.length === 1) {
            const [longitude, latitude] = features[0].geometry.coordinates;
            const address = features[0].properties?.label || query;
            selectLocation({ latitude, longitude, inputType: "address", address });
        } else {
            showSuggestions(features, queryId);
        }
    } catch (error) {
        if (queryId === requestId) {
            showMapMessage(`Address search is unavailable. ${error.message}`);
        }
    } finally {
        if (queryId === requestId) button.disabled = false;
    }
}

function submitCoordinates(event) {
    event.preventDefault();
    try {
        const latitude = dmsToDecimal(elements.latitudeInput.value, "latitude");
        const longitude = dmsToDecimal(elements.longitudeInput.value, "longitude");
        if (latitude < 41 || latitude > 51.5) {
            throw new RangeError("Latitude must be between 41° and 51.5° N for metropolitan France.");
        }
        if (longitude < -5.5 || longitude > 10) {
            throw new RangeError("Longitude must be between 5.5° W and 10° E for metropolitan France.");
        }
        selectLocation({ latitude, longitude, inputType: "coordinates" });
    } catch (error) {
        showMapMessage(error.message);
    }
}

function locateCurrentPosition() {
    if (!navigator.geolocation) {
        const message = window.isSecureContext
            ? "This browser does not support device location."
            : "Device location requires a secure connection. Open the site using HTTPS.";
        setLocationStatus(message, "error");
        showMapMessage(message);
        return;
    }

    const locationRequestId = ++requestId;
    elements.mapMessage.hidden = true;
    setLocationStatus("Requesting your device location. Allow location access if your browser asks.", "pending");
    for (const button of elements.locateButtons) {
        button.disabled = true;
        button.querySelector("span").textContent = "Finding your location…";
    }

    navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
            for (const button of elements.locateButtons) {
                button.disabled = false;
                button.querySelector("span").textContent = "Use my current location";
            }
            if (locationRequestId !== requestId) return;
            selectLocation({
                latitude: coords.latitude,
                longitude: coords.longitude,
                inputType: "gps",
                accuracy: coords.accuracy
            });
        },
        (error) => {
            for (const button of elements.locateButtons) {
                button.disabled = false;
                button.querySelector("span").textContent = "Use my current location";
            }
            if (locationRequestId !== requestId) return;

            const message = error.code === error.PERMISSION_DENIED
                ? "Location permission was denied. Enable location for this site in your phone and browser settings, then try again."
                : error.code === error.POSITION_UNAVAILABLE
                    ? "Your phone could not determine a location. Turn on Location Services and check browser location permission."
                    : error.code === error.TIMEOUT
                        ? "Finding your location took too long. Check that Location Services are on and try again."
                        : `Could not get your current location. ${error.message}`;
            setLocationStatus(message, "error");
            showMapMessage(message);
        },
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
    );
}

function makeExportObject(result) {
    return {
        input_type: result.input_type,
        ...(result.address ? { address: result.address } : {}),
        latitude: Number(result.latitude.toFixed(6)),
        longitude: Number(result.longitude.toFixed(6)),
        recommended_cc: result.recommended_cc,
        epsg: result.epsg,
        crs_name: result.crs_name,
        parallel_origin: result.parallel_origin,
        zone_limits: result.zone_limits,
        linear_distortion_cm_per_km: Number(result.linear_distortion_cm_per_km.toFixed(2)),
        method: result.method,
        note: result.note
    };
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function exportJson() {
    if (!currentResult) return;
    downloadFile("cc-finder-result.json", `${JSON.stringify(makeExportObject(currentResult), null, 2)}\n`, "application/json");
}

function exportCsv() {
    if (!currentResult) return;
    const result = makeExportObject(currentResult);
    const row = {
        ...result,
        zone_limits: JSON.stringify(result.zone_limits)
    };
    const fields = Object.keys(row);
    const escapeCsv = (value) => `"${String(value).replace(/"/g, '""')}"`;
    downloadFile("cc-finder-result.csv", `${fields.map(escapeCsv).join(",")}\r\n${fields.map((field) => escapeCsv(row[field])).join(",")}\r\n`, "text/csv;charset=utf-8");
}

async function copyResult() {
    if (!currentResult) return;
    try {
        await navigator.clipboard.writeText(formatResult(currentResult));
        showToast("CRS information copied to clipboard.");
    } catch (error) {
        showToast(`Could not copy to clipboard. ${error.message}`);
    }
}

for (const tab of elements.tabs) {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const currentIndex = elements.tabs.indexOf(tab);
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const nextTab = elements.tabs[(currentIndex + offset + elements.tabs.length) % elements.tabs.length];
        setActiveTab(nextTab.dataset.tab, true);
    });
}

elements.addressForm.addEventListener("submit", searchAddress);
elements.coordinatesForm.addEventListener("submit", submitCoordinates);
for (const button of elements.locateButtons) {
    button.addEventListener("click", locateCurrentPosition);
}
elements.compareButton.addEventListener("click", () => {
    const expanded = elements.compareButton.getAttribute("aria-expanded") === "true";
    elements.comparePanel.hidden = expanded;
    elements.compareButton.setAttribute("aria-expanded", String(!expanded));
});
elements.copyButton.addEventListener("click", copyResult);
elements.exportJson.addEventListener("click", exportJson);
elements.exportCsv.addEventListener("click", exportCsv);

if (typeof L === "undefined") {
    showMapMessage("The map library could not load. Check your internet connection and refresh the page.");
} else {
    map = L.map("map", {
        minZoom: 5,
        maxZoom: 18,
        zoomControl: true
    }).setView([46.6, 2.4], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
    map.on("click", ({ latlng }) => {
        setActiveTab("map");
        selectLocation({ latitude: latlng.lat, longitude: latlng.lng, inputType: "map" });
    });
}
