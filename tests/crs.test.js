import test from "node:test";
import assert from "node:assert/strict";
import { dmsToDecimal, getEpsgFromCC, getRecommendedCC } from "../js/crs.js";

test("43.30° recommends CC43", () => {
    assert.equal(getRecommendedCC(43.30), 43);
});

test("45.75° recommends CC46", () => {
    assert.equal(getRecommendedCC(45.75), 46);
});

test("46.31° recommends CC46", () => {
    assert.equal(getRecommendedCC(46.31), 46);
});

test("46.52° recommends CC47", () => {
    assert.equal(getRecommendedCC(46.52), 47);
});

test("CC zones map to the EPSG codes specified in the zone table", () => {
    assert.equal(getEpsgFromCC(42), 3942);
    assert.equal(getEpsgFromCC(46), 3946);
    assert.equal(getEpsgFromCC(50), 3950);
});

test("41.49° is outside nominal CC9 coverage", () => {
    assert.equal(getRecommendedCC(41.49), null);
});

test("50.51° is outside nominal CC9 coverage", () => {
    assert.equal(getRecommendedCC(50.51), null);
});

test("the coverage endpoints remain assigned to an available CC zone", () => {
    assert.equal(getRecommendedCC(41.5), 42);
    assert.equal(getRecommendedCC(50.5), 50);
});

test("DMS coordinates convert to signed decimal degrees", () => {
    assert.ok(Math.abs(dmsToDecimal(`46° 18' 20.68" N`, "latitude") - 46.3057444444) < 1e-9);
    assert.ok(Math.abs(dmsToDecimal(`4° 47' 8" E`, "longitude") - 4.7855555556) < 1e-9);
    assert.equal(dmsToDecimal(`4° 30' 0" W`, "longitude"), -4.5);
});
