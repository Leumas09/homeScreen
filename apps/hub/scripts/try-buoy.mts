import { buoy } from "../src/sources/sea.ts";
const b = await buoy.run({} as any);
console.log(b.station, b.lat, b.lon, "latest", b.latest && new Date(b.latest.t * 1000).toISOString(), b.latest, "series", b.series.length);
