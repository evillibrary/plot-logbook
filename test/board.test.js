// The whiteboard's geometry: thinning a stroke, telling a loop, measuring, rubbing out, a mark made
// a plan, and the file a board is kept in. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { simplify, closes, measure, measureText, nearMark, markGeom, strokeMark, boardText, parseBoard, emptyBoard } from "../js/board.js";

const circle = (r, n = 48) => Array.from({ length: n + 1 }, (_, i) => [r * Math.cos(i / n * 2 * Math.PI), r * Math.sin(i / n * 2 * Math.PI)]);

test("a stroke is thinned to the points that keep its shape", () => {
  const wobbly = Array.from({ length: 50 }, (_, i) => [i, (i % 2) * 0.01]);
  assert.deepEqual(simplify(wobbly, 0.05), [[0, 0], [49, 0.01]]);
  const corner = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]];
  assert.deepEqual(simplify(corner, 0.1), [[0, 0], [10, 0], [10, 10]]);
  assert.ok(simplify(circle(10), 0.1).length > 12, "a circle stays round");
});

test("a stroke that comes back to its start is a loop, with an area and a length round it", () => {
  assert.ok(closes(circle(10), 1));
  assert.ok(!closes([[0, 0], [10, 0], [10, 0.5], [0, 0.6]], 1), "a hairpin is not a loop: it never went far");
  assert.ok(!closes([[0, 0], [10, 0], [20, 0], [30, 0]], 1));
  const sq = { tool: "pen", closed: true, xy: [[0, 0], [10, 0], [10, 20], [0, 20]] };
  assert.deepEqual(measure(sq), { length: 60, area: 200, closed: true });
  assert.equal(measureText(measure(sq)), "200 m² inside · 60 m round");
  assert.equal(measureText(measure({ tool: "ruler", xy: [[0, 0], [3, 4]] })), "5.0 m");
  assert.equal(measure({ tool: "text", xy: [[0, 0]] }), null);
});

test("rubbing out finds a mark within reach, its width counted", () => {
  const pen = { tool: "pen", xy: [[0, 0], [10, 0]] }, track = { tool: "track", w: 4, xy: [[0, 0], [10, 0]] };
  assert.ok(nearMark(pen, [5, 0.5], 1));
  assert.ok(!nearMark(pen, [5, 1.5], 1));
  assert.ok(nearMark(track, [5, 2.9], 1), "a 4 m track reaches 2 m either side");
  assert.ok(nearMark({ tool: "brush", w: 20, xy: [[0, 0], [10, 0]] }, [5, 1.4], 1, 20), "a 20 px brush at 20 px a metre reaches half a metre");
  assert.ok(nearMark({ tool: "pen", closed: true, xy: [[0, 0], [10, 0], [10, 10], [0, 10]] }, [0, 5], 0.5), "a loop's closing side counts");
  assert.ok(nearMark({ tool: "text", xy: [[0, 0]] }, [1, 1], 1));
});

test("a mark made a plan: a line, or an area from a loop, to the centimetre", () => {
  assert.deepEqual(markGeom({ tool: "pen", xy: [[0, 0], [5.004, 0.001], [10.004, 0]] }), { type: "LineString", xy: [[0, 0], [10, 0]] });
  const g = markGeom({ tool: "brush", closed: true, xy: circle(20, 300).slice(0, -1) });
  assert.equal(g.type, "Polygon");
  assert.deepEqual(g.xy[0], g.xy.at(-1), "a closed ring");
  assert.ok(g.xy.length <= 61, `no more than 60 corners, got ${g.xy.length - 1}`);
  assert.equal(markGeom({ tool: "text", xy: [[0, 0]] }), null);
});

test("a finished stroke: too small to be one, a loop, a ruler", () => {
  const o = { sheet: "s", colour: "red", track: 3, pxPerM: 10 };
  assert.equal(strokeMark({ tool: "pen", pts: [[0, 0], [0.1, 0]], moved: 1 }, o), null, "a tap with the pen draws nothing");
  const loop = strokeMark({ tool: "track", pts: circle(10), moved: 600 }, o);
  assert.ok(loop.closed && loop.w === 3 && loop.tool === "track");
  assert.notDeepEqual(loop.xy[0], loop.xy.at(-1), "a loop is kept open: its last point is not its first again");
  const r = strokeMark({ tool: "ruler", pts: [[0, 0], [3.333, 4.444]], moved: 50 }, o);
  assert.deepEqual(r.xy, [[0, 0], [3.33, 4.44]]);
  assert.equal(strokeMark({ tool: "ruler", pts: [[0, 0]], moved: 0 }, o), null);
});

test("a board's file reads back as it was written", () => {
  const b = { ...emptyBoard(), marks: [{ id: "m_1", sheet: "s_sketch", tool: "pen", colour: "red", w: 3, xy: [[1, 2], [3, 4]], at: "t" }] };
  const back = parseBoard(boardText(b, { device: "dev-1", author: "Someone" }));
  assert.equal(back.device, "dev-1"); assert.equal(back.by, "Someone");
  assert.deepEqual(back.marks, b.marks); assert.deepEqual(back.sheets, b.sheets);
  assert.deepEqual(parseBoard(JSON.stringify({ device: "x", marks: [{ xy: [] }, null, { id: "ok", xy: [[0, 0]] }] })).marks, [{ id: "ok", xy: [[0, 0]] }], "marks with nowhere to be are dropped");
});
