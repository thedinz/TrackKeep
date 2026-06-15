import assert from "node:assert/strict";
import test from "node:test";
import {
  providerSearchQuery,
  youtubeProviderSearchQueries
} from "./search-query.ts";

test("builds YouTube queries with album and featured artists before fallback", () => {
  const queries = youtubeProviderSearchQueries({
    album: "Church Moments",
    artists: ["Gateway Worship", "Matthew Harris", "Jessie Harris"],
    name: "Open The Eyes Of My Heart"
  });

  assert.deepEqual(queries, [
    "Open The Eyes Of My Heart Gateway Worship Matthew Harris Jessie Harris Church Moments",
    "Open The Eyes Of My Heart Gateway Worship Matthew Harris official audio"
  ]);
});

test("keeps the shared provider query compact by default", () => {
  const query = providerSearchQuery({
    album: "Church Moments",
    artists: ["Gateway Worship", "Matthew Harris", "Jessie Harris"],
    name: "Open The Eyes Of My Heart"
  });

  assert.equal(query, "Open The Eyes Of My Heart Gateway Worship Matthew Harris");
});

test("does not add placeholder album names to provider queries", () => {
  const queries = youtubeProviderSearchQueries({
    album: "Unknown Album",
    artists: ["Example Artist"],
    name: "Example Song"
  });

  assert.deepEqual(queries, [
    "Example Song Example Artist",
    "Example Song Example Artist official audio"
  ]);
});
