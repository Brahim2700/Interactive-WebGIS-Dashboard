export const MIN_CC_LATITUDE = 41.5;
export const MAX_CC_LATITUDE = 50.5;
export const MIN_FRANCE_LATITUDE = 41;
export const MAX_FRANCE_LATITUDE = 51.5;
export const MIN_FRANCE_LONGITUDE = -5.5;
export const MAX_FRANCE_LONGITUDE = 10;

export function dmsToDecimal(value, axis) {
    const text = String(value).trim().replace(/,/g, ".");
    if (!text) {
        throw new Error("Enter a coordinate.");
    }

    const decimalMatch = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*°?\s*([NSEW])?$/i);
    const dmsMatch = text.match(/^([+-]?\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NSEW])?$/i);
    const match = decimalMatch || dmsMatch;

    if (!match) {
        throw new Error("Use decimal degrees or DMS, for example 46° 18' 20.68\" N.");
    }

    const direction = match[match.length - 1] ? match[match.length - 1].toUpperCase() : "";
    if (direction && axis && !((axis === "latitude" && /[NS]/.test(direction)) || (axis === "longitude" && /[EW]/.test(direction)))) {
        throw new Error(axis === "latitude" ? "Latitude direction must be N or S." : "Longitude direction must be E or W.");
    }

    let result;
    if (decimalMatch) {
        result = Number(decimalMatch[1]);
        if (direction) {
            if (result < 0 && /[NE]/.test(direction)) {
                throw new Error("Coordinate sign conflicts with its direction.");
            }
            result = Math.abs(result) * (/[SW]/.test(direction) ? -1 : 1);
        }
    } else {
        const degrees = Number(dmsMatch[1]);
        const minutes = Number(dmsMatch[2]);
        const seconds = Number(dmsMatch[3]);
        if (minutes >= 60 || seconds >= 60) {
            throw new Error("DMS minutes and seconds must be less than 60.");
        }
        if (degrees < 0 && direction && /[NE]/.test(direction)) {
            throw new Error("Coordinate sign conflicts with its direction.");
        }
        const sign = direction
            ? (/[SW]/.test(direction) ? -1 : 1)
            : (degrees < 0 ? -1 : 1);
        result = sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
    }

    if (!Number.isFinite(result)) {
        throw new Error("Enter a valid numeric coordinate.");
    }
    return result;
}

export function getRecommendedCC(latitude) {
    if (!Number.isFinite(latitude) || latitude < MIN_CC_LATITUDE || latitude > MAX_CC_LATITUDE) {
        return null;
    }
    return Math.min(50, Math.max(42, Math.round(latitude)));
}

export function getEpsgFromCC(ccNumber) {
    if (!Number.isInteger(ccNumber) || ccNumber < 42 || ccNumber > 50) {
        throw new RangeError("CC zone must be an integer from 42 to 50.");
    }
    return 3900 + ccNumber;
}

export function getZoneLimits(ccNumber) {
    if (!Number.isInteger(ccNumber) || ccNumber < 42 || ccNumber > 50) {
        throw new RangeError("CC zone must be an integer from 42 to 50.");
    }
    return {
        south: ccNumber - 0.5,
        north: ccNumber + 0.5
    };
}

export function estimateLinearDistortion(latitude, ccNumber) {
    if (!Number.isFinite(latitude) || !Number.isInteger(ccNumber)) {
        throw new TypeError("Latitude and CC zone must be valid numbers.");
    }
    return 3.1 * (latitude - ccNumber) ** 2;
}

export function isInMetropolitanFranceBounds(latitude, longitude) {
    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= MIN_FRANCE_LATITUDE
        && latitude <= MAX_FRANCE_LATITUDE
        && longitude >= MIN_FRANCE_LONGITUDE
        && longitude <= MAX_FRANCE_LONGITUDE;
}

export function isZoneBoundary(latitude) {
    return Math.abs((latitude - Math.floor(latitude)) - 0.5) < 1e-9;
}

export function formatResult(result) {
    const latitudeDirection = result.latitude < 0 ? "S" : "N";
    const longitudeDirection = result.longitude < 0 ? "W" : "E";
    return [
        `${result.crs_name} — EPSG:${result.epsg}`,
        `Latitude: ${Math.abs(result.latitude).toFixed(6)}° ${latitudeDirection}`,
        `Longitude: ${Math.abs(result.longitude).toFixed(6)}° ${longitudeDirection}`,
        `Parallel of origin: ${result.parallel_origin}° N`,
        `Estimated linear distortion: ${result.linear_distortion_cm_per_km.toFixed(2)} cm/km`
    ].join("\n");
}
