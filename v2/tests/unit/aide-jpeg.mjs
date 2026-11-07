// @ts-nocheck — fabrique de JPEG de test (aucune logique de l'application) : typage non utile ici.
/** JPEG minimal avec EXIF (TIFF petit-boutiste) : marque, modèle, orientation, date, décalage, focale, GPS. */
export function jpegExif({ make = 'Google', orient = 1, dir = 120, lat = 48.6459, lon = -2.0281, f35 = 24, date = '2026:10:25 12:22:30', offset = '+02:00' } = {}) {
  const dataBytes = []; let dataBase = 0;
  const addData = (bytes) => { const o = dataBase + dataBytes.length; dataBytes.push(...bytes); return o; };
  const u16 = (n) => [n & 255, n >> 8], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const ascii = (s) => [...Buffer.from(s + '\0', 'latin1')];
  const rat = (a, b) => [...u32(a), ...u32(b)];
  const ifdBytes = (list, nextOff = 0) => { list.sort((x, y) => x.tag - y.tag); return [...u16(list.length), ...list.flatMap((e) => [...u16(e.tag), ...u16(e.type), ...u32(e.cnt), ...e.val]), ...u32(nextOff)]; };
  // disposition : [en-tête 8][IFD0][EXIF][GPS][données]
  const ent = (tag, type, cnt, val) => ({ tag, type, cnt, val });
  const pad4 = (b) => [...b, ...new Array(Math.max(0, 4 - b.length)).fill(0)];
  const ifd0N = 5, exN = 4, gpsN = 7;
  const ifd0Len = 2 + ifd0N * 12 + 4, exLen = 2 + exN * 12 + 4, gpsLen = 2 + gpsN * 12 + 4;
  dataBase = 8 + ifd0Len + exLen + gpsLen;
  const dms = (v) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return addData([...rat(d, 1), ...rat(m, 1), ...rat(Math.round(s * 1000), 1000)]); };
  const oMake = addData(ascii(make)), oModel = addData(ascii('Pixel 8')), oDate = addData(ascii(date)), oOff = addData(ascii(offset));
  const ifd0 = ifdBytes([
    ent(0x010F, 2, make.length + 1, u32(oMake)), ent(0x0110, 2, 8, u32(oModel)), ent(0x0112, 3, 1, pad4(u16(orient))),
    ent(0x8769, 4, 1, u32(8 + ifd0Len)), ent(0x8825, 4, 1, u32(8 + ifd0Len + exLen)),
  ]);
  const ex = ifdBytes([
    ent(0x9003, 2, date.length + 1, u32(oDate)), ent(0x9011, 2, offset.length + 1, u32(oOff)), ent(0xA405, 3, 1, pad4(u16(f35))),
    ent(0xA002, 3, 1, pad4(u16(4000))),
  ]);
  const oLat = dms(lat), oLon = dms(lon), oDir = addData(rat(Math.round(dir * 100), 100));
  const gps = ifdBytes([
    ent(1, 2, 2, pad4(ascii(lat < 0 ? 'S' : 'N'))), ent(2, 5, 3, u32(oLat)), ent(3, 2, 2, pad4(ascii(lon < 0 ? 'W' : 'E'))), ent(4, 5, 3, u32(oLon)),
    ent(0x10, 2, 2, pad4(ascii('T'))), ent(0x11, 5, 1, u32(oDir)), ent(0x1D, 2, 11, u32(addData(ascii('2026:10:25')))),
  ]);
  const tiff = [0x49, 0x49, 42, 0, 8, 0, 0, 0, ...ifd0, ...ex, ...gps, ...dataBytes];
  const app1 = [...Buffer.from('Exif\0\0', 'latin1'), ...tiff];
  const len = app1.length + 2;
  return Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255, ...app1, 0xFF, 0xD9]).buffer;
}

