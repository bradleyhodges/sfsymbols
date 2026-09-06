const assert = require("node:assert/strict");
const { test } = require("node:test");
const { toIconName, validateIconNames } = require("./iconNames");

test("preserves conventional names and converts invalid identifier characters", () => {
    for (const [source, expected] of [
        ["arrow.up.to.line.circle 2", "sfArrowUpToLineCircle2"],
        ["arrow.up.to.line.circle.fill 2", "sfArrowUpToLineCircleFill2"],
        ["12.circle", "sf12Circle"],
        ["arrow.up", "sfArrowUp"],
        ["foo--bar__baz..", "sfFooBarBaz"],
        ["  foo\tbar\n2 ", "sfFooBar2"],
        ["foo'bar@baz💡2", "sfFooBarBaz2"],
        ["class", "sfClass"],
    ]) assert.equal(toIconName(source), expected);
    assert.equal(toIconName("a & b", true), "sfBrandAB");
});

test("rejects empty or unsupported names rather than creating prefix-only exports", () => {
    for (const source of ["", "...", "💡", "  ", null]) {
        assert.throws(() => toIconName(source), /ASCII letter or digit/);
    }
});

test("rejects normalization, filesystem and symbol/brand collisions", () => {
    assert.throws(() => validateIconNames(["a.b", "a b"], []), /collision/);
    assert.throws(() => validateIconNames(["aBC", "abc"], []), /collision/);
    assert.throws(() => validateIconNames(["brand.foo"], ["foo"]), /collision/);
    assert.doesNotThrow(() => validateIconNames(["foo", "foo 2"], ["foo"]));
});
