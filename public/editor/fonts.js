// Nạp font Be Vietnam Pro (tự host, giấy phép OFL) cho cả trang lẫn Web Worker.
// Phải nạp xong trước khi vẽ frame đầu, nếu không chữ tiếng Việt sẽ ra font dự phòng.

const FAMILY = "Be Vietnam Pro";
const SUBSETS = {
  vietnamese: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};
const WEIGHTS = [600, 800];

let pending = null;

// fontSet: document.fonts (trang) hoặc self.fonts (worker). Trả true nếu nạp đủ, false nếu phải dùng font hệ thống.
export function loadFonts(fontSet) {
  pending ??= (async () => {
    try {
      const faces = [];
      for (const [subset, unicodeRange] of Object.entries(SUBSETS)) {
        for (const weight of WEIGHTS) {
          faces.push(new FontFace(FAMILY, `url(/fonts/be-vietnam-pro-${subset}-${weight}-normal.woff2)`, { weight: String(weight), style: "normal", unicodeRange }));
        }
      }
      await Promise.all(faces.map((f) => f.load()));
      for (const f of faces) fontSet.add(f);
      return true;
    } catch {
      return false;
    }
  })();
  return pending;
}
