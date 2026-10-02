// Clickable hotspots for /public/standmap.jpg. Coordinates are in the 2000x1426
// space the image was traced in (the JPG itself is 2551x1819 — same aspect ratio),
// so the SVG overlay uses viewBox "0 0 2000 1426". Hand-traced: open the Stand Map
// page with ?debug=1 to see every outline and nudge any that sit off their cell.

export const STAND_MAP_WIDTH = 2000;
export const STAND_MAP_HEIGHT = 1426;

type Pt = [number, number];
type Line = Pt[]; // polyline, ascending x

const yAt = (line: Line, x: number): number => {
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    if (x <= x1 || i === line.length - 2) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return line[0][1];
};

// A row of side-by-side stands between two edge lines, split at the given x values.
function strip(keys: string[], xs: number[], top: Line, bottom: Line): Record<string, Pt[]> {
  const out: Record<string, Pt[]> = {};
  keys.forEach((key, i) => {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    out[key] = [
      [x0, yAt(top, x0)],
      [x1, yAt(top, x1)],
      [x1, yAt(bottom, x1)],
      [x0, yAt(bottom, x0)],
    ].map(([x, y]) => [Math.round(x), Math.round(y)] as Pt);
  });
  return out;
}

const keys = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

export const STAND_SHAPES: Record<string, Pt[]> = {
  // Top row 1–17
  ...strip(
    keys(1, 17),
    [108, 187, 259, 345, 420, 518, 622, 688, 757, 838, 907, 974, 1054, 1122, 1198, 1260, 1323, 1440],
    [[108, 326], [1420, 230]],
    [[108, 390], [520, 349], [1460, 322]],
  ),

  // 30–32 (angled, left edge)
  '30': [[27, 423], [108, 392], [160, 435], [68, 462]],
  '31': [[68, 462], [160, 435], [213, 478], [152, 521]],
  '32': [[152, 521], [213, 478], [238, 555], [170, 582]],

  // Block 29–25 over 33–39
  ...strip(['29', '28', '27', '26', '25'], [362, 438, 517, 600, 674, 735], [[362, 404], [735, 386]], [[362, 463], [735, 460]]),
  '33': [[235, 470], [308, 470], [308, 531], [278, 531]],
  ...strip(['34', '35', '36', '37', '38', '39'], [308, 365, 440, 519, 601, 676, 735], [[308, 468], [735, 460]], [[308, 531], [735, 520]]),

  // Block 24–21 over 40–43
  ...strip(['24', '23', '22', '21'], [760, 857, 933, 1018, 1088], [[760, 386], [1088, 378]], [[760, 458], [1088, 452]]),
  ...strip(['40', '41', '42', '43'], [760, 860, 934, 1020, 1088], [[760, 458], [1088, 452]], [[760, 521], [1088, 513]]),

  // Block 20–18 over 44–47
  ...strip(['20', '19', '18'], [1190, 1280, 1356, 1496], [[1190, 376], [1496, 370]], [[1190, 433], [1510, 428]]),
  ...strip(['44', '45', '46', '47'], [1148, 1265, 1356, 1424, 1527], [[1148, 436], [1510, 428]], [[1148, 510], [1545, 498]]),

  // Block 62–57 over 63–66
  ...strip(['62', '61', '60', '59', '58', '57'], [300, 368, 444, 526, 616, 680, 746], [[300, 575], [746, 570]], [[300, 642], [746, 640]]),
  '63': [[300, 642], [433, 642], [435, 714], [358, 714]],
  ...strip(['64', '65', '66'], [433, 532, 646, 750], [[433, 642], [750, 640]], [[435, 714], [750, 707]]),

  // Block 56–53 over 67–70
  ...strip(['56', '55', '54', '53'], [772, 862, 949, 1030, 1097], [[772, 568], [1097, 565]], [[772, 642], [1100, 640]]),
  ...strip(['67', '68', '69', '70'], [772, 863, 950, 1030, 1105], [[772, 642], [1100, 640]], [[772, 706], [1105, 700]]),

  // Block 52–48 over 71–74
  ...strip(['52', '51', '50', '49', '48'], [1165, 1238, 1322, 1396, 1462, 1590], [[1165, 563], [1568, 552]], [[1165, 632], [1600, 628]]),
  ...strip(['71', '72', '73', '74'], [1165, 1236, 1362, 1495, 1625], [[1165, 632], [1600, 628]], [[1165, 703], [1627, 690]]),

  // Block 80–75 over 81–87, plus 88 down the right edge
  ...strip(['80', '79', '78', '77', '76', '75'], [1168, 1238, 1298, 1372, 1442, 1503, 1632], [[1168, 752], [1655, 740]], [[1168, 812], [1632, 802]]),
  ...strip(['81', '82', '83', '84', '85', '86', '87'], [1168, 1240, 1315, 1370, 1438, 1503, 1572, 1640], [[1168, 812], [1632, 802]], [[1190, 886], [1642, 874]]),
  '88': [[1625, 740], [1655, 740], [1712, 870], [1642, 874], [1632, 802]],
};

export const STAND_NUMBERS = Object.keys(STAND_SHAPES);
