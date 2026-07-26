import { describe, expect, it } from "vitest";
import { extractUberTripLocations, isOutsideOttawaAndToronto } from "./uberLocation";

describe("extractUberTripLocations", () => {
  it("extracts pickup and drop-off city/address from a typical Uber receipt", () => {
    const text = `
Thanks for riding, Firas
8:03 AM | 123 King St W, Toronto, ON
8:22 AM | 456 Queen St, Toronto, ON
Total: $18.42
`;
    const result = extractUberTripLocations(text);
    expect(result.pickupCity).toBe("Toronto");
    expect(result.dropoffCity).toBe("Toronto");
    expect(result.pickupAddress).toContain("123 King St W");
    expect(result.tripCountry).toBe("Canada");
  });

  it("extracts a US city and sets country to United States", () => {
    const text = `
789 5th Ave, New York, NY
101 Broadway, New York, NY
`;
    const result = extractUberTripLocations(text);
    expect(result.pickupCity).toBe("New York");
    expect(result.tripCountry).toBe("United States");
  });

  it("returns an empty object when no recognizable location is present", () => {
    expect(extractUberTripLocations("Thanks for riding with us. Total: $12.00")).toEqual({});
  });
});

describe("isOutsideOttawaAndToronto", () => {
  it("returns false when the pickup city is Toronto", () => {
    expect(isOutsideOttawaAndToronto({ pickupCity: "Toronto", dropoffCity: "Vancouver" })).toBe(false);
  });

  it("returns false when the drop-off city is Ottawa", () => {
    expect(isOutsideOttawaAndToronto({ pickupCity: "Montreal", dropoffCity: "Ottawa" })).toBe(false);
  });

  it("returns true when neither pickup nor drop-off is Ottawa or Toronto", () => {
    expect(isOutsideOttawaAndToronto({ pickupCity: "Vancouver", dropoffCity: "Vancouver" })).toBe(true);
  });

  it("is case-insensitive when comparing city names", () => {
    expect(isOutsideOttawaAndToronto({ pickupCity: "TORONTO" })).toBe(false);
  });

  it("returns undefined (unknown) when no city could be extracted", () => {
    expect(isOutsideOttawaAndToronto({})).toBeUndefined();
  });
});
