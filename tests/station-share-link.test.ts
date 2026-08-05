import { describe, expect, test } from "bun:test";
import { decodeAddressPointer } from "applesauce-core/helpers/pointers";
import {
  buildNativeShareData,
  normalizeStationRouteParam,
} from "../src/lib/share";

const NADDR =
  "naddr1qvzqqqr6q5pzqgg0xxmqr866uy7fjhyds0a2gxsjnuffdppwfse382u2f2asn5dzqqjxzvmzvccnzdrr943nqvp3956xxdpn95unvd3495cnwdpcvsekge3s8yens337ke5";

describe("station share links", () => {
  test("keeps prose before the URL in the native share payload", () => {
    const payload = buildNativeShareData({
      url: `http://localhost:3000/station/${NADDR}`,
      title: "Black Rhino Radio",
      text: "Listen to Black Rhino Radio on WaveFunc",
    });

    expect(payload).toEqual({
      title: "Black Rhino Radio",
      text: `Listen to Black Rhino Radio on WaveFunc\nhttp://localhost:3000/station/${NADDR}`,
    });
  });

  test("recovers the station pointer from already-shared malformed links", () => {
    const malformed = `${NADDR}%20Listen%20to%20Black%20Rhino%20Radio%20on%20WaveFunc`;
    const normalized = normalizeStationRouteParam(malformed);
    expect(normalized).toBe(NADDR);
    expect(decodeAddressPointer(normalized)).not.toBeNull();
    expect(
      normalizeStationRouteParam(
        `${NADDR} Listen to Black Rhino Radio on WaveFunc`,
      ),
    ).toBe(NADDR);
  });
});
